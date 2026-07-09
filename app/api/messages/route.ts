import { NextResponse } from 'next/server';
import { queryAll, query, queryOne } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

// GET all messages with replies and reactions
export async function GET(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentPlayerId = (session.user as any)?.playerId;

    const messages = await queryAll(
      `SELECT m.id, m.content, m.createdAt, m.updatedAt, m.referencedStatId, m.referencedPlayerId,
              p.id as authorId, p.username as authorName,
              s.code as statCode, s.label as statLabel,
              sv.value as statValue,
              rp.username as referencedPlayerName
       FROM Message m
       JOIN Player p ON m.authorId = p.id
       LEFT JOIN Stat s ON m.referencedStatId = s.id
       LEFT JOIN StatValue sv ON m.referencedStatId = sv.statId AND m.referencedPlayerId = sv.playerId
       LEFT JOIN Player rp ON m.referencedPlayerId = rp.id
       ORDER BY m.createdAt DESC`
    );

    // Get replies for each message
    const messagesWithData = await Promise.all(
      messages.map(async (message: any) => {
        const replies = await queryAll(
          `SELECT mr.id, mr.content, mr.createdAt, mr.updatedAt,
                  p.id as authorId, p.username as authorName
           FROM MessageReply mr
           JOIN Player p ON mr.authorId = p.id
           WHERE mr.messageId = ?
           ORDER BY mr.createdAt ASC`,
          [message.id]
        );

        const reactions = await queryAll(
          `SELECT emoji, COUNT(*) as count, GROUP_CONCAT(userId) as userIds
           FROM MessageReaction
           WHERE messageId = ?
           GROUP BY emoji`,
          [message.id]
        );

        const mentions = await queryAll(
          `SELECT type, targetId FROM MessageMention WHERE messageId = ?`,
          [message.id]
        );

        // Enrich evidence mentions so the board can render embeds directly
        const evidenceRefs: any[] = [];
        for (const mention of mentions as any[]) {
          if (String(mention.type) !== 'evidence') continue;
          const evidence = await queryAll(
            `SELECT e.id, e.mediaUrl, e.mediaType, e.caption, e.captionHidden,
                    p.username as posterName
             FROM Evidence e JOIN Player p ON e.playerId = p.id
             WHERE e.id = ?`,
            [mention.targetId]
          );
          if (evidence.length > 0) {
            const ev: any = evidence[0];
            evidenceRefs.push({
              id: String(ev.id),
              mediaUrl: ev.mediaUrl || null,
              mediaType: ev.mediaType || null,
              caption: Number(ev.captionHidden) ? null : ev.caption || null,
              posterName: String(ev.posterName),
            });
          }
        }

        return {
          ...message,
          isAuthor: message.authorId === currentPlayerId,
          replies: replies.map((r: any) => ({
            ...r,
            isAuthor: r.authorId === currentPlayerId,
          })),
          reactions,
          mentions,
          evidenceRefs,
        };
      })
    );

    return NextResponse.json(messagesWithData);
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages', details: error.message },
      { status: 500 }
    );
  }
}

// POST a new message
export async function POST(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, mentions, referencedStatId, referencedPlayerId } = body;
    const authorId = (session.user as any)?.playerId;

    if (!authorId || !content?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const messageId = uuid();
    const now = new Date().toISOString();

    // Create message with optional stat reference
    await query(
      `INSERT INTO Message (id, content, authorId, referencedStatId, referencedPlayerId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [messageId, content, authorId, referencedStatId || null, referencedPlayerId || null, now, now]
    );

    // Add mentions if provided
    if (mentions && Array.isArray(mentions)) {
      for (const mention of mentions) {
        await query(
          `INSERT INTO MessageMention (id, messageId, type, targetId, createdAt)
           VALUES (?, ?, ?, ?, ?)`,
          [uuid(), messageId, mention.type, mention.targetId, now]
        );
      }
    }

    return NextResponse.json({
      success: true,
      messageId,
      createdAt: now,
    });
  } catch (error: any) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message', details: error.message },
      { status: 500 }
    );
  }
}

// PUT to edit a message
export async function PUT(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, content } = body;
    const authorId = (session.user as any)?.playerId;

    if (!messageId || !content?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify the message exists and user is the author
    const message = await queryOne(
      'SELECT authorId FROM Message WHERE id = ?',
      [messageId]
    );

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.authorId !== authorId) {
      return NextResponse.json(
        { error: 'You can only edit your own messages' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    await query(
      'UPDATE Message SET content = ?, updatedAt = ? WHERE id = ?',
      [content, now, messageId]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error editing message:', error);
    return NextResponse.json(
      { error: 'Failed to edit message', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE a message
export async function DELETE(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { messageId } = body;
    const authorId = (session.user as any)?.playerId;

    if (!messageId) {
      return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });
    }

    // Verify the message exists and user is the author
    const message = await queryOne(
      'SELECT authorId FROM Message WHERE id = ?',
      [messageId]
    );

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.authorId !== authorId) {
      return NextResponse.json(
        { error: 'You can only delete your own messages' },
        { status: 403 }
      );
    }

    // Delete associated data in order to respect foreign keys
    await query('DELETE FROM MessageRead WHERE messageId = ?', [messageId]);
    await query('DELETE FROM MessageReaction WHERE messageId = ?', [messageId]);
    await query('DELETE FROM MessageReply WHERE messageId = ?', [messageId]);
    await query('DELETE FROM MessageMention WHERE messageId = ?', [messageId]);
    await query('DELETE FROM Message WHERE id = ?', [messageId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting message:', error);
    return NextResponse.json(
      { error: 'Failed to delete message', details: error.message },
      { status: 500 }
    );
  }
}

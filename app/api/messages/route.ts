import { NextResponse } from 'next/server';
import { queryAll, query, queryOne } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { featureLockMessage } from '@/lib/featureLocks';
import { recordMentions } from '@/lib/mentionsServer';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/** Messages on the first load; "Show older" asks for MORE at a time. */
const INITIAL_MESSAGES = 20;
const MORE_MESSAGES = 50;

/** A row as libsql returns it: column name → value. */
type Row = Record<string, unknown>;

interface EvidenceRef {
  id: string;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  posterName: string;
}

/**
 * GET the board.
 *
 * This used to return EVERY message with no limit, then run three or four
 * more queries per message for its replies, reactions, mentions and any
 * embedded evidence — roughly 1,200 round trips for a 250-message board, on a
 * five-second timer. It is now a fixed five queries regardless of page size,
 * each fetching its slice with one `IN (...)`, and the board itself is paged.
 */
export async function GET(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentPlayerId = (session.user as any)?.playerId;

    const { searchParams } = new URL(request.url);
    const requested = Number(searchParams.get('limit'));
    const limit =
      Number.isFinite(requested) && requested > 0 ? Math.min(requested, 500) : INITIAL_MESSAGES;

    const messages = (await queryAll(
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
       ORDER BY m.createdAt DESC
       LIMIT ?`,
      [limit]
    )) as any[];

    const totalRow = await queryOne('SELECT COUNT(*) as c FROM Message');
    const total = Number(totalRow?.c) || 0;

    const ids = messages.map((m) => String(m.id));
    const holes = ids.map(() => '?').join(',');
    const empty = ids.length === 0;

    // Three queries for the whole page instead of three per message.
    const [replyRows, reactionRows, mentionRows] = empty
      ? [[], [], []]
      : await Promise.all([
          queryAll(
            `SELECT mr.messageId, mr.id, mr.content, mr.createdAt, mr.updatedAt,
                    p.id as authorId, p.username as authorName
             FROM MessageReply mr
             JOIN Player p ON mr.authorId = p.id
             WHERE mr.messageId IN (${holes})
             ORDER BY mr.createdAt ASC`,
            ids
          ),
          queryAll(
            `SELECT messageId, emoji, COUNT(*) as count, GROUP_CONCAT(userId) as userIds
             FROM MessageReaction
             WHERE messageId IN (${holes})
             GROUP BY messageId, emoji`,
            ids
          ),
          queryAll(
            `SELECT messageId, type, targetId FROM MessageMention
             WHERE messageId IN (${holes})`,
            ids
          ),
        ]);

    /** Bucket rows by the message they belong to, in one pass each. */
    const group = (rows: Row[]) => {
      const map = new Map<string, Row[]>();
      for (const r of rows) {
        const key = String(r.messageId);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
      }
      return map;
    };
    const repliesBy = group(replyRows as Row[]);
    const reactionsBy = group(reactionRows as Row[]);
    const mentionsBy = group(mentionRows as Row[]);

    // Every embedded evidence post on the page, fetched once.
    const evidenceIds = [
      ...new Set(
        (mentionRows as Row[])
          .filter((m) => String(m.type) === 'evidence')
          .map((m) => String(m.targetId))
      ),
    ];
    const evidenceById = new Map<string, EvidenceRef>();
    if (evidenceIds.length > 0) {
      const evHoles = evidenceIds.map(() => '?').join(',');
      const evRows = (await queryAll(
        `SELECT e.id, e.mediaUrl, e.mediaType, e.caption, e.captionHidden,
                p.username as posterName
         FROM Evidence e JOIN Player p ON e.playerId = p.id
         WHERE e.id IN (${evHoles})`,
        evidenceIds
      )) as Row[];
      for (const ev of evRows) {
        evidenceById.set(String(ev.id), {
          id: String(ev.id),
          mediaUrl: (ev.mediaUrl as string) || null,
          mediaType: (ev.mediaType as string) || null,
          caption: Number(ev.captionHidden) ? null : (ev.caption as string) || null,
          posterName: String(ev.posterName),
        });
      }
    }

    const messagesWithData = messages.map((message) => {
      const mentions = (mentionsBy.get(String(message.id)) || []).map((m) => ({
        type: m.type,
        targetId: m.targetId,
      }));

      // Structured milestone (tier-up / category) for a celebratory card
      let milestone: any = null;
      for (const mention of mentions) {
        if (String(mention.type) !== 'milestone') continue;
        try {
          milestone = JSON.parse(String(mention.targetId));
        } catch {
          /* malformed — fall back to plain content */
        }
      }

      const evidenceRefs = mentions
        .filter((m) => String(m.type) === 'evidence')
        .map((m) => evidenceById.get(String(m.targetId)))
        .filter((e): e is EvidenceRef => Boolean(e));

      return {
        ...message,
        isAuthor: message.authorId === currentPlayerId,
        replies: (repliesBy.get(String(message.id)) || []).map((r) => ({
          id: r.id,
          content: r.content,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          authorId: r.authorId,
          authorName: r.authorName,
          isAuthor: r.authorId === currentPlayerId,
        })),
        reactions: (reactionsBy.get(String(message.id)) || []).map((r) => ({
          emoji: r.emoji,
          count: r.count,
          userIds: r.userIds,
        })),
        mentions,
        evidenceRefs,
        milestone,
      };
    });

    return NextResponse.json({
      messages: messagesWithData,
      total,
      hasMore: messages.length < total,
      nextLimit: messages.length < total ? messages.length + MORE_MESSAGES : null,
    });
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      errorPayload('Failed to fetch messages', error),
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

    const lockMsg = await featureLockMessage(String(authorId), 'messages');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

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

    // @mentions in the body → notify + record for the bell
    const author = await queryOne('SELECT username FROM Player WHERE id = ?', [authorId]);
    recordMentions({
      content: String(content),
      byId: String(authorId),
      byName: String(author?.username || 'Someone'),
      context: 'message',
      url: '/messages',
    });

    return NextResponse.json({
      success: true,
      messageId,
      createdAt: now,
    });
  } catch (error: any) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      errorPayload('Failed to create message', error),
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
      errorPayload('Failed to edit message', error),
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
      errorPayload('Failed to delete message', error),
      { status: 500 }
    );
  }
}

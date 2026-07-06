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

    const messages = await queryAll(
      `SELECT m.id, m.content, m.createdAt, m.updatedAt,
              p.id as authorId, p.username as authorName
       FROM Message m
       JOIN Player p ON m.authorId = p.id
       ORDER BY m.createdAt DESC`
    );

    // Get replies for each message
    const messagesWithData = await Promise.all(
      messages.map(async (message: any) => {
        const replies = await queryAll(
          `SELECT mr.id, mr.content, mr.createdAt,
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

        return {
          ...message,
          replies,
          reactions,
          mentions,
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
    const { content, mentions } = body;
    const authorId = (session.user as any)?.playerId;

    if (!authorId || !content?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const messageId = uuid();
    const now = new Date().toISOString();

    // Create message
    await query(
      `INSERT INTO Message (id, content, authorId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [messageId, content, authorId, now, now]
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

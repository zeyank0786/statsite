import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { featureLockMessage } from '@/lib/featureLocks';
import { recordMentions } from '@/lib/mentionsServer';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content } = body;
    const authorId = (session.user as any)?.playerId;

    if (!authorId || !content?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const lockMsg = await featureLockMessage(String(authorId), 'messages');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    // Verify message exists
    const message = await queryOne(
      'SELECT id FROM Message WHERE id = ?',
      [messageId]
    );

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const replyId = uuid();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO MessageReply (id, messageId, content, authorId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [replyId, messageId, content, authorId, now, now]
    );

    const author = await queryOne('SELECT username FROM Player WHERE id = ?', [authorId]);
    recordMentions({
      content: String(content),
      byId: String(authorId),
      byName: String(author?.username || 'Someone'),
      context: 'reply',
      url: '/messages',
    });

    return NextResponse.json({
      success: true,
      replyId,
      createdAt: now,
    });
  } catch (error: any) {
    console.error('Error creating reply:', error);
    return NextResponse.json(
      errorPayload('Failed to create reply', error),
      { status: 500 }
    );
  }
}

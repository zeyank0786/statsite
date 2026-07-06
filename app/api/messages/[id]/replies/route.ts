import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

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

    return NextResponse.json({
      success: true,
      replyId,
      createdAt: now,
    });
  } catch (error: any) {
    console.error('Error creating reply:', error);
    return NextResponse.json(
      { error: 'Failed to create reply', details: error.message },
      { status: 500 }
    );
  }
}

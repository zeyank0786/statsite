import { NextResponse } from 'next/server';
import { queryOne, query, queryAll } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

// GET unread message count for current user
export async function GET(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any)?.playerId;

    const result = await queryOne(
      `SELECT COUNT(*) as count FROM Message m
       WHERE m.id NOT IN (
         SELECT messageId FROM MessageRead WHERE userId = ?
       )`,
      [userId]
    );

    return NextResponse.json({
      unreadCount: result?.count || 0,
    });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unread count', details: error.message },
      { status: 500 }
    );
  }
}

// POST to mark messages as read
export async function POST(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any)?.playerId;
    const body = await request.json();
    const { messageIds } = body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid messageIds' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Mark each message as read (ignore if already read due to UNIQUE constraint)
    for (const messageId of messageIds) {
      await query(
        `INSERT OR IGNORE INTO MessageRead (id, messageId, userId, readAt)
         VALUES (?, ?, ?, ?)`,
        [uuid(), messageId, userId, now]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking messages as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark messages as read', details: error.message },
      { status: 500 }
    );
  }
}

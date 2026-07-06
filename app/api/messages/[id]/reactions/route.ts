import { NextResponse } from 'next/server';
import { query, queryOne, queryAll } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

// POST a reaction (like/emoji)
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
    const { emoji } = body;
    const userId = (session.user as any)?.playerId;

    if (!userId || !emoji) {
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

    // Check if user already reacted with this emoji
    const existing = await queryOne(
      'SELECT id FROM MessageReaction WHERE messageId = ? AND userId = ? AND emoji = ?',
      [messageId, userId, emoji]
    );

    if (existing) {
      // Remove the reaction (toggle)
      await query(
        'DELETE FROM MessageReaction WHERE messageId = ? AND userId = ? AND emoji = ?',
        [messageId, userId, emoji]
      );
      return NextResponse.json({ success: true, action: 'removed' });
    } else {
      // Add the reaction
      await query(
        `INSERT INTO MessageReaction (id, messageId, userId, emoji, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [uuid(), messageId, userId, emoji, new Date().toISOString()]
      );
      return NextResponse.json({ success: true, action: 'added' });
    }
  } catch (error: any) {
    console.error('Error toggling reaction:', error);
    return NextResponse.json(
      { error: 'Failed to toggle reaction', details: error.message },
      { status: 500 }
    );
  }
}

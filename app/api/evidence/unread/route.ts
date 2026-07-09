import { NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Unread tracking for the evidence board, mirroring /api/messages/unread.
 * The EvidenceRead table is created on demand (additive, safe) so no manual
 * migration is needed.
 */
async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS EvidenceRead (
       id         TEXT PRIMARY KEY,
       evidenceId TEXT NOT NULL,
       userId     TEXT NOT NULL,
       readAt     TEXT NOT NULL,
       UNIQUE(evidenceId, userId)
     )`
  );
}

// GET unread evidence count for the current user (own posts never count)
export async function GET() {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = (session.user as any)?.playerId;
    if (!userId) return NextResponse.json({ unreadCount: 0 });

    await ensureTable();
    const result = await queryOne(
      `SELECT COUNT(*) as count FROM Evidence e
       WHERE e.playerId != ?
         AND e.id NOT IN (SELECT evidenceId FROM EvidenceRead WHERE userId = ?)`,
      [userId, userId]
    );

    return NextResponse.json({ unreadCount: Number(result?.count) || 0 });
  } catch (error: any) {
    console.error('Error fetching unread evidence count:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unread evidence count', details: error.message },
      { status: 500 }
    );
  }
}

// POST to mark evidence posts as read
export async function POST(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = (session.user as any)?.playerId;
    if (!userId) return NextResponse.json({ error: 'No linked player' }, { status: 400 });

    const { evidenceIds } = await request.json();
    if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
      return NextResponse.json({ error: 'Invalid evidenceIds' }, { status: 400 });
    }

    await ensureTable();
    const now = new Date().toISOString();
    for (const evidenceId of evidenceIds) {
      await query(
        'INSERT OR IGNORE INTO EvidenceRead (id, evidenceId, userId, readAt) VALUES (?, ?, ?, ?)',
        [uuid(), evidenceId, userId, now]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking evidence as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark evidence as read', details: error.message },
      { status: 500 }
    );
  }
}

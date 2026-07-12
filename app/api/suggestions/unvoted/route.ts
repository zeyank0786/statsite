import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { getLocksForPlayer } from '@/lib/featureLocks';

export const dynamic = 'force-dynamic';

/**
 * How many pending suggestions are waiting on YOUR vote — powers the
 * Suggestions nav badge. You owe a vote when the suggestion is pending,
 * you're not the subject, you're active and not vote-locked, and you
 * haven't cast a vote yet.
 */
export async function GET() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const me = await queryOne('SELECT active FROM Player WHERE id = ?', [playerId]);
    if (!me || !Number(me.active)) return NextResponse.json({ unvotedCount: 0 });

    const locks = await getLocksForPlayer(String(playerId));
    if (locks.has('vote')) return NextResponse.json({ unvotedCount: 0 });

    const row = await queryOne(
      `SELECT COUNT(*) as c FROM Suggestion s
       WHERE s.status = 'pending'
         AND s.playerId != ?
         AND NOT EXISTS (SELECT 1 FROM Vote v WHERE v.suggestionId = s.id AND v.userId = ?)`,
      [playerId, playerId]
    );

    return NextResponse.json({ unvotedCount: Number(row?.c) || 0 });
  } catch (error: any) {
    console.error('Error counting unvoted suggestions:', error);
    return NextResponse.json({ error: 'Failed to count', details: error.message }, { status: 500 });
  }
}

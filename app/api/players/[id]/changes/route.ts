import { NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Find the most recent closed review session for this player
    const lastReviewSession = await queryOne(
      `SELECT id, closedAt FROM ReviewSession
       WHERE targetPlayerId = ? AND status = 'in_progress'
       ORDER BY closedAt DESC LIMIT 1`,
      [id]
    );

    if (!lastReviewSession) {
      return NextResponse.json([]);
    }

    // Get all stat changes that occurred during that review session
    const changes = await queryAll(
      `SELECT
        s.code,
        sv.statId,
        sv.value as currentValue,
        sh.oldValue as lastReviewValue
       FROM StatValue sv
       JOIN Stat s ON sv.statId = s.id
       LEFT JOIN StatHistory sh ON sv.id = sh.statValueId
         AND sh.createdAt >= ?
         AND sh.createdAt <= ?
       WHERE sv.playerId = ?
       ORDER BY s.code`,
      [lastReviewSession.createdAt, lastReviewSession.closedAt, id]
    );

    return NextResponse.json(changes);
  } catch (error: any) {
    console.error('Error fetching stat changes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stat changes', details: error.message },
      { status: 500 }
    );
  }
}

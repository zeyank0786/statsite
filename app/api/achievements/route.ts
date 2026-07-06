import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { fetchAllPlayerStats, fetchAllHistory, buildPlayerAggregates } from '@/lib/serverStats';
import { computeAchievements } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

/**
 * GET /api/achievements            → achievements for all players
 * GET /api/achievements?playerId=X → achievements for one player
 */
export async function GET(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');

    const [rows, history] = await Promise.all([fetchAllPlayerStats(), fetchAllHistory()]);
    const players = buildPlayerAggregates(rows);
    const achievements = computeAchievements(players, history);

    if (playerId) {
      return NextResponse.json({ achievements: achievements[playerId] || [] });
    }

    return NextResponse.json({ achievements });
  } catch (error: any) {
    console.error('Error computing achievements:', error);
    return NextResponse.json(
      { error: 'Failed to compute achievements', details: error.message },
      { status: 500 }
    );
  }
}

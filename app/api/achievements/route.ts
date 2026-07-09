import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { fetchAllPlayerStats, fetchAllHistory, buildPlayerAggregates } from '@/lib/serverStats';
import { computeAchievements, SocialCounts } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

/** Evidence / approved-proposal / vote counts per player, for Community achievements. */
async function fetchSocialCounts(): Promise<Record<string, SocialCounts>> {
  const counts: Record<string, SocialCounts> = {};
  const ensure = (id: string) => {
    if (!counts[id]) counts[id] = { evidencePosts: 0, approvedProposals: 0, votesCast: 0 };
    return counts[id];
  };
  try {
    const [evidence, approved, votes] = await Promise.all([
      queryAll('SELECT playerId as id, COUNT(*) as c FROM Evidence GROUP BY playerId'),
      queryAll("SELECT proposedById as id, COUNT(*) as c FROM Suggestion WHERE status = 'approved' GROUP BY proposedById"),
      queryAll('SELECT userId as id, COUNT(*) as c FROM Vote GROUP BY userId'),
    ]);
    for (const r of evidence as any[]) ensure(String(r.id)).evidencePosts = Number(r.c);
    for (const r of approved as any[]) ensure(String(r.id)).approvedProposals = Number(r.c);
    for (const r of votes as any[]) ensure(String(r.id)).votesCast = Number(r.c);
  } catch (e) {
    console.error('Social counts unavailable (achievements degrade gracefully):', e);
  }
  return counts;
}

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

    const [rows, history, social] = await Promise.all([
      fetchAllPlayerStats(),
      fetchAllHistory(),
      fetchSocialCounts(),
    ]);
    const players = buildPlayerAggregates(rows);
    const achievements = computeAchievements(players, history, social);

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

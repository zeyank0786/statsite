import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { getCrewStats } from '@/lib/crewStats';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/** Rows back-filled by the notification sync carry epoch, meaning "we don't know". */
const isRealDate = (iso: string) => new Date(iso).getUTCFullYear() > 2000;

/**
 * GET /api/achievements            → achievements for all players
 * GET /api/achievements?playerId=X → achievements for one player
 *
 * Each achievement carries `earnedAt` (when the sync first observed it) and
 * `holders` (everyone in the crew currently holding it) for the card's back
 * face. Holders come from the freshly computed result rather than the
 * AchievementEarned table, so the list reflects who qualifies right now.
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

    const { players, achievements: computed } = await getCrewStats();

    const nameById = new Map(players.map((p) => [p.id, p.username]));

    // achievementId -> usernames currently holding it
    const holders = new Map<string, string[]>();
    for (const [pid, list] of Object.entries(computed)) {
      for (const a of list) {
        if (!a.earned) continue;
        if (!holders.has(a.id)) holders.set(a.id, []);
        holders.get(a.id)!.push(nameById.get(pid) || 'Unknown');
      }
    }

    // playerId:achievementId -> when the sync first saw it
    const earnedAt = new Map<string, string>();
    try {
      const earnedRows = await queryAll('SELECT playerId, achievementId, earnedAt FROM AchievementEarned');
      for (const r of earnedRows) {
        const at = String(r.earnedAt);
        if (isRealDate(at)) earnedAt.set(`${r.playerId}:${r.achievementId}`, at);
      }
    } catch {
      /* table appears on the first notification poll — cards just omit the date */
    }

    const achievements: Record<string, unknown[]> = {};
    for (const [pid, list] of Object.entries(computed)) {
      achievements[pid] = list.map((a) => ({
        ...a,
        earnedAt: a.earned ? earnedAt.get(`${pid}:${a.id}`) : undefined,
        holders: holders.get(a.id) || [],
      }));
    }

    if (playerId) {
      return NextResponse.json({ achievements: achievements[playerId] || [] });
    }

    return NextResponse.json({ achievements });
  } catch (error: any) {
    console.error('Error computing achievements:', error);
    return NextResponse.json(
      errorPayload('Failed to compute achievements', error),
      { status: 500 }
    );
  }
}

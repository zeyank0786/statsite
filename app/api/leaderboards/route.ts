import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import {
  fetchAllPlayerStats,
  fetchAllHistory,
  buildPlayerAggregates,
  historySince,
  daysAgo,
} from '@/lib/serverStats';
import { computeAchievements } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [rows, history] = await Promise.all([fetchAllPlayerStats(), fetchAllHistory()]);
    const players = buildPlayerAggregates(rows);
    const achievements = computeAchievements(players, history);

    const cutoff90 = daysAgo(90);
    const cutoff30 = daysAgo(30);

    const payload = players.map((p) => {
      const ph = history.filter((h) => h.playerId === p.id);
      const h90 = historySince(ph, cutoff90);
      const h30 = historySince(ph, cutoff30);
      const bestStat = p.categories
        .flatMap((c) => c.stats.map((s) => ({ ...s, categoryCode: c.code })))
        .reduce((a, b) => (b.value > a.value ? b : a), { value: -1 } as any);

      return {
        id: p.id,
        username: p.username,
        overall: Math.round(p.overall * 10) / 10,
        totalSum: p.totalSum,
        categories: p.categories.map((c) => ({
          code: c.code,
          label: c.label,
          total: c.total,
          avg: Math.round(c.avg * 100) / 100,
        })),
        net90: h90.reduce((s, h) => s + (h.newValue - h.oldValue), 0),
        net30: h30.reduce((s, h) => s + (h.newValue - h.oldValue), 0),
        changes90: h90.length,
        eliteStats: p.categories.flatMap((c) => c.stats).filter((s) => s.value >= 8).length,
        bestStat:
          bestStat.value >= 0
            ? { code: bestStat.code, label: bestStat.label, value: bestStat.value, categoryCode: bestStat.categoryCode }
            : null,
        achievementsEarned: (achievements[p.id] || []).filter((a) => a.earned).length,
        achievementsTotal: (achievements[p.id] || []).length,
      };
    });

    return NextResponse.json({ players: payload });
  } catch (error: any) {
    console.error('Error building leaderboards:', error);
    return NextResponse.json(
      { error: 'Failed to build leaderboards', details: error.message },
      { status: 500 }
    );
  }
}

import { unstable_cache } from 'next/cache';
import {
  fetchAllPlayerStats,
  fetchAllHistory,
  buildPlayerAggregates,
  historySince,
  daysAgo,
} from './serverStats';
import { computeAchievements } from './achievements';
import { fetchSocialCounts } from './socialCounts';
import { computeStreakWeeks } from './streaks';
import { queryAll } from './db';
import { STATS_TAG, STATS_TTL_SECONDS } from './statsCache';

export interface LeaderboardEntry {
  id: string;
  username: string;
  overall: number;
  totalSum: number;
  categories: { code: string; label: string; total: number; avg: number }[];
  net90: number;
  net30: number;
  changes90: number;
  eliteStats: number;
  bestStat: { code: string; label: string; value: number; categoryCode: string } | null;
  achievementsEarned: number;
  achievementsTotal: number;
  streakWeeks: number;
}

/**
 * The whole board: every player's aggregates, 90/30-day movement, achievement
 * tallies and activity streak.
 *
 * Deliberately identical for every viewer — there is nothing user-specific in
 * here, which is what makes it cacheable crew-wide rather than per session.
 */
async function buildLeaderboard(): Promise<LeaderboardEntry[]> {
  const [rows, history, social] = await Promise.all([
    fetchAllPlayerStats(),
    fetchAllHistory(),
    fetchSocialCounts(),
  ]);
  const players = buildPlayerAggregates(rows);
  // With the social counts: without them the community, commitment and
  // streak achievements read as unearned and the board undercounts everyone.
  const achievements = computeAchievements(players, history, social);

  const cutoff90 = daysAgo(90);
  const cutoff30 = daysAgo(30);

  // Evidence posts also count toward activity streaks
  const evidenceDatesByPlayer = new Map<string, string[]>();
  try {
    const evidenceRows = await queryAll('SELECT playerId, createdAt FROM Evidence');
    for (const r of evidenceRows as any[]) {
      const pid = String(r.playerId);
      if (!evidenceDatesByPlayer.has(pid)) evidenceDatesByPlayer.set(pid, []);
      evidenceDatesByPlayer.get(pid)!.push(String(r.createdAt));
    }
  } catch {
    /* streaks degrade to history-only */
  }

  return players.map((p) => {
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
      streakWeeks: computeStreakWeeks([
        ...ph.map((h) => h.createdAt),
        ...(evidenceDatesByPlayer.get(p.id) || []),
      ]),
    };
  });
}

/**
 * Cached board. Held for STATS_TTL_SECONDS, and dropped immediately by
 * `invalidateStatsCache()` whenever a stat value is written — so an approved
 * suggestion or a closed review session shows up at once, while a crowd of
 * refreshes in a quiet minute costs one computation.
 */
export const getLeaderboard = unstable_cache(buildLeaderboard, ['leaderboard'], {
  tags: [STATS_TAG],
  revalidate: STATS_TTL_SECONDS,
});

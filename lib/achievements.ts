import { PlayerAggregate, HistoryRow, historySince, daysAgo } from './serverStats';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** icon key rendered by components/AchievementBadge */
  icon: string;
  earned: boolean;
  detail?: string;
}

/**
 * Compute achievements for every player. Purely derived from current stats +
 * history — nothing stored, so no schema changes needed.
 */
export function computeAchievements(
  players: PlayerAggregate[],
  history: HistoryRow[]
): Record<string, Achievement[]> {
  const topOverall = Math.max(...players.map((p) => p.overall), 0);
  const result: Record<string, Achievement[]> = {};

  for (const player of players) {
    const playerHistory = history.filter((h) => h.playerId === player.id);
    const h90 = historySince(playerHistory, daysAgo(90));
    const net90 = h90.reduce((s, h) => s + (h.newValue - h.oldValue), 0);
    const allTimeGains = playerHistory.reduce((s, h) => s + Math.max(0, h.newValue - h.oldValue), 0);

    const allStats = player.categories.flatMap((c) => c.stats);
    const valueByStatId = new Map(allStats.map((s) => [s.statId, s.value]));

    const comeback = playerHistory.some(
      (h) => h.oldValue <= 3 && (valueByStatId.get(h.statId) ?? 0) >= 6
    );

    const eliteCount = allStats.filter((s) => s.value >= 8).length;
    const masteredCats = player.categories.filter((c) => c.avg >= 8);
    const bestStat = allStats.reduce((a, b) => (b.value > a.value ? b : a), allStats[0]);

    const list: Achievement[] = [
      {
        id: 'peak',
        name: 'Peak Performer',
        description: 'Reach 9+ on any stat',
        icon: 'star',
        earned: allStats.some((s) => s.value >= 9),
        detail: bestStat ? `Best: ${bestStat.label} (${bestStat.value})` : undefined,
      },
      {
        id: 'perfect',
        name: 'Double Digits',
        description: 'Push any stat to 10+',
        icon: 'crown',
        earned: allStats.some((s) => s.value >= 10),
      },
      {
        id: 'master',
        name: 'Category Master',
        description: 'Average 8+ across a whole category',
        icon: 'medal',
        earned: masteredCats.length > 0,
        detail: masteredCats.length > 0 ? masteredCats.map((c) => c.label).join(', ') : undefined,
      },
      {
        id: 'all-rounder',
        name: 'All-Rounder',
        description: 'Average 6+ in every category',
        icon: 'shield',
        earned: player.categories.length > 0 && player.categories.every((c) => c.avg >= 6),
      },
      {
        id: 'no-weak-links',
        name: 'No Weak Links',
        description: 'No stat below 4',
        icon: 'shield-check',
        earned: allStats.length > 0 && allStats.every((s) => s.value >= 4),
      },
      {
        id: 'sharpshooter',
        name: 'Sharpshooter',
        description: '10 or more stats at 8+',
        icon: 'target',
        earned: eliteCount >= 10,
        detail: `${eliteCount} stats at 8+`,
      },
      {
        id: 'rising',
        name: 'On the Rise',
        description: 'Net +5 across all stats in the last 90 days',
        icon: 'trending-up',
        earned: net90 >= 5,
        detail: net90 !== 0 ? `${net90 > 0 ? '+' : ''}${net90} in 90 days` : undefined,
      },
      {
        id: 'launch',
        name: 'Launch Mode',
        description: 'Net +15 across all stats in the last 90 days',
        icon: 'zap',
        earned: net90 >= 15,
      },
      {
        id: 'comeback',
        name: 'Comeback Story',
        description: 'Take a stat from 3 or lower up to 6+',
        icon: 'flame',
        earned: comeback,
      },
      {
        id: 'top-board',
        name: 'Top of the Board',
        description: 'Hold the highest overall score in the crew',
        icon: 'trophy',
        earned: players.length > 1 && player.overall >= topOverall && topOverall > 0,
      },
      {
        id: 'grinder',
        name: 'The Grind',
        description: 'Earn +25 total stat points all-time',
        icon: 'award',
        earned: allTimeGains >= 25,
        detail: `${allTimeGains} points gained all-time`,
      },
    ];

    result[player.id] = list;
  }

  return result;
}

import { type Achievement } from './achievements';
import { getCrewStats } from './crewStats';
import { computePlayerTrends, type PlayerTrends } from './trends';

export interface DashboardData {
  categories: {
    code: string;
    label: string;
    total: number;
    avg: number;
    stats: { statId: string; code: string; label: string; value: number }[];
  }[];
  trends: PlayerTrends;
  achievements: Achievement[];
}

/**
 * Everything the dashboard renders above the fold, assembled server-side.
 *
 * The page used to fire three parallel requests (/api/players/[id],
 * /trends, /api/achievements) *after* JS booted and the session resolved.
 * Gathering it here puts the numbers in the initial HTML instead.
 *
 * Only a subset of /api/players/[id] is needed — the dashboard uses category
 * stats for the radar and the strengths/focus lists, nothing else — so this
 * rebuilds that subset rather than pulling in the route's locks and rank-up
 * projections, which the dashboard never shows.
 */
export async function getDashboardData(playerId: string): Promise<DashboardData | null> {
  const [crew, trends] = await Promise.all([getCrewStats(), computePlayerTrends(playerId)]);

  const me = crew.players.find((p) => p.id === playerId);
  if (!me) return null;

  return {
    categories: me.categories,
    trends,
    achievements: crew.achievements[playerId] || [],
  };
}

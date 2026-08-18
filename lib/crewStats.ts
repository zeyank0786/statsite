import { unstable_cache } from 'next/cache';
import {
  fetchAllPlayerStats,
  fetchAllHistory,
  buildPlayerAggregates,
  type PlayerAggregate,
  type HistoryRow,
} from './serverStats';
import { computeAchievements, type Achievement, type SocialCounts } from './achievements';
import { fetchSocialCounts } from './socialCounts';
import { STATS_TAG, STATS_TTL_SECONDS } from './statsCache';

/**
 * Everything derived from the stat tables, computed once for the whole crew.
 *
 * Six separate surfaces — the dashboard, the leaderboard, the achievements
 * page, the profile editor, the notification feed and the OG card — each used
 * to run the same three queries (every stat value, all of StatHistory, social
 * counts across five more tables) and then recompute all 49 achievements for
 * every player. None of it is user-specific: the same work produced the same
 * answer for whoever asked, several times a minute, per open tab.
 *
 * It is one computation now, held for STATS_TTL_SECONDS and dropped the moment
 * a stat value changes (`invalidateStatsCache`). Callers take the slice they
 * want. A crowd of pollers in a quiet minute costs one pass instead of dozens.
 *
 * Nothing here may depend on the caller. Anything per-player belongs in the
 * consumer, reading from the shared result — otherwise the cache key would
 * have to fan out per user and the sharing is lost.
 */
export interface CrewStats {
  players: PlayerAggregate[];
  history: HistoryRow[];
  social: Record<string, SocialCounts>;
  /** playerId → their achievement list (earned and unearned). */
  achievements: Record<string, Achievement[]>;
  computedAt: string;
}

export async function buildCrewStats(): Promise<CrewStats> {
  const [rows, history, social] = await Promise.all([
    fetchAllPlayerStats(),
    fetchAllHistory(),
    fetchSocialCounts(),
  ]);
  const players = buildPlayerAggregates(rows);
  return {
    players,
    history,
    social,
    achievements: computeAchievements(players, history, social),
    computedAt: new Date().toISOString(),
  };
}

const cachedCrewStats = unstable_cache(buildCrewStats, ['crew-stats'], {
  tags: [STATS_TAG],
  revalidate: STATS_TTL_SECONDS,
});

/**
 * `unstable_cache` needs a request scope and throws "incrementalCache missing"
 * without one — which is every context that isn't serving a request: a cron
 * invocation outside the request lifecycle, a maintenance script, the
 * benchmark harness. Those callers want the data, not the cache, so fall
 * through to computing it. Same defensive shape as `invalidateStatsCache`,
 * which tolerates `revalidateTag` throwing for exactly the same reason.
 *
 * Only the missing-scope invariant is swallowed; a real failure still throws.
 */
export async function getCrewStats(): Promise<CrewStats> {
  try {
    return await cachedCrewStats();
  } catch (error) {
    if (/incrementalCache missing|Invariant/i.test(String((error as Error)?.message))) {
      return buildCrewStats();
    }
    throw error;
  }
}

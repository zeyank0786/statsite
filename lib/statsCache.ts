import { revalidateTag } from 'next/cache';

/**
 * Cache tag for anything derived from the full stat table.
 *
 * The leaderboard recomputes every player's aggregates, all 49 achievements,
 * social counts and streaks on every request — a fixed, fairly expensive job
 * that produces the SAME answer for every member of the crew. Caching it for a
 * short window turns a burst of visits into one computation.
 *
 * `use cache` would be the modern way to express this, but it requires the
 * app-wide `cacheComponents` flag, which changes the rendering model for every
 * route. `unstable_cache` gets the same result scoped to the one thing that
 * needs it.
 */
export const STATS_TAG = 'crew-stats';

/** How long a cached leaderboard may be served before it is rebuilt. */
export const STATS_TTL_SECONDS = 60;

/**
 * Drop cached crew stats. Call after ANY write that changes a stat value —
 * direct edits, review sessions, approved suggestions, commitment payouts — so
 * a change the crew just made is never hidden behind the TTL.
 *
 * Safe to call from a route handler; it is a no-op outside a request scope.
 */
export function invalidateStatsCache(): void {
  try {
    // `{ expire: 0 }` rather than the recommended `'max'` profile on purpose.
    // `'max'` is stale-while-revalidate: the next reader gets the OLD board
    // while a fresh one builds behind them — so whoever just approved a
    // suggestion would watch their change fail to appear. Expiring immediately
    // makes the next request recompute, which is the read-your-own-writes
    // behaviour this needs. (`updateTag` does this natively but is Server
    // Actions only; these calls come from route handlers.)
    revalidateTag(STATS_TAG, { expire: 0 });
  } catch {
    // revalidateTag throws outside a request/render scope (e.g. a script or a
    // background job). The TTL still bounds staleness, so this is not fatal.
  }
}

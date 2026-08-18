import { invalidateStatsCache } from './statsCache';
import { syncAchievements } from './notifications';

/**
 * Call after ANY write that changes a stat value.
 *
 * Two things have to happen together, and forgetting either one is a bug that
 * only shows up later:
 *
 *   1. drop the cached crew stats, so the change is visible immediately
 *      rather than up to a TTL later;
 *   2. record any achievement the change just earned, so the celebration
 *      fires.
 *
 * (2) used to happen on the READ path — recomputed on every notification poll,
 * every 30 seconds, per open tab — which is where most of this app's database
 * bill came from. Achievements are a pure function of stats, so the only
 * moment they can change is a stat write. This is that moment.
 *
 * Sync failures are swallowed: a missed achievement is caught by the next
 * write or by the daily cron sweep, and must never fail the write that caused
 * it. Awaited rather than fired-and-forgotten, because a serverless function
 * can be frozen the instant its response is returned.
 */
export async function afterStatChange(): Promise<void> {
  invalidateStatsCache();
  try {
    await syncAchievements();
  } catch (e) {
    console.error('Achievement sync after stat write failed (write already committed):', e);
  }
}

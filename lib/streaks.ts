/**
 * Activity streaks — consecutive calendar weeks (UTC, Monday-start) in which
 * a player did anything that leaves a trace: a stat change (StatHistory) or
 * an evidence post. The current week counts once there's activity in it, and
 * an empty current week doesn't break the streak until it's over (grace —
 * you can't lose a streak on Monday morning).
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** UTC timestamp of the Monday 00:00 starting the week containing `d`. */
export function weekStart(d: Date): number {
  const day = d.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
}

/** Consecutive active weeks ending at the current (or previous) week. */
export function computeStreakWeeks(activityDates: (string | Date)[], now: Date = new Date()): number {
  const weeks = new Set<number>();
  for (const raw of activityDates) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) weeks.add(weekStart(d));
  }
  let cursor = weekStart(now);
  if (!weeks.has(cursor)) cursor -= WEEK_MS; // grace: current week may still be empty
  let streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor -= WEEK_MS;
  }
  return streak;
}

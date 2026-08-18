/**
 * How much the crew actually uses the app — the multiplier that turns a
 * per-request cost into a monthly bill.
 *
 * Deliberately explicit rather than tuned to match a known figure: change a
 * number here and the whole report moves with it, so the assumptions can be
 * argued with directly.
 *
 * The key structural fact is that `usePoll` suspends while the tab is hidden,
 * so only VISIBLE minutes drive the polling timers. Page-load costs are driven
 * by navigations instead.
 */

import type { ScenarioResult } from './measure';

export const USAGE = {
  users: 4,
  description: 'app visible ~35 min/user/day, ~24 page loads/user/day',

  /** Minutes per user per day with a tab actually in the foreground. */
  visibleMinutesPerUserPerDay: 35,

  /** How that foreground time splits across pages. Must sum to 1. */
  pageShare: {
    dashboard: 0.35,
    suggestions: 0.2,
    messages: 0.2,
    evidence: 0.1,
    other: 0.15,
  },

  /** Page loads per user per day (each re-renders a server component). */
  navigationsPerUserPerDay: 24,
  /** How those navigations split. Must sum to 1. */
  navShare: {
    dashboard: 0.35,
    suggestions: 0.15,
    messages: 0.15,
    leaderboard: 0.1,
    achievements: 0.08,
    other: 0.17,
  },

  /**
   * A tab left in the foreground and walked away from. One per user per day,
   * for this long, is conservative for a phone left unlocked on a desk.
   */
  idleForegroundMinutesPerUserPerDay: 20,

  /**
   * Stat-changing writes per day (approved suggestions, review edits, admin
   * edits, commitment payouts). Each one drops the shared crew-stat cache, so
   * this is what sets how often that computation actually re-runs.
   */
  statWritesPerDay: 14,

  /** lib/statsCache.STATS_TTL_SECONDS */
  statsCacheTtlSeconds: 60,

  daysPerMonth: 30,
} as const;

/** Poll intervals, seconds. Mirrors the timers in the components. */
export const POLL_SECONDS = {
  pulse: 15,
  notifications: 30,
  activity: 25,
  suggestions: 8,
  messages: 5,
} as const;

export interface Extrapolation {
  perPath: { name: string; callsPerDay: number; rowsPerDay: number }[];
  rowsPerDay: number;
  rowsPerMonth: number;
  callsPerDay: number;
}

/** Calls per day for each measured path, given the usage model above. */
export function callsPerDay(): Record<string, number> {
  const u = USAGE;
  const perMin = (seconds: number) => 60 / seconds;

  // Foreground minutes that count toward the always-mounted timers: real
  // browsing plus whatever is left open and forgotten.
  const shellMinutes = (u.visibleMinutesPerUserPerDay + u.idleForegroundMinutesPerUserPerDay) * u.users;
  const dashboardMinutes = u.visibleMinutesPerUserPerDay * u.pageShare.dashboard * u.users
    + u.idleForegroundMinutesPerUserPerDay * u.users; // idle tabs usually sit on home
  const suggestionsMinutes = u.visibleMinutesPerUserPerDay * u.pageShare.suggestions * u.users;
  const messagesMinutes = u.visibleMinutesPerUserPerDay * u.pageShare.messages * u.users;

  const navs = u.navigationsPerUserPerDay * u.users;

  return {
    // Mounted in AppShell, so every foreground minute on any page.
    pulse: shellMinutes * perMin(POLL_SECONDS.pulse),
    notifications: shellMinutes * perMin(POLL_SECONDS.notifications),
    // Ticker lives on the dashboard.
    activity: dashboardMinutes * perMin(POLL_SECONDS.activity),
    // Page-specific timers.
    suggestions: suggestionsMinutes * perMin(POLL_SECONDS.suggestions),
    messages: messagesMinutes * perMin(POLL_SECONDS.messages),
    // Server renders / one-shot loads.
    dashboard: navs * u.navShare.dashboard,
    leaderboard: navs * u.navShare.leaderboard,
    achievements: navs * u.navShare.achievements,
  };
}

/**
 * How many times a day the shared crew-stat computation actually runs.
 *
 * Bounded by two things, not by request volume: the cache TTL (it can only
 * expire so often) and stat writes (each one invalidates it). Requests beyond
 * that are served from cache and cost nothing. Before the change there was no
 * sharing at all, so every consumer paid in full — which is what `sharesCrewStats`
 * distinguishes.
 */
function crewStatsComputationsPerDay(consumerCalls: number): number {
  const ttlExpiries = 86400 / USAGE.statsCacheTtlSeconds;
  return Math.min(consumerCalls, ttlExpiries + USAGE.statWritesPerDay);
}

export function extrapolate(results: ScenarioResult[]): Extrapolation {
  const calls = callsPerDay();
  const byName = new Map(results.map((r) => [r.name, r]));
  const shared = byName.get('crewStats');

  // Consumers of the shared computation are priced at their MARGINAL cost;
  // the shared part is billed once, at the rate it can actually re-run.
  const sharedCost = shared?.rowsRead ?? 0;
  let sharedConsumerCalls = 0;

  const perPath = results
    .filter((r) => r.name !== 'crewStats')
    .map((r) => {
      const c = calls[r.name] ?? 0;
      let rows = r.rowsRead;
      if (r.sharesCrewStats) {
        sharedConsumerCalls += c;
        rows = Math.max(0, r.rowsRead - sharedCost);
      }
      return { name: r.name, callsPerDay: c, rowsPerDay: c * rows };
    });

  if (shared) {
    const computations = crewStatsComputationsPerDay(sharedConsumerCalls);
    perPath.push({
      name: 'crewStats (shared)',
      callsPerDay: computations,
      rowsPerDay: computations * sharedCost,
    });
  }

  perPath.sort((a, b) => b.rowsPerDay - a.rowsPerDay);

  const rowsPerDay = perPath.reduce((s, p) => s + p.rowsPerDay, 0);
  return {
    perPath,
    rowsPerDay,
    rowsPerMonth: rowsPerDay * USAGE.daysPerMonth,
    callsPerDay: perPath.reduce((s, p) => s + p.callsPerDay, 0),
  };
}

const millions = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;

export function formatReport(before: Extrapolation, after?: Extrapolation): string {
  const lines: string[] = [];
  const afterByName = after ? new Map(after.perPath.map((p) => [p.name, p])) : null;

  const head = afterByName
    ? ['path', 'calls/day', 'rows/day before', 'rows/day after', 'share of saving']
    : ['path', 'calls/day', 'rows/day', 'share'];
  const rows: string[][] = [];

  const totalSaved = after ? before.rowsPerDay - after.rowsPerDay : 0;

  // Paths that exist only after the change — the shared crew-stat computation
  // is new, and omitting it would flatter the result by hiding real work.
  const beforeNames = new Set(before.perPath.map((p) => p.name));
  const introduced = after ? after.perPath.filter((p) => !beforeNames.has(p.name)) : [];

  for (const p of [...before.perPath, ...introduced.map((p) => ({ ...p, rowsPerDay: 0, callsPerDay: 0 }))]) {
    const a = afterByName?.get(p.name);
    if (p.callsPerDay === 0 && !a?.callsPerDay) continue;
    if (afterByName) {
      const saved = p.rowsPerDay - (a?.rowsPerDay ?? 0);
      rows.push([
        p.name,
        Math.round(a?.callsPerDay ?? p.callsPerDay).toLocaleString(),
        millions(p.rowsPerDay),
        millions(a?.rowsPerDay ?? 0),
        totalSaved > 0 ? `${((saved / totalSaved) * 100).toFixed(0)}%` : '—',
      ]);
    } else {
      rows.push([
        p.name,
        Math.round(p.callsPerDay).toLocaleString(),
        millions(p.rowsPerDay),
        `${((p.rowsPerDay / before.rowsPerDay) * 100).toFixed(0)}%`,
      ]);
    }
  }

  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  lines.push('');
  lines.push(line(head));
  lines.push(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) lines.push(line(r));
  lines.push('');

  if (after) {
    const pct = ((before.rowsPerDay - after.rowsPerDay) / before.rowsPerDay) * 100;
    lines.push(`  rows/day    ${millions(before.rowsPerDay).padStart(9)}  →  ${millions(after.rowsPerDay).padStart(9)}`);
    lines.push(`  rows/month  ${millions(before.rowsPerMonth).padStart(9)}  →  ${millions(after.rowsPerMonth).padStart(9)}`);
    lines.push('');
    lines.push(`  REDUCTION:  ${pct.toFixed(1)}%   (${millions(before.rowsPerMonth - after.rowsPerMonth)} fewer rows read per month)`);
  } else {
    lines.push(`  rows/day    ${millions(before.rowsPerDay)}`);
    lines.push(`  rows/month  ${millions(before.rowsPerMonth)}`);
    lines.push(`  requests/day ${Math.round(before.callsPerDay).toLocaleString()}`);
  }

  return lines.join('\n');
}

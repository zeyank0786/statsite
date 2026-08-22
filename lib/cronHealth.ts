import { query, queryAll } from './db';
import { ensureOnce } from './ensureOnce';

/**
 * Cron health — proof of whether the scheduled jobs are actually running.
 *
 * Several things in this app only happen because something outside it pokes an
 * endpoint on a schedule: custom reminders firing at their set time, commitment
 * deadlines sweeping, automations landing, stale suggestions expiring, the
 * Season Wrapped rollover. When the pinger stops, none of that throws an error
 * anywhere — the work simply never happens, and the only symptom is a reminder
 * arriving at the wrong time of day. That is exactly what happened while the
 * database was over its limit: the endpoints 500'd, the external scheduler
 * disabled the job after repeated failures, and nothing in the app noticed.
 *
 * So every cron run now stamps a row here. That turns an invisible failure into
 * a visible one: the admin panel can say "the 15-minute pinger has not been
 * seen in three days" instead of everyone slowly noticing their reminders are
 * late.
 *
 * Cost is one upsert per cron invocation — a few hundred writes a day at the
 * intended 15-minute cadence, which is nothing next to the read volume this app
 * was tuned for.
 */

export interface CronJob {
  key: string;
  label: string;
  path: string;
  /**
   * How often this endpoint is *meant* to be hit. A job is considered stale
   * once it has been silent for meaningfully longer than this.
   */
  expectedIntervalMinutes: number;
  /** What silently stops working when this job stops running. */
  covers: string;
  /**
   * True when the app works fine without this endpoint being pinged directly,
   * because the daily job chains the same work as a backstop.
   */
  optional?: boolean;
}

/**
 * A stale verdict needs slack — a 15-minute job that ran 16 minutes ago is
 * healthy, not broken. Three missed runs plus a few minutes is late enough to
 * be real without crying wolf over one slow tick.
 */
const STALE_MULTIPLIER = 3;
const STALE_GRACE_MINUTES = 10;

export const CRON_JOBS: CronJob[] = [
  {
    key: 'reminders',
    label: 'Reminder pinger',
    path: '/api/cron/reminders',
    expectedIntervalMinutes: 15,
    covers:
      'Custom reminders firing at their set time. Without this they only go out once a day, whenever the daily job runs — which is why reminders arrive at the wrong time rather than not at all.',
  },
  {
    key: 'vote-reminders',
    label: 'Daily upkeep',
    path: '/api/cron/vote-reminders',
    expectedIntervalMinutes: 24 * 60,
    covers:
      'Vote nudges, commitment upkeep, automations, stale-suggestion expiry, the achievement sweep and the Season Wrapped rollover — they all ride along on this one daily job.',
  },
  {
    key: 'automations',
    label: 'Automations',
    path: '/api/cron/automations',
    expectedIntervalMinutes: 24 * 60,
    optional: true,
    covers:
      'Automatic stat rules. The daily job already runs these, so this endpoint only matters if you want them landing earlier in the day.',
  },
  {
    key: 'commitments',
    label: 'Commitments',
    path: '/api/cron/commitments',
    expectedIntervalMinutes: 24 * 60,
    optional: true,
    covers:
      'Commitment deadline sweeps and check-in nudges. The daily job already runs these, so this endpoint is for manual runs.',
  },
];

export function getCronJob(key: string): CronJob | undefined {
  return CRON_JOBS.find((j) => j.key === key);
}

export async function ensureCronHealthTable(): Promise<void> {
  return ensureOnce('cronHealth', async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS CronRun (
         jobKey     TEXT PRIMARY KEY,
         lastRunAt  TEXT NOT NULL,
         lastOkAt   TEXT,
         lastError  TEXT,
         lastSource TEXT,
         runs       INTEGER NOT NULL DEFAULT 0,
         failures   INTEGER NOT NULL DEFAULT 0
       )`
    );
  });
}

/**
 * Who hit the endpoint, as far as we can tell.
 *
 * This is the single most useful field for diagnosing "my reminders are late",
 * because it separates the two cases that look identical from the outside: the
 * endpoint being hit only by Vercel's once-a-day cron (timing will be wrong) and
 * it being hit by a real 15-minute pinger (timing is fine, look elsewhere).
 * Vercel identifies its own scheduled invocations by user agent.
 */
export function describeSource(request: Request): string {
  const ua = request.headers.get('user-agent') || '';
  if (/vercel-cron/i.test(ua)) return 'vercel-cron';
  if (/github/i.test(ua)) return 'github-actions';
  if (/cron-job\.org/i.test(ua)) return 'cron-job.org';
  if (!ua) return 'unknown';
  // Keep it short — this is a label in a table, not a forensic log.
  return ua.slice(0, 60);
}

/** Stamp a run. Never throws: health bookkeeping must not break the job. */
export async function recordCronRun(
  jobKey: string,
  opts: { ok: boolean; source?: string; error?: unknown } = { ok: true }
): Promise<void> {
  try {
    await ensureCronHealthTable();
    const now = new Date().toISOString();
    const message = opts.ok
      ? null
      : String(
          (opts.error instanceof Error ? opts.error.message : opts.error) || 'Unknown error'
        ).slice(0, 300);

    await query(
      `INSERT INTO CronRun (jobKey, lastRunAt, lastOkAt, lastError, lastSource, runs, failures)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(jobKey) DO UPDATE SET
         lastRunAt  = excluded.lastRunAt,
         lastOkAt   = COALESCE(excluded.lastOkAt, CronRun.lastOkAt),
         lastError  = excluded.lastError,
         lastSource = excluded.lastSource,
         runs       = CronRun.runs + 1,
         failures   = CronRun.failures + excluded.failures`,
      [jobKey, now, opts.ok ? now : null, message, opts.source || 'unknown', opts.ok ? 0 : 1]
    );
  } catch (e) {
    console.error('Failed to record cron run (job itself is unaffected):', e);
  }
}

export interface CronStatus extends CronJob {
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  lastSource: string | null;
  runs: number;
  failures: number;
  /** Minutes since the last run, or null if it has never run. */
  minutesSinceRun: number | null;
  /** 'never' | 'stale' | 'failing' | 'ok' */
  state: 'never' | 'stale' | 'failing' | 'ok';
}

export function classify(job: CronJob, row: {
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
}, now: Date = new Date()): { state: CronStatus['state']; minutesSinceRun: number | null } {
  if (!row.lastRunAt) return { state: 'never', minutesSinceRun: null };

  const minutesSinceRun = Math.max(
    0,
    Math.round((now.getTime() - new Date(row.lastRunAt).getTime()) / 60000)
  );
  const limit = job.expectedIntervalMinutes * STALE_MULTIPLIER + STALE_GRACE_MINUTES;

  if (minutesSinceRun > limit) return { state: 'stale', minutesSinceRun };
  // Ran recently but the last attempt errored — the pinger is alive and the job
  // is broken, which is a different problem with a different fix.
  if (row.lastError && (!row.lastOkAt || row.lastOkAt < row.lastRunAt)) {
    return { state: 'failing', minutesSinceRun };
  }
  return { state: 'ok', minutesSinceRun };
}

export async function getCronHealth(now: Date = new Date()): Promise<CronStatus[]> {
  await ensureCronHealthTable();
  const rows = (await queryAll('SELECT * FROM CronRun')) as Record<string, unknown>[];
  const byKey = new Map(rows.map((r) => [String(r.jobKey), r]));

  return CRON_JOBS.map((job) => {
    const r = byKey.get(job.key);
    const base = {
      lastRunAt: r?.lastRunAt ? String(r.lastRunAt) : null,
      lastOkAt: r?.lastOkAt ? String(r.lastOkAt) : null,
      lastError: r?.lastError ? String(r.lastError) : null,
    };
    const { state, minutesSinceRun } = classify(job, base, now);
    return {
      ...job,
      ...base,
      lastSource: r?.lastSource ? String(r.lastSource) : null,
      runs: Number(r?.runs || 0),
      failures: Number(r?.failures || 0),
      minutesSinceRun,
      state,
    };
  });
}

import { describe, it, expect } from 'vitest';
import { CRON_JOBS, classify, describeSource, getCronJob } from '@/lib/cronHealth';

const job = getCronJob('reminders')!;
const NOW = new Date('2026-08-22T12:00:00.000Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

describe('the job catalog', () => {
  it('has unique keys', () => {
    const keys = CRON_JOBS.map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('knows the reminder pinger is meant to run far more often than daily', () => {
    expect(job.expectedIntervalMinutes).toBeLessThan(24 * 60);
  });
});

describe('classifying a job', () => {
  it('reports never for a job that has not run', () => {
    expect(classify(job, { lastRunAt: null, lastOkAt: null, lastError: null }, NOW).state).toBe(
      'never'
    );
  });

  it('is happy with a run inside the expected cadence', () => {
    const at = minutesAgo(14);
    expect(classify(job, { lastRunAt: at, lastOkAt: at, lastError: null }, NOW).state).toBe('ok');
  });

  // One slow tick is not a dead pinger; three missed ones is.
  it('tolerates a single late tick', () => {
    const at = minutesAgo(20);
    expect(classify(job, { lastRunAt: at, lastOkAt: at, lastError: null }, NOW).state).toBe('ok');
  });

  it('calls it stale once it has been silent for far too long', () => {
    const at = minutesAgo(60 * 24 * 3);
    const result = classify(job, { lastRunAt: at, lastOkAt: at, lastError: null }, NOW);
    expect(result.state).toBe('stale');
    expect(result.minutesSinceRun).toBe(60 * 24 * 3);
  });

  // A live pinger hitting a broken endpoint is a different problem with a
  // different fix, so it must not read as "not running".
  it('separates a failing job from a missing one', () => {
    expect(
      classify(
        job,
        { lastRunAt: minutesAgo(5), lastOkAt: minutesAgo(400), lastError: 'boom' },
        NOW
      ).state
    ).toBe('failing');
  });

  it('treats a recovered job as healthy even though it once errored', () => {
    const at = minutesAgo(5);
    expect(classify(job, { lastRunAt: at, lastOkAt: at, lastError: 'old boom' }, NOW).state).toBe(
      'ok'
    );
  });

  it('judges the daily job against a daily cadence, not the pinger’s', () => {
    const daily = getCronJob('vote-reminders')!;
    const at = minutesAgo(60 * 25);
    expect(classify(daily, { lastRunAt: at, lastOkAt: at, lastError: null }, NOW).state).toBe('ok');
    expect(classify(job, { lastRunAt: at, lastOkAt: at, lastError: null }, NOW).state).toBe('stale');
  });
});

describe('identifying the caller', () => {
  const withAgent = (ua: string) =>
    describeSource(new Request('https://example.test/api/cron/reminders', { headers: { 'user-agent': ua } }));

  // This is the field that answers "why are my reminders late?" — only the
  // daily Vercel cron calling means the 15-minute pinger is dead.
  it('names the schedulers we expect to see', () => {
    expect(withAgent('vercel-cron/1.0')).toBe('vercel-cron');
    expect(withAgent('curl/8.4.0 (GitHub Actions)')).toBe('github-actions');
    expect(withAgent('Mozilla/5.0 (compatible; cron-job.org)')).toBe('cron-job.org');
  });

  it('falls back to unknown when nothing identifies itself', () => {
    expect(describeSource(new Request('https://example.test/api/cron/reminders'))).toBe('unknown');
  });

  it('truncates a long agent rather than storing an essay', () => {
    expect(withAgent('x'.repeat(400)).length).toBeLessThanOrEqual(60);
  });
});

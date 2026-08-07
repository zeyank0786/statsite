import { describe, it, expect } from 'vitest';
import { weekStart, computeStreakWeeks } from '@/lib/streaks';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** ISO string N weeks before `from`. */
const weeksBefore = (from: Date, n: number) => new Date(from.getTime() - n * WEEK_MS).toISOString();

describe('weekStart', () => {
  it('snaps to Monday 00:00 UTC', () => {
    // 2026-08-07 is a Friday
    const friday = new Date('2026-08-07T15:30:00.000Z');
    expect(new Date(weekStart(friday)).toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });

  it('treats Sunday as the END of the week, not the start', () => {
    // 2026-08-09 is a Sunday — belongs to the week beginning Mon 2026-08-03
    const sunday = new Date('2026-08-09T23:59:59.000Z');
    expect(new Date(weekStart(sunday)).toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });

  it('puts Monday in its own week', () => {
    const monday = new Date('2026-08-03T00:00:00.000Z');
    expect(weekStart(monday)).toBe(monday.getTime());
  });

  it('handles a week spanning a month boundary', () => {
    // Tue 2026-09-01 → Mon 2026-08-31
    expect(new Date(weekStart(new Date('2026-09-01T12:00:00.000Z'))).toISOString()).toBe(
      '2026-08-31T00:00:00.000Z'
    );
  });

  it('handles a week spanning a year boundary', () => {
    // Fri 2027-01-01 → Mon 2026-12-28
    expect(new Date(weekStart(new Date('2027-01-01T12:00:00.000Z'))).toISOString()).toBe(
      '2026-12-28T00:00:00.000Z'
    );
  });
});

describe('computeStreakWeeks', () => {
  const now = new Date('2026-08-07T12:00:00.000Z'); // Friday

  it('is 0 with no activity', () => {
    expect(computeStreakWeeks([], now)).toBe(0);
  });

  it('counts the current week once there is activity in it', () => {
    expect(computeStreakWeeks([now.toISOString()], now)).toBe(1);
  });

  it('counts consecutive weeks', () => {
    const dates = [0, 1, 2, 3].map((n) => weeksBefore(now, n));
    expect(computeStreakWeeks(dates, now)).toBe(4);
  });

  it('grants grace: an empty current week does not break the streak', () => {
    // Activity last week and the week before, nothing yet this week
    const dates = [weeksBefore(now, 1), weeksBefore(now, 2)];
    expect(computeStreakWeeks(dates, now)).toBe(2);
  });

  it('stops at the first missed week', () => {
    // This week, last week, then a GAP, then three older weeks
    const dates = [weeksBefore(now, 0), weeksBefore(now, 1), weeksBefore(now, 3), weeksBefore(now, 4)];
    expect(computeStreakWeeks(dates, now)).toBe(2);
  });

  it('is 0 when the most recent activity is too old to reach even with grace', () => {
    expect(computeStreakWeeks([weeksBefore(now, 2)], now)).toBe(0);
  });

  it('does not double-count several activities in the same week', () => {
    const monday = '2026-08-03T09:00:00.000Z';
    const wednesday = '2026-08-05T09:00:00.000Z';
    const friday = '2026-08-07T09:00:00.000Z';
    expect(computeStreakWeeks([monday, wednesday, friday], now)).toBe(1);
  });

  it('accepts Date objects as well as ISO strings', () => {
    expect(computeStreakWeeks([new Date(now)], now)).toBe(1);
  });

  it('ignores unparseable dates instead of throwing', () => {
    expect(computeStreakWeeks(['not-a-date', now.toISOString()], now)).toBe(1);
  });

  it('is order-independent', () => {
    const dates = [weeksBefore(now, 2), weeksBefore(now, 0), weeksBefore(now, 1)];
    expect(computeStreakWeeks(dates, now)).toBe(3);
  });
});

import { describe, it, expect } from 'vitest';
import { makeSeason, seasonForDate, previousSeason, seasonFromKey } from '@/lib/wrapped';

describe('makeSeason', () => {
  it('builds the right window for each quarter', () => {
    expect(makeSeason(2026, 1).start).toBe('2026-01-01T00:00:00.000Z');
    expect(makeSeason(2026, 1).end).toBe('2026-04-01T00:00:00.000Z');
    expect(makeSeason(2026, 4).start).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rolls Q4 over into the next year', () => {
    expect(makeSeason(2026, 4).end).toBe('2027-01-01T00:00:00.000Z');
  });

  it('labels the season', () => {
    const s = makeSeason(2026, 3);
    expect(s.key).toBe('2026-Q3');
    expect(s.label).toBe('Q3 2026');
    expect(s.months).toBe('Jul–Sep');
  });

  it('gives back-to-back seasons touching boundaries with no gap or overlap', () => {
    expect(makeSeason(2026, 2).start).toBe(makeSeason(2026, 1).end);
    expect(makeSeason(2027, 1).start).toBe(makeSeason(2026, 4).end);
  });
});

describe('seasonForDate', () => {
  it('maps months to quarters', () => {
    expect(seasonForDate(new Date('2026-01-15T00:00:00Z')).quarter).toBe(1);
    expect(seasonForDate(new Date('2026-04-01T00:00:00Z')).quarter).toBe(2);
    expect(seasonForDate(new Date('2026-08-07T00:00:00Z')).quarter).toBe(3);
    expect(seasonForDate(new Date('2026-12-31T23:59:59Z')).quarter).toBe(4);
  });

  it('places a date exactly on a quarter boundary in the NEW quarter', () => {
    expect(seasonForDate(new Date('2026-07-01T00:00:00.000Z')).key).toBe('2026-Q3');
  });

  it('contains the date it was derived from', () => {
    const d = new Date('2026-08-07T12:00:00Z');
    const s = seasonForDate(d);
    expect(new Date(s.start).getTime()).toBeLessThanOrEqual(d.getTime());
    expect(new Date(s.end).getTime()).toBeGreaterThan(d.getTime());
  });
});

describe('previousSeason', () => {
  it('returns the most recent COMPLETED season', () => {
    expect(previousSeason(new Date('2026-08-07T00:00:00Z')).key).toBe('2026-Q2');
  });

  it('wraps back a year from Q1', () => {
    expect(previousSeason(new Date('2026-02-10T00:00:00Z')).key).toBe('2025-Q4');
  });

  it('never returns the season currently in progress', () => {
    for (const month of ['01', '04', '07', '10', '12']) {
      const d = new Date(`2026-${month}-15T00:00:00Z`);
      expect(previousSeason(d).key).not.toBe(seasonForDate(d).key);
    }
  });

  it('ends on or before the current season start', () => {
    const d = new Date('2026-08-07T00:00:00Z');
    expect(previousSeason(d).end).toBe(seasonForDate(d).start);
  });
});

describe('seasonFromKey', () => {
  it('round-trips with makeSeason', () => {
    const s = makeSeason(2026, 3);
    expect(seasonFromKey(s.key)).toEqual(s);
  });

  it('rejects malformed keys instead of producing a bogus season', () => {
    expect(seasonFromKey('2026-Q5')).toBeNull();
    expect(seasonFromKey('2026-Q0')).toBeNull();
    expect(seasonFromKey('nonsense')).toBeNull();
    expect(seasonFromKey('26-Q1')).toBeNull();
    expect(seasonFromKey('')).toBeNull();
    expect(seasonFromKey(null as unknown as string)).toBeNull();
  });
});

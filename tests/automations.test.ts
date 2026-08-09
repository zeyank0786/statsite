import { describe, it, expect } from 'vitest';
import {
  ALLOWED_DELTAS,
  describeCadence,
  isValidCadence,
  nextRunAfter,
  validateDraft,
  type Cadence,
  type NewRuleDraft,
} from '@/lib/automations';

/** Slots always land on midnight UTC, so comparing the date half is enough. */
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

const rule = (over: Partial<Parameters<typeof nextRunAfter>[0]> = {}) => ({
  cadence: 'daily' as Cadence,
  intervalDays: null,
  dayOfWeek: null,
  dayOfMonth: null,
  startDate: '2026-01-01',
  endDate: null,
  ...over,
});

describe('nextRunAfter — daily', () => {
  it('returns the following day', () => {
    expect(day(nextRunAfter(rule(), '2026-03-10T09:00:00Z'))).toBe('2026-03-11');
  });

  it('never fires before the start date', () => {
    const r = rule({ startDate: '2026-06-01' });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-06-01');
  });

  it('stops once the end date has passed', () => {
    const r = rule({ endDate: '2026-03-10' });
    expect(nextRunAfter(r, '2026-03-10T09:00:00Z')).toBeNull();
  });

  it('still fires on the end date itself', () => {
    const r = rule({ endDate: '2026-03-11' });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-03-11');
  });
});

describe('nextRunAfter — interval', () => {
  it('lands on the start date when that is the next slot', () => {
    const r = rule({ cadence: 'interval', intervalDays: 3, startDate: '2026-03-12' });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-03-12');
  });

  it('walks in multiples of the interval from the start date', () => {
    const r = rule({ cadence: 'interval', intervalDays: 3, startDate: '2026-03-01' });
    // 1, 4, 7, 10, 13 — from the 10th the next is the 13th
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-03-13');
  });

  it('treats a 1-day interval as daily', () => {
    const r = rule({ cadence: 'interval', intervalDays: 1, startDate: '2026-03-01' });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-03-11');
  });

  it('skips missed cycles rather than replaying them', () => {
    // A rule left unrun for a month still yields exactly one next slot, and it
    // is in the future — this is what stops a resumed rule paying arrears.
    const r = rule({ cadence: 'interval', intervalDays: 7, startDate: '2026-01-01' });
    const next = nextRunAfter(r, '2026-03-10T09:00:00Z')!;
    expect(new Date(next).getTime()).toBeGreaterThan(new Date('2026-03-10T09:00:00Z').getTime());
    expect(day(next)).toBe('2026-03-12'); // Jan 1 + 10 weeks
  });
});

describe('nextRunAfter — weekly', () => {
  it('finds the next matching weekday', () => {
    // 2026-03-10 is a Tuesday; next Friday (5) is the 13th
    const r = rule({ cadence: 'weekly', dayOfWeek: 5 });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-03-13');
  });

  it('rolls a full week when today is the target day', () => {
    // Tuesday (2) asked for on a Tuesday → next Tuesday
    const r = rule({ cadence: 'weekly', dayOfWeek: 2 });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-03-17');
  });

  it('handles the Sunday wrap', () => {
    const r = rule({ cadence: 'weekly', dayOfWeek: 0 });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-03-15');
  });
});

describe('nextRunAfter — monthly', () => {
  it('finds the target day later this month', () => {
    const r = rule({ cadence: 'monthly', dayOfMonth: 20 });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-03-20');
  });

  it('rolls into next month when the day has passed', () => {
    const r = rule({ cadence: 'monthly', dayOfMonth: 5 });
    expect(day(nextRunAfter(r, '2026-03-10T09:00:00Z'))).toBe('2026-04-05');
  });

  it('crosses February without falling in a hole', () => {
    const r = rule({ cadence: 'monthly', dayOfMonth: 28, startDate: '2026-01-01' });
    expect(day(nextRunAfter(r, '2026-01-29T09:00:00Z'))).toBe('2026-02-28');
  });

  it('crosses a year boundary', () => {
    const r = rule({ cadence: 'monthly', dayOfMonth: 3, startDate: '2026-01-01' });
    expect(day(nextRunAfter(r, '2026-12-10T09:00:00Z'))).toBe('2027-01-03');
  });
});

describe('validateDraft', () => {
  const draft = (over: Partial<NewRuleDraft> = {}): Partial<NewRuleDraft> => ({
    name: 'Gym 3x/week',
    cadence: 'weekly',
    dayOfWeek: 1,
    startDate: '2026-03-01',
    stats: [{ statId: 'a', delta: 1 }],
    ...over,
  });

  it('accepts a well-formed draft', () => {
    expect(validateDraft(draft())).toBeNull();
  });

  it('requires a name', () => {
    expect(validateDraft(draft({ name: '   ' }))).toMatch(/name/i);
  });

  it('requires at least one stat', () => {
    expect(validateDraft(draft({ stats: [] }))).toMatch(/at least one stat/i);
  });

  it('rejects a repeated stat', () => {
    const d = draft({ stats: [{ statId: 'a', delta: 1 }, { statId: 'a', delta: 2 }] });
    expect(validateDraft(d)).toMatch(/twice/i);
  });

  it('rejects a delta outside ±1 / ±2', () => {
    expect(validateDraft(draft({ stats: [{ statId: 'a', delta: 3 }] }))).toMatch(/±1 or ±2/);
    expect(validateDraft(draft({ stats: [{ statId: 'a', delta: 0 }] }))).toMatch(/±1 or ±2/);
  });

  it('accepts every allowed delta, negatives included', () => {
    for (const delta of ALLOWED_DELTAS) {
      expect(validateDraft(draft({ stats: [{ statId: 'a', delta }] }))).toBeNull();
    }
  });

  it('rejects an end date before the start', () => {
    expect(validateDraft(draft({ startDate: '2026-03-10', endDate: '2026-03-01' }))).toMatch(/before/i);
  });

  it('rejects a day of month past 28', () => {
    expect(validateDraft(draft({ cadence: 'monthly', dayOfMonth: 31 }))).toMatch(/1–28/);
  });

  it('rejects a nonsense interval', () => {
    expect(validateDraft(draft({ cadence: 'interval', intervalDays: 0 }))).toMatch(/1–365/);
    expect(validateDraft(draft({ cadence: 'interval', intervalDays: 400 }))).toMatch(/1–365/);
  });
});

describe('describeCadence', () => {
  it('reads naturally for each cadence', () => {
    expect(describeCadence(rule())).toBe('every day');
    expect(describeCadence(rule({ cadence: 'weekly', dayOfWeek: 1 }))).toBe('weekly on Monday');
    expect(describeCadence(rule({ cadence: 'monthly', dayOfMonth: 3 }))).toBe('monthly on the 3rd');
    expect(describeCadence(rule({ cadence: 'monthly', dayOfMonth: 11 }))).toBe('monthly on the 11th');
    expect(describeCadence(rule({ cadence: 'interval', intervalDays: 5 }))).toBe('every 5 days');
  });
});

describe('isValidCadence', () => {
  it('accepts the four cadences and nothing else', () => {
    for (const c of ['daily', 'weekly', 'monthly', 'interval']) expect(isValidCadence(c)).toBe(true);
    for (const c of ['hourly', '', null, undefined, 7]) expect(isValidCadence(c)).toBe(false);
  });
});

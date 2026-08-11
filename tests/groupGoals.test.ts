import { describe, it, expect } from 'vitest';
import { computePayout, computeStandings, type Contribution, type Standing } from '@/lib/groupGoals';

/**
 * The payout is the part the crew will actually argue about, so it has to be
 * exactly right: shares must sum to the pool, and standings must rank fairly.
 */

let seq = 0;
const contribution = (
  playerId: string,
  amount: number,
  status: 'counted' | 'struck' = 'counted',
  createdAt = `2026-01-${String(++seq).padStart(2, '0')}T00:00:00.000Z`
): Contribution => ({
  id: `c${seq}`,
  goalId: 'g1',
  playerId,
  playerName: playerId.toUpperCase(),
  amount,
  evidenceId: `e${seq}`,
  evidenceUrl: null,
  evidenceType: null,
  note: null,
  status,
  struckById: null,
  struckByName: null,
  struckReason: null,
  createdAt,
});

const standing = (playerId: string, amount: number, rank: number, share: number): Standing => ({
  playerId,
  playerName: playerId.toUpperCase(),
  amount,
  share,
  rank,
  contributions: 1,
  firstAt: '2026-01-01T00:00:00.000Z',
});

describe('computeStandings', () => {
  it('sums each player and ranks by total', () => {
    const standings = computeStandings([
      contribution('a', 100),
      contribution('b', 300),
      contribution('a', 150),
    ]);
    // a logged 100 + 150 = 250; b logged 300 in one go, so b leads.
    expect(standings.map((s) => s.playerId)).toEqual(['b', 'a']);
    expect(standings[0].amount).toBe(300);
    expect(standings[0].rank).toBe(1);
    expect(standings[1].amount).toBe(250);
    expect(standings[1].contributions).toBe(2);
  });

  it('excludes struck contributions from the total', () => {
    const standings = computeStandings([
      contribution('a', 100),
      contribution('a', 5000, 'struck'),
    ]);
    expect(standings[0].amount).toBe(100);
  });

  it('drops a player entirely when all their contributions are struck', () => {
    const standings = computeStandings([contribution('a', 100), contribution('b', 50, 'struck')]);
    expect(standings.map((s) => s.playerId)).toEqual(['a']);
  });

  it('computes share as a fraction of the counted total', () => {
    const standings = computeStandings([contribution('a', 75), contribution('b', 25)]);
    expect(standings[0].share).toBeCloseTo(0.75);
    expect(standings[1].share).toBeCloseTo(0.25);
  });

  it('breaks ties in favour of whoever contributed first', () => {
    const standings = computeStandings([
      contribution('late', 100, 'counted', '2026-03-01T00:00:00.000Z'),
      contribution('early', 100, 'counted', '2026-02-01T00:00:00.000Z'),
    ]);
    expect(standings[0].playerId).toBe('early');
  });

  it('handles an empty goal', () => {
    expect(computeStandings([])).toEqual([]);
  });
});

describe('computePayout — proportional', () => {
  const goal = { rewardMode: 'proportional' as const, rewardPool: 10, rewardFirst: 0, rewardSecond: 0, rewardThird: 0 };

  it('splits the pool exactly, with nothing lost to rounding', () => {
    const standings = [standing('a', 60, 1, 0.6), standing('b', 40, 2, 0.4)];
    const payout = computePayout(goal, standings);
    expect(payout.reduce((sum, p) => sum + p.points, 0)).toBe(10);
  });

  it('still sums to the pool when the split is awkward', () => {
    // Thirds of 10 — naive rounding would give 3/3/3 and lose a point.
    const standings = [standing('a', 1, 1, 1 / 3), standing('b', 1, 2, 1 / 3), standing('c', 1, 3, 1 / 3)];
    const payout = computePayout(goal, standings);
    expect(payout.reduce((sum, p) => sum + p.points, 0)).toBe(10);
  });

  it('gives everyone who contributed at least a point when the pool goes round', () => {
    // A tiny contribution alongside a huge one would otherwise round to zero.
    const standings = [standing('whale', 9999, 1, 0.9999), standing('minnow', 1, 2, 0.0001)];
    const payout = computePayout(goal, standings);
    expect(payout.find((p) => p.playerId === 'minnow')?.points).toBeGreaterThanOrEqual(1);
    expect(payout.reduce((sum, p) => sum + p.points, 0)).toBe(10);
  });

  it('rewards the bigger contribution with more points', () => {
    const standings = [standing('a', 90, 1, 0.9), standing('b', 10, 2, 0.1)];
    const payout = computePayout(goal, standings);
    const a = payout.find((p) => p.playerId === 'a')!.points;
    const b = payout.find((p) => p.playerId === 'b')!.points;
    expect(a).toBeGreaterThan(b);
  });

  it('never overspends when the pool is smaller than the crew', () => {
    const small = { ...goal, rewardPool: 2 };
    const standings = [
      standing('a', 50, 1, 0.5),
      standing('b', 30, 2, 0.3),
      standing('c', 20, 3, 0.2),
    ];
    const payout = computePayout(small, standings);
    expect(payout.reduce((sum, p) => sum + p.points, 0)).toBe(2);
    // Anyone rounded to zero is dropped rather than filed as a no-op suggestion.
    expect(payout.every((p) => p.points > 0)).toBe(true);
  });

  it('pays nothing when the pool is zero', () => {
    expect(computePayout({ ...goal, rewardPool: 0 }, [standing('a', 10, 1, 1)])).toEqual([]);
  });

  it('pays nothing when nobody contributed', () => {
    expect(computePayout(goal, [])).toEqual([]);
  });
});

describe('computePayout — podium', () => {
  const goal = { rewardMode: 'podium' as const, rewardPool: 0, rewardFirst: 6, rewardSecond: 3, rewardThird: 1 };

  it('awards the top three in order', () => {
    const standings = [
      standing('a', 100, 1, 0.5),
      standing('b', 60, 2, 0.3),
      standing('c', 40, 3, 0.2),
    ];
    const payout = computePayout(goal, standings);
    expect(payout.map((p) => [p.playerId, p.points])).toEqual([
      ['a', 6],
      ['b', 3],
      ['c', 1],
    ]);
  });

  it('ignores everyone outside the podium', () => {
    const standings = [
      standing('a', 100, 1, 0.4),
      standing('b', 80, 2, 0.3),
      standing('c', 50, 3, 0.2),
      standing('d', 20, 4, 0.1),
    ];
    const payout = computePayout(goal, standings);
    expect(payout).toHaveLength(3);
    expect(payout.some((p) => p.playerId === 'd')).toBe(false);
  });

  it('handles fewer contributors than podium places', () => {
    const payout = computePayout(goal, [standing('a', 100, 1, 1)]);
    expect(payout).toEqual([expect.objectContaining({ playerId: 'a', points: 6 })]);
  });

  it('drops places set to zero rather than filing an empty award', () => {
    const noThird = { ...goal, rewardThird: 0 };
    const standings = [standing('a', 100, 1, 0.5), standing('b', 60, 2, 0.3), standing('c', 40, 3, 0.2)];
    const payout = computePayout(noThird, standings);
    expect(payout).toHaveLength(2);
  });
});

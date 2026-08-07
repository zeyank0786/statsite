import { describe, it, expect } from 'vitest';
import { computeAchievements, type SocialCounts } from '@/lib/achievements';
import { buildPlayerAggregates, type StatRow, type HistoryRow } from '@/lib/serverStats';
import { CATEGORY_ORDER } from '@/lib/categories';

/**
 * Build a roster from a compact spec: player → category code → stat values.
 * Stat ids/codes are generated so every stat is distinct.
 */
function roster(spec: Record<string, Record<string, number[]>>): StatRow[] {
  const rows: StatRow[] = [];
  for (const [playerId, cats] of Object.entries(spec)) {
    for (const [categoryCode, values] of Object.entries(cats)) {
      values.forEach((value, i) => {
        const letter = String.fromCharCode(97 + i);
        rows.push({
          playerId,
          username: playerId,
          statId: `${playerId}-${categoryCode}-${letter}`,
          statCode: `${categoryCode}-${letter}`,
          statLabel: `${categoryCode.toUpperCase()} ${letter.toUpperCase()}`,
          categoryCode,
          categoryLabel: categoryCode,
          value,
        });
      });
    }
  }
  return rows;
}

/** All seven canonical categories of ten stats each, every stat at `value`. */
const flatRoster = (playerId: string, value: number) =>
  roster({ [playerId]: Object.fromEntries(CATEGORY_ORDER.map((c) => [c, Array(10).fill(value)])) });

const earnedIds = (players: ReturnType<typeof buildPlayerAggregates>, history: HistoryRow[] = [], social: Record<string, SocialCounts> = {}) => {
  const result = computeAchievements(players, history, social);
  return new Set((result[players[0].id] || []).filter((a) => a.earned).map((a) => a.id));
};

describe('computeAchievements — structure', () => {
  it('returns the same full catalogue for every player', () => {
    const players = buildPlayerAggregates([...flatRoster('p1', 5), ...flatRoster('p2', 50)]);
    const result = computeAchievements(players, []);
    const ids1 = result['p1'].map((a) => a.id);
    const ids2 = result['p2'].map((a) => a.id);
    expect(ids1).toEqual(ids2);
    expect(ids1.length).toBeGreaterThan(0);
  });

  it('has no duplicate achievement ids', () => {
    const players = buildPlayerAggregates(flatRoster('p1', 5));
    const ids = computeAchievements(players, [])['p1'].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares a valid rarity on every achievement', () => {
    const players = buildPlayerAggregates(flatRoster('p1', 5));
    for (const a of computeAchievements(players, [])['p1']) {
      expect(['common', 'rare', 'epic', 'mythic']).toContain(a.rarity);
    }
  });

  it('gives every achievement a name, description, icon and group', () => {
    const players = buildPlayerAggregates(flatRoster('p1', 5));
    for (const a of computeAchievements(players, [])['p1']) {
      expect(a.name, a.id).toBeTruthy();
      expect(a.description, a.id).toBeTruthy();
      expect(a.icon, a.id).toBeTruthy();
      expect(a.group, a.id).toBeTruthy();
    }
  });

  it('handles an empty roster without throwing', () => {
    expect(() => computeAchievements([], [])).not.toThrow();
  });

  it('handles a player with history but no social counts', () => {
    const players = buildPlayerAggregates(flatRoster('p1', 5));
    expect(() => computeAchievements(players, [], {})).not.toThrow();
  });
});

describe('computeAchievements — the no-tanking invariant', () => {
  /**
   * The documented design rule: every condition is satisfied by going UP, so
   * there is never an incentive to let a stat fall. Lowering a stat value must
   * never turn an unearned achievement into an earned one.
   */
  it('never turns a lower stat value into a NEW achievement', () => {
    const strong = buildPlayerAggregates(flatRoster('p1', 60));
    const weak = buildPlayerAggregates(flatRoster('p1', 20));

    const strongEarned = earnedIds(strong);
    const weakEarned = earnedIds(weak);

    // Everything the weak player earned, the strong player must also have.
    const onlyWhenWeak = [...weakEarned].filter((id) => !strongEarned.has(id));
    expect(onlyWhenWeak).toEqual([]);
  });

  it('holds across the whole tier ladder', () => {
    const ladder = [5, 10, 30, 60, 90, 100, 200];
    let previous = new Set<string>();
    for (const value of ladder) {
      const players = buildPlayerAggregates(flatRoster('p1', value));
      const current = earnedIds(players);
      const lost = [...previous].filter((id) => !current.has(id));
      expect(lost, `climbing to ${value} pts revoked: ${lost.join(', ')}`).toEqual([]);
      previous = current;
    }
  });

  it('never rewards a downward stat change in history', () => {
    const players = buildPlayerAggregates(flatRoster('p1', 30));
    const upOnly: HistoryRow[] = [
      { playerId: 'p1', statId: 'p1-mtl-a', statCode: 'mtl-a', categoryCode: 'mtl', oldValue: 5, newValue: 30, createdAt: new Date().toISOString() },
    ];
    const withDrop: HistoryRow[] = [
      ...upOnly,
      { playerId: 'p1', statId: 'p1-mtl-b', statCode: 'mtl-b', categoryCode: 'mtl', oldValue: 60, newValue: 30, createdAt: new Date().toISOString() },
    ];

    const a = earnedIds(players, upOnly);
    const b = earnedIds(players, withDrop);
    const gainedByDropping = [...b].filter((id) => !a.has(id));
    expect(gainedByDropping).toEqual([]);
  });
});

describe('computeAchievements — tier milestones', () => {
  const at = (value: number) => earnedIds(buildPlayerAggregates(flatRoster('p1', value)));

  it('awards each rung as the stat clears it', () => {
    expect(at(5).has('first-steps')).toBe(false);
    expect(at(10).has('first-steps')).toBe(true);
    expect(at(30).has('established')).toBe(true);
    expect(at(60).has('elite')).toBe(true);
    expect(at(90).has('legendary')).toBe(true);
  });

  it('does not award a rung the player has not reached', () => {
    const low = at(10);
    expect(low.has('established')).toBe(false);
    expect(low.has('elite')).toBe(false);
    expect(low.has('legendary')).toBe(false);
    expect(low.has('century')).toBe(false);
  });

  it('awards Century at exactly 100 and Double Century at 200', () => {
    expect(at(99).has('century')).toBe(false);
    expect(at(100).has('century')).toBe(true);
    expect(at(199).has('double-century')).toBe(false);
    expect(at(200).has('double-century')).toBe(true);
  });

  it('needs two Legendary stats for Double Legend', () => {
    const one = roster({ p1: { mtl: [90, 5], phy: [5] } });
    const two = roster({ p1: { mtl: [90, 90], phy: [5] } });
    expect(earnedIds(buildPlayerAggregates(one)).has('double-legend')).toBe(false);
    expect(earnedIds(buildPlayerAggregates(two)).has('double-legend')).toBe(true);
  });

  it('needs EVERY stat at 10+ for No Weak Links', () => {
    const oneLow = roster({ p1: { mtl: [50, 50, 9] } });
    const allUp = roster({ p1: { mtl: [50, 50, 10] } });
    expect(earnedIds(buildPlayerAggregates(oneLow)).has('no-weak-links')).toBe(false);
    expect(earnedIds(buildPlayerAggregates(allUp)).has('no-weak-links')).toBe(true);
  });
});

describe('computeAchievements — Ground Up', () => {
  it('requires the climb to start from the 5-point baseline', () => {
    const players = buildPlayerAggregates(roster({ p1: { mtl: [40] } }));
    const fromBaseline: HistoryRow[] = [
      { playerId: 'p1', statId: 'p1-mtl-a', statCode: 'mtl-a', categoryCode: 'mtl', oldValue: 5, newValue: 40, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const fromHigher: HistoryRow[] = [
      { playerId: 'p1', statId: 'p1-mtl-a', statCode: 'mtl-a', categoryCode: 'mtl', oldValue: 25, newValue: 40, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(earnedIds(players, fromBaseline).has('ground-up')).toBe(true);
    expect(earnedIds(players, fromHigher).has('ground-up')).toBe(false);
  });

  it('keys off the FIRST recorded change, so a later dip cannot manufacture it', () => {
    const players = buildPlayerAggregates(roster({ p1: { mtl: [40] } }));
    // Starts at 25 (too high to qualify), dips to 5, then climbs.
    const dipped: HistoryRow[] = [
      { playerId: 'p1', statId: 'p1-mtl-a', statCode: 'mtl-a', categoryCode: 'mtl', oldValue: 25, newValue: 5, createdAt: '2026-01-01T00:00:00.000Z' },
      { playerId: 'p1', statId: 'p1-mtl-a', statCode: 'mtl-a', categoryCode: 'mtl', oldValue: 5, newValue: 40, createdAt: '2026-02-01T00:00:00.000Z' },
    ];
    expect(earnedIds(players, dipped).has('ground-up')).toBe(false);
  });
});

describe('computeAchievements — crew-relative awards', () => {
  const earnedFor = (id: string, players: ReturnType<typeof buildPlayerAggregates>, achId: string) =>
    computeAchievements(players, [])[id].find((a) => a.id === achId)?.earned;

  it('gives Top of the Board to the crew leader, not the trailer', () => {
    const players = buildPlayerAggregates([...flatRoster('leader', 60), ...flatRoster('trailer', 10)]);
    expect(earnedFor('leader', players, 'top-board')).toBe(true);
    expect(earnedFor('trailer', players, 'top-board')).toBe(false);
  });

  it('withholds crew-relative awards from a solo player — there is nobody to beat', () => {
    const players = buildPlayerAggregates(flatRoster('p1', 50));
    expect(earnedFor('p1', players, 'top-board')).toBe(false);
    expect(earnedFor('p1', players, 'pacesetter')).toBe(false);
  });

  it('only awards Podium once the crew is bigger than the podium itself', () => {
    const three = buildPlayerAggregates(
      ['a', 'b', 'c'].flatMap((id, i) => flatRoster(id, 50 - i * 10))
    );
    // With exactly 3 players, "top 3" is everyone — not an achievement.
    expect(earnedFor('a', three, 'podium')).toBe(false);

    const four = buildPlayerAggregates(
      ['a', 'b', 'c', 'd'].flatMap((id, i) => flatRoster(id, 50 - i * 10))
    );
    expect(earnedFor('a', four, 'podium')).toBe(true);
    expect(earnedFor('d', four, 'podium')).toBe(false);
  });

  it('gives Pacesetter to whoever owns the highest category total', () => {
    const players = buildPlayerAggregates([
      ...roster({ big: { mtl: [90, 90], phy: [5] } }),
      ...roster({ small: { mtl: [10, 10], phy: [5] } }),
    ]);
    expect(earnedFor('big', players, 'pacesetter')).toBe(true);
    expect(earnedFor('small', players, 'pacesetter')).toBe(false);
  });
});

describe('computeAchievements — targets', () => {
  it('awards Locked On only for gains made AFTER the target was set', () => {
    const players = buildPlayerAggregates(roster({ p1: { mtl: [40] } }));
    const history: HistoryRow[] = [
      { playerId: 'p1', statId: 'p1-mtl-a', statCode: 'mtl-a', categoryCode: 'mtl', oldValue: 5, newValue: 40, createdAt: '2026-03-01T00:00:00.000Z' },
    ];
    const base: SocialCounts = { evidencePosts: 0, approvedProposals: 0, votesCast: 0 };

    const targetSetBefore = { p1: { ...base, targets: [{ statCode: 'mtl-a', since: '2026-01-01T00:00:00.000Z' }] } };
    const targetSetAfter = { p1: { ...base, targets: [{ statCode: 'mtl-a', since: '2026-06-01T00:00:00.000Z' }] } };

    expect(earnedIds(players, history, targetSetBefore).has('locked-on')).toBe(true);
    expect(earnedIds(players, history, targetSetAfter).has('locked-on')).toBe(false);
  });
});

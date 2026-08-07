import { describe, it, expect } from 'vitest';
import { buildPlayerAggregates, historySince, daysAgo, type StatRow, type HistoryRow } from '@/lib/serverStats';
import { CATEGORY_ORDER } from '@/lib/categories';

const row = (over: Partial<StatRow>): StatRow => ({
  playerId: 'p1',
  username: 'alice',
  statId: 's1',
  statCode: 'mtl-a',
  statLabel: 'Stat A',
  categoryCode: 'mtl',
  categoryLabel: 'Mentality',
  value: 5,
  ...over,
});

const hist = (over: Partial<HistoryRow>): HistoryRow => ({
  playerId: 'p1',
  statId: 's1',
  statCode: 'mtl-a',
  categoryCode: 'mtl',
  oldValue: 5,
  newValue: 10,
  createdAt: new Date().toISOString(),
  ...over,
});

describe('buildPlayerAggregates', () => {
  it('groups flat rows into per-player, per-category totals', () => {
    const players = buildPlayerAggregates([
      row({ statId: 's1', statCode: 'mtl-a', value: 10 }),
      row({ statId: 's2', statCode: 'mtl-b', value: 20 }),
    ]);

    expect(players).toHaveLength(1);
    expect(players[0].categories).toHaveLength(1);
    expect(players[0].categories[0].total).toBe(30);
    expect(players[0].categories[0].avg).toBe(15);
    expect(players[0].totalSum).toBe(30);
  });

  it('computes overall as total divided by CATEGORY count', () => {
    const players = buildPlayerAggregates([
      row({ statId: 's1', categoryCode: 'mtl', value: 10 }),
      row({ statId: 's2', categoryCode: 'phy', categoryLabel: 'Physical', value: 30 }),
    ]);
    // 40 across 2 categories → 20
    expect(players[0].overall).toBe(20);
  });

  it('separates players', () => {
    const players = buildPlayerAggregates([
      row({ playerId: 'p1', username: 'alice', value: 10 }),
      row({ playerId: 'p2', username: 'bob', value: 40 }),
    ]);
    expect(players.map((p) => p.username)).toEqual(['bob', 'alice']);
  });

  it('sorts players by overall, descending', () => {
    const players = buildPlayerAggregates([
      row({ playerId: 'a', username: 'low', value: 1 }),
      row({ playerId: 'b', username: 'high', value: 99 }),
      row({ playerId: 'c', username: 'mid', value: 50 }),
    ]);
    expect(players.map((p) => p.username)).toEqual(['high', 'mid', 'low']);
  });

  it('orders categories canonically', () => {
    const players = buildPlayerAggregates([
      row({ statId: '1', categoryCode: 'enr', categoryLabel: 'Energy' }),
      row({ statId: '2', categoryCode: 'mtl', categoryLabel: 'Mentality' }),
      row({ statId: '3', categoryCode: 'kno', categoryLabel: 'Knowledge' }),
    ]);
    expect(players[0].categories.map((c) => c.code)).toEqual(['mtl', 'kno', 'enr']);
  });

  it('keeps admin-created categories, sorted after the canonical block', () => {
    const players = buildPlayerAggregates([
      row({ statId: '1', categoryCode: 'zeta', categoryLabel: 'Zeta' }),
      row({ statId: '2', categoryCode: 'mtl', categoryLabel: 'Mentality' }),
      row({ statId: '3', categoryCode: 'alpha', categoryLabel: 'Alpha' }),
    ]);
    expect(players[0].categories.map((c) => c.code)).toEqual(['mtl', 'alpha', 'zeta']);
  });

  it('never silently drops a category', () => {
    const codes = [...CATEGORY_ORDER, 'custom'];
    const players = buildPlayerAggregates(
      codes.map((code, i) => row({ statId: `s${i}`, categoryCode: code, categoryLabel: code }))
    );
    expect(players[0].categories).toHaveLength(codes.length);
  });

  it('returns an empty roster for no rows rather than throwing', () => {
    expect(buildPlayerAggregates([])).toEqual([]);
  });
});

describe('historySince / daysAgo', () => {
  const now = Date.now();

  it('keeps entries at or after the cutoff', () => {
    const recent = hist({ createdAt: new Date(now - 1000).toISOString() });
    const old = hist({ createdAt: new Date(now - 100 * 24 * 3600 * 1000).toISOString() });
    expect(historySince([recent, old], daysAgo(90))).toEqual([recent]);
  });

  it('drops unparseable timestamps instead of letting NaN through', () => {
    const bad = hist({ createdAt: 'not-a-date' });
    expect(historySince([bad], daysAgo(90))).toEqual([]);
  });

  it('daysAgo moves backwards in time', () => {
    expect(daysAgo(1)).toBeLessThan(Date.now());
    expect(daysAgo(90)).toBeLessThan(daysAgo(30));
  });
});

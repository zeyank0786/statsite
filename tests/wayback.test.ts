import { describe, it, expect } from 'vitest';
import { buildSnapshot, type ChangeRow, type StatRow } from '@/lib/wayback';

/**
 * The rewind is the whole feature: if it's off by one change, every date shows
 * a sheet that never existed.
 */

const stat = (statId: string, categoryCode: string, value: number): StatRow => ({
  statId,
  code: `${categoryCode}-a`,
  label: `Stat ${statId}`,
  categoryCode,
  categoryLabel: categoryCode.toUpperCase(),
  value,
});

const change = (statId: string, oldValue: number, newValue: number, createdAt: string): ChangeRow => ({
  statId,
  oldValue,
  newValue,
  createdAt,
});

describe('buildSnapshot', () => {
  const stats = [stat('s1', 'mtl', 10), stat('s2', 'phy', 7)];
  // s1: 5 → 8 (March), 8 → 10 (June). s2: 6 → 7 (April).
  const changes = [
    change('s1', 5, 8, '2026-03-01T00:00:00.000Z'),
    change('s2', 6, 7, '2026-04-01T00:00:00.000Z'),
    change('s1', 8, 10, '2026-06-01T00:00:00.000Z'),
  ];

  const valueOf = (at: string, statId: string) => {
    const snapshot = buildSnapshot(stats, changes, at);
    for (const category of snapshot.categories) {
      const found = category.stats.find((s) => s.statId === statId);
      if (found) return found.value;
    }
    throw new Error(`stat ${statId} missing from snapshot`);
  };

  it('returns current values when nothing has changed since the date', () => {
    expect(valueOf('2026-07-01T00:00:00.000Z', 's1')).toBe(10);
    expect(valueOf('2026-07-01T00:00:00.000Z', 's2')).toBe(7);
  });

  it('rewinds to the value that stood on the date', () => {
    // Between March and June, s1 sat at 8.
    expect(valueOf('2026-04-15T00:00:00.000Z', 's1')).toBe(8);
    // Before any change, s1 was 5.
    expect(valueOf('2026-01-01T00:00:00.000Z', 's1')).toBe(5);
  });

  it('rewinds each stat independently', () => {
    // February: s1 not yet raised (5), s2 not yet raised (6).
    expect(valueOf('2026-02-01T00:00:00.000Z', 's1')).toBe(5);
    expect(valueOf('2026-02-01T00:00:00.000Z', 's2')).toBe(6);
  });

  it('treats a change landing exactly on the date as already applied', () => {
    // The change at 2026-03-01T00:00:00Z is not "after" that instant.
    expect(valueOf('2026-03-01T00:00:00.000Z', 's1')).toBe(8);
  });

  it('computes overall as the mean category total', () => {
    // January: mtl total 5, phy total 6 → mean 5.5
    const snapshot = buildSnapshot(stats, changes, '2026-01-01T00:00:00.000Z');
    expect(snapshot.total).toBe(11);
    expect(snapshot.overall).toBe(5.5);
  });

  it('handles a player with no history at all', () => {
    const snapshot = buildSnapshot(stats, [], '2020-01-01T00:00:00.000Z');
    expect(snapshot.total).toBe(17);
    expect(snapshot.categories).toHaveLength(2);
  });

  it('handles a player with no stats', () => {
    const snapshot = buildSnapshot([], [], '2026-01-01T00:00:00.000Z');
    expect(snapshot.overall).toBe(0);
    expect(snapshot.total).toBe(0);
    expect(snapshot.categories).toEqual([]);
  });

  it('groups every stat under its category with a correct total', () => {
    const multi = [stat('a', 'mtl', 4), stat('b', 'mtl', 6), stat('c', 'phy', 3)];
    const snapshot = buildSnapshot(multi, [], '2026-05-01T00:00:00.000Z');
    const mtl = snapshot.categories.find((c) => c.code === 'mtl');
    expect(mtl?.stats).toHaveLength(2);
    expect(mtl?.total).toBe(10);
    expect(snapshot.overall).toBe(6.5); // (10 + 3) / 2
  });

  it('keeps the earliest post-date change, not the latest', () => {
    // Three changes after the date — the value then was the FIRST one's oldValue.
    const busy = [
      change('s1', 1, 2, '2026-02-01T00:00:00.000Z'),
      change('s1', 2, 3, '2026-03-01T00:00:00.000Z'),
      change('s1', 3, 4, '2026-04-01T00:00:00.000Z'),
    ];
    const snapshot = buildSnapshot([stat('s1', 'mtl', 4)], busy, '2026-01-01T00:00:00.000Z');
    expect(snapshot.categories[0].stats[0].value).toBe(1);
  });
});

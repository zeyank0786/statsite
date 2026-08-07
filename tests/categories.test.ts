import { describe, it, expect } from 'vitest';
import {
  CATEGORY_ORDER,
  STAT_TIERS,
  SCALE_FLOOR,
  RADAR_STAT_BASELINE,
  getCategoryMeta,
  categoryCodeOfStat,
  orderCategories,
  orderStats,
  getStatTier,
  getNextTier,
  getValueColor,
  scaleMax,
  computeOverallScore,
  categoryRadarValue,
  categoryAvg,
} from '@/lib/categories';

const cat = (values: number[]) => ({ stats: values.map((value) => ({ value })) });

describe('getCategoryMeta', () => {
  it('resolves every canonical category', () => {
    for (const code of CATEGORY_ORDER) {
      expect(getCategoryMeta(code).code).toBe(code);
    }
  });

  it('is case-insensitive', () => {
    expect(getCategoryMeta('MTL')).toBe(getCategoryMeta('mtl'));
  });

  it('falls back rather than throwing on null/undefined/empty', () => {
    expect(getCategoryMeta(null).code).toBe('unknown');
    expect(getCategoryMeta(undefined).code).toBe('unknown');
    expect(getCategoryMeta('').code).toBe('unknown');
  });

  it('generates a stable colour for admin-created categories', () => {
    const a = getCategoryMeta('custom-cat', 'Custom');
    const b = getCategoryMeta('custom-cat', 'Custom');
    expect(a.hex).toBe(b.hex);
    expect(a.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.label).toBe('Custom');
  });

  it('gives different admin categories different colours', () => {
    expect(getCategoryMeta('alpha').hex).not.toBe(getCategoryMeta('beta').hex);
  });
});

describe('categoryCodeOfStat', () => {
  it('splits on the last hyphen so hyphenated category codes survive', () => {
    expect(categoryCodeOfStat('mtl-a')).toBe('mtl');
    expect(categoryCodeOfStat('my-custom-cat-b')).toBe('my-custom-cat');
  });

  it('returns the whole code when there is no hyphen', () => {
    expect(categoryCodeOfStat('mtl')).toBe('mtl');
  });

  it('handles empty input', () => {
    expect(categoryCodeOfStat(null)).toBe('');
    expect(categoryCodeOfStat(undefined)).toBe('');
  });
});

describe('orderCategories', () => {
  it('sorts into the canonical order from the official stats sheet', () => {
    const shuffled = [{ code: 'enr' }, { code: 'kno' }, { code: 'mtl' }, { code: 'ski' }];
    expect(orderCategories(shuffled).map((c) => c.code)).toEqual(['mtl', 'kno', 'ski', 'enr']);
  });

  it('puts unknown categories last without dropping them', () => {
    const result = orderCategories([{ code: 'zzz' }, { code: 'mtl' }]);
    expect(result.map((c) => c.code)).toEqual(['mtl', 'zzz']);
  });

  it('does not mutate its input', () => {
    const input = [{ code: 'enr' }, { code: 'mtl' }];
    orderCategories(input);
    expect(input.map((c) => c.code)).toEqual(['enr', 'mtl']);
  });
});

describe('orderStats', () => {
  it('sorts a→j within a category', () => {
    const shuffled = [{ code: 'mtl-c' }, { code: 'mtl-a' }, { code: 'mtl-j' }, { code: 'mtl-b' }];
    expect(orderStats(shuffled).map((s) => s.code)).toEqual(['mtl-a', 'mtl-b', 'mtl-c', 'mtl-j']);
  });

  it('sorts letters beyond j after the canonical block', () => {
    const result = orderStats([{ code: 'mtl-k' }, { code: 'mtl-a' }]);
    expect(result.map((s) => s.code)).toEqual(['mtl-a', 'mtl-k']);
  });

  it('uses the letter after the LAST hyphen, so hyphenated categories sort right', () => {
    const result = orderStats([{ code: 'my-cat-c' }, { code: 'my-cat-a' }]);
    expect(result.map((s) => s.code)).toEqual(['my-cat-a', 'my-cat-c']);
  });

  it('does not mutate its input', () => {
    const input = [{ code: 'mtl-c' }, { code: 'mtl-a' }];
    orderStats(input);
    expect(input.map((s) => s.code)).toEqual(['mtl-c', 'mtl-a']);
  });
});

describe('getStatTier', () => {
  it('maps each tier boundary to the right rung', () => {
    expect(getStatTier(0).name).toBe('Starting Out');
    expect(getStatTier(9).name).toBe('Starting Out');
    expect(getStatTier(10).name).toBe('Really Improving');
    expect(getStatTier(29).name).toBe('Really Improving');
    expect(getStatTier(30).name).toBe('Established');
    expect(getStatTier(59).name).toBe('Established');
    expect(getStatTier(60).name).toBe('Elite');
    expect(getStatTier(89).name).toBe('Elite');
    expect(getStatTier(90).name).toBe('Legendary');
    expect(getStatTier(100).name).toBe('Legendary');
  });

  it('keeps values past the top of the ladder Legendary', () => {
    expect(getStatTier(150).name).toBe('Legendary');
    expect(getStatTier(10_000).name).toBe('Legendary');
  });

  it('floors fractional values rather than falling through the ladder', () => {
    expect(getStatTier(9.9).name).toBe('Starting Out');
    expect(getStatTier(30.5).name).toBe('Established');
  });

  it('clamps negatives to the bottom rung', () => {
    expect(getStatTier(-5).name).toBe('Starting Out');
  });

  it('leaves no gaps between tiers', () => {
    for (let i = 1; i < STAT_TIERS.length; i++) {
      expect(STAT_TIERS[i].min).toBe(STAT_TIERS[i - 1].max + 1);
    }
  });
});

describe('getNextTier', () => {
  it('points at the next rung up', () => {
    expect(getNextTier(0)?.name).toBe('Really Improving');
    expect(getNextTier(60)?.name).toBe('Legendary');
  });

  it('returns null at Legendary', () => {
    expect(getNextTier(90)).toBeNull();
    expect(getNextTier(500)).toBeNull();
  });
});

describe('getValueColor', () => {
  it('is tier-aligned', () => {
    expect(getValueColor(95)).toBe(getStatTier(95).hex);
    expect(getValueColor(0)).toBe(STAT_TIERS[0].hex);
  });
});

describe('scaleMax', () => {
  it('never drops below the floor, so a fresh roster still renders', () => {
    expect(scaleMax([])).toBe(SCALE_FLOOR);
    expect(scaleMax([1, 2, 3])).toBe(SCALE_FLOOR);
  });

  it('uses the largest value once it clears the floor', () => {
    expect(scaleMax([5, 42, 8])).toBe(42);
  });

  it('treats missing values as zero rather than producing NaN', () => {
    expect(scaleMax([undefined as unknown as number, 20])).toBe(20);
  });

  it('honours a custom floor', () => {
    expect(scaleMax([2], 50)).toBe(50);
  });
});

describe('computeOverallScore', () => {
  it('averages category totals', () => {
    // totals: 30 and 10 → (30 + 10) / 2 = 20
    expect(computeOverallScore([cat([10, 10, 10]), cat([10])])).toBe(20);
  });

  it('returns 0 for an empty roster rather than NaN', () => {
    expect(computeOverallScore([])).toBe(0);
    expect(computeOverallScore(null as unknown as [])).toBe(0);
  });

  it('divides by category count, not stat count', () => {
    // One category of ten 5s = total 50, one category → 50
    expect(computeOverallScore([cat(Array(10).fill(5))])).toBe(50);
  });

  it('handles a category with no stats without dividing by zero', () => {
    expect(computeOverallScore([cat([10]), cat([])])).toBe(5);
  });
});

describe('categoryRadarValue', () => {
  it('normalises to a per-10-stats scale so uneven categories compare fairly', () => {
    // A 1-stat category averaging 10 and a 10-stat category averaging 10
    // must land on the same axis value.
    expect(categoryRadarValue([{ value: 10 }])).toBe(10 * RADAR_STAT_BASELINE);
    expect(categoryRadarValue(Array(10).fill({ value: 10 }))).toBe(10 * RADAR_STAT_BASELINE);
  });

  it('cannot be inflated purely by holding more stats', () => {
    const five = categoryRadarValue(Array(5).fill({ value: 7 }));
    const twenty = categoryRadarValue(Array(20).fill({ value: 7 }));
    expect(five).toBe(twenty);
  });

  it('returns 0 for an empty category', () => {
    expect(categoryRadarValue([])).toBe(0);
    expect(categoryRadarValue(null as unknown as [])).toBe(0);
  });
});

describe('categoryAvg', () => {
  it('averages stat values', () => {
    expect(categoryAvg([{ value: 10 }, { value: 20 }])).toBe(15);
  });

  it('returns 0 for an empty category rather than NaN', () => {
    expect(categoryAvg([])).toBe(0);
  });
});

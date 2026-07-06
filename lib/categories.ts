/**
 * Canonical category & stat ordering from OFFICIAL STATS SHEET.txt.
 * Every list of categories or stats in the app must respect this order
 * unless the user explicitly sorts differently.
 */

export const CATEGORY_ORDER = ['mtl', 'phy', 'kno', 'strs', 'stra', 'ski', 'enr'] as const;
export const STAT_LETTER_ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const;

export interface CategoryMeta {
  code: string;
  label: string;
  short: string;
  color: string; // CSS var
  hex: string;
  rgb: string; // "r, g, b"
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  mtl: { code: 'mtl', label: 'Mentality', short: 'MTL', color: 'var(--accent-cyan)', hex: '#22d3ee', rgb: '34, 211, 238' },
  phy: { code: 'phy', label: 'Physical Ability', short: 'PHY', color: 'var(--accent-pink)', hex: '#ec4899', rgb: '236, 72, 153' },
  kno: { code: 'kno', label: 'Knowledge', short: 'KNOW', color: 'var(--accent-purple)', hex: '#a855f7', rgb: '168, 85, 247' },
  strs: { code: 'strs', label: 'Street Smarts', short: 'STRS', color: 'var(--accent-orange)', hex: '#f97316', rgb: '249, 115, 22' },
  stra: { code: 'stra', label: 'Strategic Ability', short: 'STRA', color: 'var(--accent-green)', hex: '#34d399', rgb: '52, 211, 153' },
  ski: { code: 'ski', label: 'Skillset', short: 'SKI', color: 'var(--accent-blue)', hex: '#3b82f6', rgb: '59, 130, 246' },
  enr: { code: 'enr', label: 'Energy & Leadership', short: 'ENR', color: 'var(--accent-red)', hex: '#ef4444', rgb: '239, 68, 68' },
};

const FALLBACK_META: CategoryMeta = {
  code: 'unknown',
  label: 'Unknown',
  short: '???',
  color: 'var(--accent-cyan)',
  hex: '#22d3ee',
  rgb: '34, 211, 238',
};

export function getCategoryMeta(code: string | undefined | null): CategoryMeta {
  if (!code) return FALLBACK_META;
  return CATEGORY_META[code.toLowerCase()] || FALLBACK_META;
}

/** Sort categories (objects with a `code` field) into canonical order. */
export function orderCategories<T extends { code: string }>(categories: T[]): T[] {
  return [...categories].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.code?.toLowerCase() as any);
    const bi = CATEGORY_ORDER.indexOf(b.code?.toLowerCase() as any);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/** Sort stats (objects with a `code` like "mtl-a") a→j within a category. */
export function orderStats<T extends { code: string }>(stats: T[]): T[] {
  return [...stats].sort((a, b) => {
    const la = a.code?.split('-')[1]?.toLowerCase() || '';
    const lb = b.code?.split('-')[1]?.toLowerCase() || '';
    return STAT_LETTER_ORDER.indexOf(la as any) - STAT_LETTER_ORDER.indexOf(lb as any);
  });
}

/** Traffic-light color for a 0-10 stat value. */
export function getValueColor(value: number): string {
  if (value <= 3) return 'var(--accent-red)';
  if (value <= 7) return 'var(--accent-orange)';
  return 'var(--accent-green)';
}

/** The official overall score: sum of category totals / (categories - 1). */
export function computeOverallScore(categories: { stats: { value: number }[] }[]): number {
  if (!categories || categories.length <= 1) return 0;
  const totalSum = categories.reduce(
    (sum, cat) => sum + cat.stats.reduce((s, st) => s + st.value, 0),
    0
  );
  return totalSum / (categories.length - 1);
}

export function categoryAvg(stats: { value: number }[]): number {
  if (!stats || stats.length === 0) return 0;
  return stats.reduce((s, st) => s + st.value, 0) / stats.length;
}

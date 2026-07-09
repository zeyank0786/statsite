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

/** Deterministic color for admin-created categories not in the canonical set. */
function dynamicCategoryMeta(code: string, label?: string): CategoryMeta {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  const h = (hash * 137.508) % 360;
  const s = 0.78;
  const l = 0.62;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  const hex = `#${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return {
    code,
    label: label || code.toUpperCase(),
    short: code.toUpperCase().slice(0, 4),
    color: hex,
    hex,
    rgb: `${R}, ${G}, ${B}`,
  };
}

export function getCategoryMeta(code: string | undefined | null, label?: string): CategoryMeta {
  if (!code) return FALLBACK_META;
  const known = CATEGORY_META[code.toLowerCase()];
  if (known) return known;
  return dynamicCategoryMeta(code.toLowerCase(), label);
}

/** Sort categories (objects with a `code` field) into canonical order. */
export function orderCategories<T extends { code: string }>(categories: T[]): T[] {
  return [...categories].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.code?.toLowerCase() as any);
    const bi = CATEGORY_ORDER.indexOf(b.code?.toLowerCase() as any);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/**
 * Sort stats (objects with a `code` like "mtl-a") a→j within a category.
 * Admin-created stats with letters beyond j (or odd codes) sort after the
 * canonical block, alphabetically.
 */
export function orderStats<T extends { code: string }>(stats: T[]): T[] {
  const rank = (code: string) => {
    const letter = code?.split('-')[1]?.toLowerCase() || '';
    const idx = STAT_LETTER_ORDER.indexOf(letter as any);
    return idx === -1 ? 100 + (letter.charCodeAt(0) || 0) : idx;
  };
  return [...stats].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
}

/**
 * Stat tier ladder — every individual stat total maps to a named tier.
 * Defined up to 100; the ladder gets revisited when someone actually
 * hits triple digits (values past 100 stay Legendary).
 */
export interface StatTier {
  name: string;
  min: number;
  max: number; // inclusive
  hex: string;
}

export const STAT_TIERS: StatTier[] = [
  { name: 'Starting Out', min: 0, max: 9, hex: '#9ca3af' },
  { name: 'Really Improving', min: 10, max: 29, hex: '#22d3ee' },
  { name: 'Established', min: 30, max: 59, hex: '#34d399' },
  { name: 'Elite', min: 60, max: 89, hex: '#a855f7' },
  { name: 'Legendary', min: 90, max: 100, hex: '#fbbf24' },
];

export function getStatTier(value: number): StatTier {
  const v = Math.max(0, Math.floor(value));
  return STAT_TIERS.find((t) => v >= t.min && v <= t.max) || STAT_TIERS[STAT_TIERS.length - 1];
}

/** The next rung up, or null when already Legendary. */
export function getNextTier(value: number): StatTier | null {
  const current = getStatTier(value);
  const idx = STAT_TIERS.indexOf(current);
  return idx >= 0 && idx < STAT_TIERS.length - 1 ? STAT_TIERS[idx + 1] : null;
}

/** Traffic-light color for a stat value — tier-aligned. */
export function getValueColor(value: number): string {
  return getStatTier(value).hex;
}

/**
 * Stat values are unbounded running totals (floored at 0). Bars and radar
 * charts scale against the largest value in view, never less than this floor,
 * so a fresh roster still renders sensibly.
 */
export const SCALE_FLOOR = 10;

/** Max for a bar/axis given the values in view: at least SCALE_FLOOR. */
export function scaleMax(values: number[], floor: number = SCALE_FLOOR): number {
  return Math.max(floor, ...values.map((v) => v || 0));
}

/** The overall score: average category total (sum of category totals / category count). */
export function computeOverallScore(categories: { stats: { value: number }[] }[]): number {
  if (!categories || categories.length === 0) return 0;
  const totalSum = categories.reduce(
    (sum, cat) => sum + cat.stats.reduce((s, st) => s + st.value, 0),
    0
  );
  return totalSum / categories.length;
}

export function categoryAvg(stats: { value: number }[]): number {
  if (!stats || stats.length === 0) return 0;
  return stats.reduce((s, st) => s + st.value, 0) / stats.length;
}

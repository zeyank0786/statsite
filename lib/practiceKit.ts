/**
 * Shared machinery for the practice range.
 *
 * Every drill on the range takes the same 1–20 difficulty and has to turn it
 * into its own parameters — grid size, how long something is shown, how many
 * decoys. Doing that by hand in ten components produced ten slightly different
 * curves, so it lives here instead: `scale` for anything that grows with level,
 * `scaleDown` for anything that shrinks (display time, almost always), and
 * `step` for picking out of a fixed list of options.
 *
 * Pure functions only — no React, no DB, no browser APIs — so the drills stay
 * testable and this module can be imported from anywhere.
 */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 20;

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 5;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

/**
 * Map level 1–20 onto `from`–`to`, rounded.
 *
 * `curve` bends the ramp: 1 is linear, above 1 keeps the low levels gentle and
 * saves the jump for the top end, below 1 does the opposite. Most drills want a
 * touch above linear so level 3 is still genuinely easy.
 */
export function scale(level: number, from: number, to: number, curve = 1): number {
  const t = (clampLevel(level) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);
  return Math.round(from + (to - from) * Math.pow(t, curve));
}

/** `scale` for anything that gets *smaller* as it gets harder — read at the call site as intent. */
export function scaleDown(level: number, easiest: number, hardest: number, curve = 1): number {
  return scale(level, easiest, hardest, curve);
}

/** Pick the element of `options` that this level lands on. */
export function step<T>(level: number, options: readonly T[]): T {
  if (options.length === 0) throw new Error('step() needs at least one option');
  const t = (clampLevel(level) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);
  return options[Math.min(options.length - 1, Math.floor(t * options.length))];
}

export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Fisher–Yates on a copy — the input is never mutated. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `count` distinct items, or the whole list shuffled if there aren't enough. */
export function sample<T>(items: readonly T[], count: number): T[] {
  return shuffle(items).slice(0, Math.max(0, Math.min(count, items.length)));
}

/**
 * `count` distinct integers from `0`..`total - 1`.
 *
 * Grid drills need this constantly and the naive "keep drawing until you have
 * enough distinct ones" version degrades badly when count approaches total.
 */
export function sampleIndices(total: number, count: number): number[] {
  const all = Array.from({ length: total }, (_, i) => i);
  return sample(all, count);
}

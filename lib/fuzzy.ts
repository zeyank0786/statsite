/**
 * Subsequence fuzzy matching for the command palette.
 *
 * Deliberately tiny — no dependency, no index. The search space is a few
 * dozen pages plus 70 stats and a handful of players, so an O(n·m) scan per
 * keystroke is far below the threshold where anything smarter would pay off.
 */

export interface FuzzyResult {
  score: number;
  /** Indices in the haystack that matched, for highlighting. */
  matches: number[];
}

/**
 * Score `query` against `text`. Returns null when the query isn't a
 * subsequence of the text at all.
 *
 * Scoring favours, in order: consecutive runs, matches at word starts, and
 * matches early in the string — so typing "lb" ranks "Leaderboard" above
 * "Global Backup", and "ev" puts "Evidence" above "Achievements".
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, matches: [] };

  const t = text.toLowerCase();
  const matches: number[] = [];

  let score = 0;
  let ti = 0;
  let previousIndex = -1;

  for (const char of q) {
    const found = t.indexOf(char, ti);
    if (found === -1) return null;

    // Consecutive characters are a much stronger signal than scattered ones
    if (found === previousIndex + 1) score += 8;

    // Start of the string, or start of a word
    if (found === 0) score += 12;
    else if (/[\s\-_/]/.test(t[found - 1])) score += 10;

    // Earlier matches beat later ones, mildly
    score += Math.max(0, 6 - found / 4);

    matches.push(found);
    previousIndex = found;
    ti = found + 1;
  }

  // Prefer tighter matches: "ev" against "Evidence" beats "ev" against
  // "Every single achievement in the very long list"
  score -= (t.length - q.length) * 0.08;

  // An exact prefix is almost always what was meant
  if (t.startsWith(q)) score += 25;

  return { score, matches };
}

/**
 * Rank `items` against `query`, dropping non-matches. With an empty query the
 * original order is preserved so the palette can show a sensible default list.
 */
export function fuzzyRank<T>(
  items: T[],
  query: string,
  keyOf: (item: T) => string
): { item: T; score: number; matches: number[] }[] {
  if (!query.trim()) {
    return items.map((item) => ({ item, score: 0, matches: [] }));
  }

  const scored: { item: T; score: number; matches: number[] }[] = [];
  for (const item of items) {
    const result = fuzzyMatch(query, keyOf(item));
    if (result) scored.push({ item, score: result.score, matches: result.matches });
  }
  return scored.sort((a, b) => b.score - a.score);
}

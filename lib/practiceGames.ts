/**
 * The practice range — drills with no score, no board and no record.
 *
 * The ranked facility in `lib/training.ts` exists to produce something worth
 * telling the crew about: a run, a personal best, a crew record, and a
 * suggestion someone else can file off the back of it. That makes every drill
 * there a performance, which is the wrong setting for actually getting better
 * at something. You do not learn a memory technique while worrying about where
 * the attempt lands on a leaderboard.
 *
 * So this half is deliberately consequence-free. Nothing here is written to the
 * database — no API call, no `TrainingResult` row, no activity ticker entry, no
 * personal best. Close the tab and the only thing that persists is which
 * difficulty you last used, kept in your own browser so you do not have to drag
 * the slider back every time.
 *
 * That also means it costs nothing to play. Every game is client-side, this
 * catalog is a plain module the page imports directly rather than fetching, and
 * a locked-out player can still practise — there is nothing crew-visible for a
 * lockout to protect.
 *
 * Difficulty is a 1–20 slider on every game, and it is the player's to set.
 * There is no adaptive ramp, because the point of a practice range is to drill
 * the level you choose rather than the level a formula thinks you deserve.
 */

export type PracticeCategory = 'memory' | 'reasoning' | 'perception' | 'language';

export interface PracticeGame {
  id: string;
  name: string;
  tagline: string;
  /** What the drill trains, and how to get better at it. */
  description: string;
  category: PracticeCategory;
  emoji: string;
  hex: string;
}

export const PRACTICE_CATEGORY_LABELS: Record<PracticeCategory, string> = {
  memory: 'Memory',
  reasoning: 'Reasoning',
  perception: 'Perception',
  language: 'Language',
};

export const PRACTICE_GAMES: PracticeGame[] = [
  {
    id: 'spatial',
    name: 'Spatial Memory',
    tagline: 'Where were the lights?',
    description:
      'A grid flashes several cells at once, then goes dark. Tap the ones that were lit. Everything is shown simultaneously rather than in sequence, so this trains holding a whole picture rather than an order.',
    category: 'memory',
    emoji: '🔲',
    hex: '#a855f7',
  },
  {
    id: 'kim',
    name: "Kim's Game",
    tagline: 'Study the tray. Something will go missing.',
    description:
      'A tray of objects appears for a few seconds, then hides. When it comes back, something has been taken — say what. The scouting drill from Kipling, and still the best way to practise deliberate observation.',
    category: 'memory',
    emoji: '🫖',
    hex: '#eab308',
  },
  {
    id: 'digits',
    name: 'Digit Span',
    tagline: 'The oldest memory test there is.',
    description:
      'Digits appear one at a time, then you type them back. Past level ten they come back in reverse, which is a different and much harder skill — you have to hold the string and walk it backwards at the same time.',
    category: 'memory',
    emoji: '🔢',
    hex: '#3b82f6',
  },
  {
    id: 'pairs',
    name: 'Card Pairs',
    tagline: 'Turn two. Remember everything.',
    description:
      'Cards face down, find the matching pairs. The skill is not luck — it is remembering what you saw on the turns that missed, which is exactly what people fail to do.',
    category: 'memory',
    emoji: '🃏',
    hex: '#ec4899',
  },
  {
    id: 'words',
    name: 'Word List',
    tagline: 'Ten words. Now pick them out of thirty.',
    description:
      'Memorise a list, then find those words among decoys. Rote recall under interference — the decoys are chosen to feel plausible, so recognition alone will not carry you.',
    category: 'memory',
    emoji: '📝',
    hex: '#34d399',
  },
  {
    id: 'rotation',
    name: 'Mental Rotation',
    tagline: 'Same shape turned, or its mirror image?',
    description:
      'Two figures side by side. Decide whether one is simply the other rotated, or a reflection of it. The classic spatial-reasoning task — and one where going slowly genuinely helps.',
    category: 'perception',
    emoji: '🔄',
    hex: '#22d3ee',
  },
  {
    id: 'logic',
    name: 'Logic Grid',
    tagline: 'Four clues. One arrangement fits.',
    description:
      'Work out who has what from a handful of constraints. Pure elimination — every clue rules something out, and the answer falls out once you have crossed enough off.',
    category: 'reasoning',
    emoji: '🧩',
    hex: '#f97316',
  },
  {
    id: 'estimate',
    name: 'Estimation',
    tagline: 'Too many to count. Guess anyway.',
    description:
      'Dots flash for a moment. Say roughly how many. Deliberately too fast to count, because the skill being trained is judging a quantity at a glance rather than counting quickly.',
    category: 'perception',
    emoji: '👁️',
    hex: '#a855f7',
  },
  {
    id: 'anagram',
    name: 'Anagrams',
    tagline: 'The letters are all there. Rearrange them.',
    description:
      'One scrambled word at a time. Longer words at higher levels, and a hint if you want it — the drill is worth more when you sit with it before taking one.',
    category: 'language',
    emoji: '🔡',
    hex: '#eab308',
  },
  {
    id: 'matrix',
    name: 'Pattern Matrix',
    tagline: 'Find the rule. Complete the grid.',
    description:
      'A grid of shapes with one square missing. Something changes across each row and down each column — work out both rules and only one option fits.',
    category: 'reasoning',
    emoji: '⬛',
    hex: '#ec4899',
  },
];

export function getPracticeGame(id: string): PracticeGame | undefined {
  return PRACTICE_GAMES.find((g) => g.id === id);
}

import { query, queryAll } from './db';

/**
 * The Training Facility — drills you can actually play, with their own scores
 * and leaderboards.
 *
 * Deliberately a SEPARATE track from stats. The app's one hard rule is that a
 * stat only ever moves through a suggestion the crew voted on; a game that
 * paid out points directly would be the first thing in here that awards itself,
 * and the first thing worth grinding. So a strong run produces a record and a
 * leaderboard position, and a crewmate can turn that into a normal suggestion
 * — which still has to survive a vote.
 *
 * Scores are client-reported, which is fine precisely because of that: the
 * worst a faked run buys you is a line on a board your mates can see, and
 * anything that tries to become points goes past them anyway. The per-game
 * ceilings below exist to keep obvious junk out of the table, not to secure it.
 */

export type TrainingCategory =
  | 'memory'
  | 'reasoning'
  | 'attention'
  | 'reflex'
  | 'timing'
  | 'skill';

export interface TrainingGame {
  id: string;
  name: string;
  tagline: string;
  /** What the drill actually trains, in one line. */
  description: string;
  category: TrainingCategory;
  /** Stat category this most plausibly speaks to, for the propose deep-link. */
  statCategoryCode: string;
  /** How the score is phrased on the board. */
  scoreLabel: string;
  /** Sanity ceiling — junk filter, not anti-cheat. */
  maxScore: number;
  emoji: string;
  hex: string;
}

export const TRAINING_GAMES: TrainingGame[] = [
  {
    id: 'recall',
    name: 'Recall',
    tagline: 'Watch the sequence. Repeat it back.',
    description:
      'A grid flashes a growing sequence and you play it back. Working memory under load — one more tile every round until you drop it.',
    category: 'memory',
    statCategoryCode: 'mtl',
    scoreLabel: 'sequence length',
    maxScore: 40,
    emoji: '🧠',
    hex: '#a855f7',
  },
  {
    id: 'deduce',
    name: 'Deduce',
    tagline: 'Break the code from the clues.',
    description:
      'A hidden four-colour code. Each guess tells you how many are exactly right and how many are the right colour in the wrong place. Pure elimination.',
    category: 'reasoning',
    statCategoryCode: 'kno',
    scoreLabel: 'points',
    maxScore: 1000,
    emoji: '🔍',
    hex: '#22d3ee',
  },
  {
    id: 'focus',
    name: 'Focus',
    tagline: 'Was that letter here two ago?',
    description:
      'Letters stream past one at a time. Call a match whenever the current one repeats from two back. Sustained attention with nowhere to hide.',
    category: 'attention',
    statCategoryCode: 'mtl',
    scoreLabel: 'points',
    maxScore: 1000,
    emoji: '🎯',
    hex: '#f97316',
  },
  {
    id: 'reflex',
    name: 'Reflex',
    tagline: 'Hit the target the instant it lands.',
    description:
      'Targets appear at random. Hand-eye speed measured across ten of them — the fastest average wins, and jumping the gun costs you.',
    category: 'reflex',
    statCategoryCode: 'phy',
    scoreLabel: 'points',
    maxScore: 1000,
    emoji: '⚡',
    hex: '#34d399',
  },
  {
    id: 'chimp',
    name: 'Chimp Test',
    tagline: 'Numbers vanish. Tap them in order anyway.',
    description:
      'Numbers appear scattered, then blank out the moment you start. Spatial working memory — most people fall apart somewhere past eight.',
    category: 'memory',
    statCategoryCode: 'mtl',
    scoreLabel: 'numbers',
    maxScore: 30,
    emoji: '🐒',
    hex: '#eab308',
  },
  {
    id: 'stroop',
    name: 'Stroop',
    tagline: 'Name the ink, not the word.',
    description:
      'The word RED printed in blue: the answer is blue. Overriding the automatic read is the whole drill, and it gets harder the faster you go.',
    category: 'attention',
    statCategoryCode: 'mtl',
    scoreLabel: 'points',
    maxScore: 1000,
    emoji: '🎨',
    hex: '#ec4899',
  },
  {
    id: 'sequence',
    name: 'Sequence',
    tagline: '2, 4, 8, 16 — what comes next?',
    description:
      'Number patterns of rising difficulty, four options each. Pure inductive reasoning; one wrong answer ends the run.',
    category: 'reasoning',
    statCategoryCode: 'stra',
    scoreLabel: 'points',
    maxScore: 1000,
    emoji: '🔢',
    hex: '#3b82f6',
  },
  {
    id: 'arithmetic',
    name: 'Mental Maths',
    tagline: 'As many as you can in sixty seconds.',
    description:
      'Sums that get bigger the better you do. Speed and accuracy under a clock, with no working out on paper.',
    category: 'reasoning',
    statCategoryCode: 'kno',
    scoreLabel: 'correct',
    maxScore: 300,
    emoji: '➗',
    hex: '#a855f7',
  },
  {
    id: 'rhythm',
    name: 'Rhythm',
    tagline: 'The beat stops. You keep it.',
    description:
      'Four beats set the tempo, then silence — carry it on from memory. Scores how tightly your taps sit on the beat.',
    category: 'timing',
    statCategoryCode: 'ski',
    scoreLabel: 'points',
    maxScore: 1000,
    emoji: '🥁',
    hex: '#f97316',
  },
  {
    id: 'typing',
    name: 'Typing Sprint',
    tagline: 'Words per minute, docked for errors.',
    description:
      'Type the passage as fast and as cleanly as you can. Raw speed scaled by accuracy, so hammering it blind scores worse than typing properly.',
    category: 'skill',
    statCategoryCode: 'ski',
    scoreLabel: 'wpm',
    maxScore: 250,
    emoji: '⌨️',
    hex: '#22d3ee',
  },
  {
    id: 'search',
    name: 'Odd One Out',
    tagline: 'Find the tile that doesn’t belong.',
    description:
      'One tile is a slightly different shade. The grid grows and the difference shrinks every round, and a wrong tap ends it.',
    category: 'attention',
    statCategoryCode: 'strs',
    scoreLabel: 'rounds',
    maxScore: 40,
    emoji: '👁️',
    hex: '#34d399',
  },
];

export function getGame(gameId: string): TrainingGame | undefined {
  return TRAINING_GAMES.find((g) => g.id === gameId);
}

export interface TrainingResult {
  id: string;
  playerId: string;
  playerName: string;
  gameId: string;
  score: number;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  best: number;
  runs: number;
  lastPlayedAt: string;
  rank: number;
}

export async function ensureTrainingTables(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS TrainingResult (
       id        TEXT PRIMARY KEY,
       playerId  TEXT NOT NULL,
       gameId    TEXT NOT NULL,
       score     INTEGER NOT NULL,
       detail    TEXT,
       createdAt TEXT NOT NULL
     )`
  );
}

function mapResult(r: Record<string, unknown>): TrainingResult {
  let detail: Record<string, unknown> | null = null;
  if (r.detail) {
    try {
      detail = JSON.parse(String(r.detail));
    } catch {
      /* malformed detail is cosmetic — the score still stands */
    }
  }
  return {
    id: String(r.id),
    playerId: String(r.playerId),
    playerName: String(r.playerName || 'Unknown'),
    gameId: String(r.gameId),
    score: Number(r.score),
    detail,
    createdAt: String(r.createdAt),
  };
}

/** Best run per player per game, ranked — the crew board. */
export async function getLeaderboards(): Promise<Record<string, LeaderboardEntry[]>> {
  await ensureTrainingTables();
  const rows = await queryAll(
    `SELECT t.gameId, t.playerId, p.username AS playerName,
            MAX(t.score) AS best, COUNT(*) AS runs, MAX(t.createdAt) AS lastPlayedAt
     FROM TrainingResult t
     JOIN Player p ON t.playerId = p.id
     GROUP BY t.gameId, t.playerId`
  );

  const byGame: Record<string, LeaderboardEntry[]> = {};
  for (const r of rows as Record<string, unknown>[]) {
    const gameId = String(r.gameId);
    if (!byGame[gameId]) byGame[gameId] = [];
    byGame[gameId].push({
      playerId: String(r.playerId),
      playerName: String(r.playerName),
      best: Number(r.best),
      runs: Number(r.runs),
      lastPlayedAt: String(r.lastPlayedAt),
      rank: 0,
    });
  }
  for (const entries of Object.values(byGame)) {
    // Ties go to whoever set the score first — same principle as crew goals.
    entries.sort((a, b) => b.best - a.best || (a.lastPlayedAt < b.lastPlayedAt ? -1 : 1));
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });
  }
  return byGame;
}

export async function getRecentResults(limit = 25): Promise<TrainingResult[]> {
  await ensureTrainingTables();
  const rows = await queryAll(
    `SELECT t.*, p.username AS playerName
     FROM TrainingResult t JOIN Player p ON t.playerId = p.id
     ORDER BY t.createdAt DESC LIMIT ?`,
    [limit]
  );
  return (rows as Record<string, unknown>[]).map(mapResult);
}

export interface RecordedRun {
  result: TrainingResult;
  /** Beat your own previous best. */
  personalBest: boolean;
  /** Beat everyone's previous best — the crew record. */
  crewRecord: boolean;
  previousBest: number | null;
}

/**
 * Store a run and report what it beat.
 *
 * The two flags are the whole point of the feature's link to the rest of the
 * app: they're what makes a run worth telling the crew about, and what a
 * crewmate turns into a suggestion.
 */
export async function recordResult(
  playerId: string,
  gameId: string,
  score: number,
  detail: Record<string, unknown> | null
): Promise<RecordedRun> {
  await ensureTrainingTables();

  const priorRows = await queryAll(
    'SELECT playerId, MAX(score) AS best FROM TrainingResult WHERE gameId = ? GROUP BY playerId',
    [gameId]
  );
  let myPrevious: number | null = null;
  let crewPrevious: number | null = null;
  for (const r of priorRows as Record<string, unknown>[]) {
    const best = Number(r.best);
    if (String(r.playerId) === playerId) myPrevious = best;
    if (crewPrevious === null || best > crewPrevious) crewPrevious = best;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await query(
    'INSERT INTO TrainingResult (id, playerId, gameId, score, detail, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, playerId, gameId, score, detail ? JSON.stringify(detail) : null, now]
  );

  const nameRow = await queryAll('SELECT username FROM Player WHERE id = ?', [playerId]);
  const playerName = String((nameRow[0] as Record<string, unknown>)?.username || 'Unknown');

  return {
    result: { id, playerId, playerName, gameId, score, detail, createdAt: now },
    personalBest: myPrevious === null || score > myPrevious,
    crewRecord: crewPrevious === null || score > crewPrevious,
    previousBest: myPrevious,
  };
}

/**
 * Score helpers, kept server-adjacent so the board and the games agree on what
 * a number means.
 */

/** Deduce: solving in fewer guesses is worth more; an unsolved code scores 0. */
export function scoreDeduce(solved: boolean, guessesUsed: number, maxGuesses: number): number {
  if (!solved) return 0;
  const spare = Math.max(0, maxGuesses - guessesUsed);
  return Math.round(400 + (spare / Math.max(1, maxGuesses - 1)) * 600);
}

/** Focus: accuracy is everything; misses and false alarms both bite. */
export function scoreFocus(hits: number, misses: number, falseAlarms: number, targets: number): number {
  if (targets <= 0) return 0;
  const accuracy = Math.max(0, (hits - falseAlarms) / targets);
  return Math.max(0, Math.round(Math.min(1, accuracy) * 1000 - misses * 10));
}

/**
 * Reflex: 150ms average is a perfect 1000, 600ms scores nothing, linear in
 * between. Jumping the gun is penalised in the game itself.
 */
export function scoreReflex(averageMs: number): number {
  return rampDown(averageMs, 150, 600);
}

/**
 * Shared shape for "faster is better" drills: `best` ms or quicker is a full
 * 1000, `worst` or slower is 0, linear between. Clamped at both ends so an
 * outlier can't produce a negative or out-of-range score the API would reject.
 */
function rampDown(ms: number, best: number, worst: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const clamped = Math.min(worst, Math.max(best, ms));
  return Math.round(((worst - clamped) / (worst - best)) * 1000);
}

/**
 * Stroop: correct answers carry the score, wrong ones cost roughly three
 * right answers apiece. Naming the ink is easy if you go slowly, so the
 * penalty is what stops "answer instantly and eat the errors" winning.
 */
export function scoreStroop(correct: number, wrong: number, averageMs: number): number {
  if (correct <= 0) return 0;
  const net = Math.max(0, correct - wrong * 3);
  // Speed is a multiplier on the net, not a separate term: 600ms or quicker
  // is full value, 2s is half.
  const speed = 0.5 + rampDown(averageMs, 600, 2000) / 2000;
  return Math.min(1000, Math.round(net * 22 * speed));
}

/**
 * Sequence: later rounds are worth more than earlier ones, so surviving deep
 * beats grinding easy ones. Triangular growth — round n is worth 10n points.
 */
export function scoreSequence(roundsCleared: number): number {
  if (roundsCleared <= 0) return 0;
  return Math.min(1000, 10 * ((roundsCleared * (roundsCleared + 1)) / 2));
}

/**
 * Rhythm: average absolute drift from the beat. Dead on is 1000, 250ms out
 * scores nothing — beyond that you aren't keeping time in any meaningful sense.
 */
export function scoreRhythm(averageDriftMs: number): number {
  if (!Number.isFinite(averageDriftMs) || averageDriftMs < 0) return 0;
  const worst = 250;
  const clamped = Math.min(worst, averageDriftMs);
  return Math.round(((worst - clamped) / worst) * 1000);
}

/**
 * Typing: words per minute scaled by accuracy, so clean typing beats fast
 * nonsense. Accuracy is applied squared — 90% accurate at 80wpm should not
 * beat 98% accurate at 70wpm.
 */
export function scoreTyping(correctChars: number, totalTyped: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || totalTyped <= 0 || correctChars <= 0) return 0;
  // The standard definition: a "word" is five characters.
  const wpm = correctChars / 5 / (elapsedMs / 60000);
  const accuracy = Math.min(1, correctChars / totalTyped);
  return Math.max(0, Math.min(250, Math.round(wpm * accuracy * accuracy)));
}

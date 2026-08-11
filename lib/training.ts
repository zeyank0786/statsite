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

export type TrainingCategory = 'memory' | 'reasoning' | 'attention' | 'reflex';

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
  if (!Number.isFinite(averageMs) || averageMs <= 0) return 0;
  const best = 150;
  const worst = 600;
  const clamped = Math.min(worst, Math.max(best, averageMs));
  return Math.round(((worst - clamped) / (worst - best)) * 1000);
}

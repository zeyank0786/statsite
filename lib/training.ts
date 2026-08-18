import { query, queryAll } from './db';
import { ensureOnce } from './ensureOnce';

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
 * anything that tries to become points goes past them anyway.
 *
 * ── Every score is the game's own metric, and nothing is capped ──
 *
 * The first cut of this converted each drill into an abstract 0–1000 "points"
 * total. That was wrong twice over. It threw away the thing players actually
 * care about (round 46 of Sequence reported the same number as round 14,
 * because the formula saturated), and it made scores incomparable to the game
 * being played. Now a drill stores exactly what it measures — rounds, numbers,
 * sequence length, correct answers, wpm, milliseconds — and there is no
 * ceiling on any of them. Go as deep as you can.
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
  /** The unit stored in `score` — always the game's own metric. */
  scoreLabel: string;
  /**
   * True when a SMALLER score is a better run (reaction time, timing drift).
   * Leaderboards, personal bests and crew records all invert for these.
   */
  lowerIsBetter?: boolean;
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
    scoreLabel: 'tiles',
    emoji: '🧠',
    hex: '#a855f7',
  },
  {
    id: 'deduce',
    name: 'Deduce',
    tagline: 'Break one code, get another.',
    description:
      'A hidden four-colour code. Each guess tells you how many are exactly right and how many are the right colour in the wrong place. Crack it and a fresh one appears — keep going until one beats you.',
    category: 'reasoning',
    statCategoryCode: 'kno',
    scoreLabel: 'codes cracked',
    emoji: '🔍',
    hex: '#22d3ee',
  },
  {
    id: 'focus',
    name: 'Focus',
    tagline: 'Was that letter here two ago?',
    description:
      'Letters stream past one at a time. Call a match whenever the current one repeats from two back. It never stops on its own — three mistakes and you are out.',
    category: 'attention',
    statCategoryCode: 'mtl',
    scoreLabel: 'letters survived',
    emoji: '🎯',
    hex: '#f97316',
  },
  {
    id: 'reflex',
    name: 'Reflex',
    tagline: 'Hit the target the instant it lands.',
    description:
      'Targets appear at random. Hand-eye speed across ten of them, scored as your average reaction time — so the lowest number wins, and jumping the gun adds to it.',
    category: 'reflex',
    statCategoryCode: 'phy',
    scoreLabel: 'ms average',
    lowerIsBetter: true,
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
    emoji: '🐒',
    hex: '#eab308',
  },
  {
    id: 'stroop',
    name: 'Stroop',
    tagline: 'Name the ink, not the word.',
    description:
      'The word RED printed in blue: the answer is blue. Forty-five seconds, scored on how many you get right — every wrong answer takes one back off.',
    category: 'attention',
    statCategoryCode: 'mtl',
    scoreLabel: 'net correct',
    emoji: '🎨',
    hex: '#ec4899',
  },
  {
    id: 'sequence',
    name: 'Sequence',
    tagline: '2, 4, 8, 16 — what comes next?',
    description:
      'Number patterns that keep getting harder, four options each. One wrong answer ends the run, and your score is simply how deep you got.',
    category: 'reasoning',
    statCategoryCode: 'stra',
    scoreLabel: 'rounds',
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
    emoji: '➗',
    hex: '#a855f7',
  },
  {
    id: 'rhythm',
    name: 'Rhythm',
    tagline: 'The beat stops. You keep it.',
    description:
      'Four beats set the tempo, then silence — carry it on from memory. Scored as your average drift from the beat, so the lowest number wins.',
    category: 'timing',
    statCategoryCode: 'ski',
    scoreLabel: 'ms drift',
    lowerIsBetter: true,
    emoji: '🥁',
    hex: '#f97316',
  },
  {
    id: 'typing',
    name: 'Typing Sprint',
    tagline: 'Words per minute, docked for errors.',
    description:
      'Type the passage as fast and as cleanly as you can. Net wpm — raw speed scaled by accuracy, so hammering it blind scores worse than typing properly.',
    category: 'skill',
    statCategoryCode: 'ski',
    scoreLabel: 'wpm',
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
    emoji: '👁️',
    hex: '#34d399',
  },
];

export function getGame(gameId: string): TrainingGame | undefined {
  return TRAINING_GAMES.find((g) => g.id === gameId);
}

/**
 * Absurdity guard, NOT a score cap.
 *
 * There is no limit on how well anyone can do — this exists only so a junk or
 * malformed POST can't write a nonsense row that would sit on top of a board
 * forever. No human run of any drill here comes within orders of magnitude.
 */
export const ABSURD_SCORE = 10_000_000;

/**
 * Scores written before drills stored their own metric. Those rows are on a
 * different scale entirely (an abstract 0–1000 total), so mixing them into a
 * board measured in rounds would be meaningless. They're left in the table
 * rather than deleted — nothing is lost, it just doesn't rank.
 */
export const CURRENT_SCORE_VERSION = 2;

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
  return ensureOnce('training', ensureTrainingTablesUncached);
}

async function ensureTrainingTablesUncached(): Promise<void> {
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
  // Additive — created on first use, like everything else here.
  try {
    await query('ALTER TABLE TrainingResult ADD COLUMN scoreVersion INTEGER NOT NULL DEFAULT 1');
  } catch {
    /* column already exists */
  }
}

/** Is `candidate` a better run than `current` for this game? */
export function isBetter(game: TrainingGame, candidate: number, current: number | null): boolean {
  if (current === null) return true;
  return game.lowerIsBetter ? candidate < current : candidate > current;
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

/**
 * Best run per player per game, ranked.
 *
 * Both extremes are selected because "best" depends on the drill: fastest
 * reaction time is the smallest number, deepest Sequence run is the largest.
 */
export async function getLeaderboards(): Promise<Record<string, LeaderboardEntry[]>> {
  await ensureTrainingTables();
  const rows = await queryAll(
    `SELECT t.gameId, t.playerId, p.username AS playerName,
            MAX(t.score) AS highest, MIN(t.score) AS lowest,
            COUNT(*) AS runs, MAX(t.createdAt) AS lastPlayedAt
     FROM TrainingResult t
     JOIN Player p ON t.playerId = p.id
     WHERE COALESCE(t.scoreVersion, 1) >= ?
     GROUP BY t.gameId, t.playerId`,
    [CURRENT_SCORE_VERSION]
  );

  const byGame: Record<string, LeaderboardEntry[]> = {};
  for (const r of rows as Record<string, unknown>[]) {
    const gameId = String(r.gameId);
    const game = getGame(gameId);
    if (!game) continue; // a drill that's been retired
    if (!byGame[gameId]) byGame[gameId] = [];
    byGame[gameId].push({
      playerId: String(r.playerId),
      playerName: String(r.playerName),
      best: Number(game.lowerIsBetter ? r.lowest : r.highest),
      runs: Number(r.runs),
      lastPlayedAt: String(r.lastPlayedAt),
      rank: 0,
    });
  }

  for (const [gameId, entries] of Object.entries(byGame)) {
    const game = getGame(gameId)!;
    // Ties go to whoever set the score first — same principle as crew goals.
    entries.sort(
      (a, b) =>
        (game.lowerIsBetter ? a.best - b.best : b.best - a.best) ||
        (a.lastPlayedAt < b.lastPlayedAt ? -1 : 1)
    );
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
     WHERE COALESCE(t.scoreVersion, 1) >= ?
     ORDER BY t.createdAt DESC LIMIT ?`,
    [CURRENT_SCORE_VERSION, limit]
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
  game: TrainingGame,
  score: number,
  detail: Record<string, unknown> | null
): Promise<RecordedRun> {
  await ensureTrainingTables();

  const priorRows = await queryAll(
    `SELECT playerId, MAX(score) AS highest, MIN(score) AS lowest
     FROM TrainingResult
     WHERE gameId = ? AND COALESCE(scoreVersion, 1) >= ?
     GROUP BY playerId`,
    [game.id, CURRENT_SCORE_VERSION]
  );
  let myPrevious: number | null = null;
  let crewPrevious: number | null = null;
  for (const r of priorRows as Record<string, unknown>[]) {
    const best = Number(game.lowerIsBetter ? r.lowest : r.highest);
    if (String(r.playerId) === playerId) myPrevious = best;
    if (isBetter(game, best, crewPrevious)) crewPrevious = best;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO TrainingResult (id, playerId, gameId, score, detail, createdAt, scoreVersion)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, playerId, game.id, score, detail ? JSON.stringify(detail) : null, now, CURRENT_SCORE_VERSION]
  );

  const nameRow = await queryAll('SELECT username FROM Player WHERE id = ?', [playerId]);
  const playerName = String((nameRow[0] as Record<string, unknown>)?.username || 'Unknown');

  return {
    result: { id, playerId, playerName, gameId: game.id, score, detail, createdAt: now },
    personalBest: isBetter(game, score, myPrevious),
    crewRecord: isBetter(game, score, crewPrevious),
    previousBest: myPrevious,
  };
}

/**
 * Typing is the one drill whose native metric is itself derived: "net wpm" is
 * the standard measure, raw speed scaled by accuracy. Accuracy is applied
 * squared so 90% at 80wpm doesn't beat 98% at 70wpm.
 *
 * Uncapped like everything else — type faster, score higher.
 */
export function netWpm(correctChars: number, totalTyped: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || totalTyped <= 0 || correctChars <= 0) return 0;
  // The standard definition: a "word" is five characters.
  const wpm = correctChars / 5 / (elapsedMs / 60000);
  const accuracy = Math.min(1, correctChars / totalTyped);
  return Math.max(0, Math.round(wpm * accuracy * accuracy));
}

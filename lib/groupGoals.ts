import { query, queryAll, queryOne } from './db';
import { ensureOnce } from './ensureOnce';

/**
 * Crew group goals — one target the whole crew chips away at together
 * ("10,000 push-ups this month"), rather than a personal ambition.
 *
 * Evidence-centred by construction: a contribution CANNOT exist without an
 * evidence post attached, and (matching the rest of the app) that post must
 * have been made by the contributor themselves. Contributions count the moment
 * they land — a month-long goal can't wait on a vote per set — but anyone in
 * the crew can strike a contribution they don't believe, which removes it from
 * the total and leaves the challenge on the record.
 *
 * The payout still obeys the app's one hard rule: stats only ever move through
 * a voted suggestion. Completing a goal computes each player's share and files
 * those as ordinary (uncapped) suggestions linked by `groupGoalId`, exactly as
 * ambition rewards do — nobody can award themselves anything.
 */

export type RewardMode = 'proportional' | 'podium';
export type GoalStatus = 'active' | 'completed' | 'archived';
export type ContributionStatus = 'counted' | 'struck';

/** Anti-typo guard, not a design cap — mirrors ambitions. */
export const MAX_REWARD_POOL = 500;
export const MAX_TARGET = 100_000_000;
export const PODIUM_PLACES = 3;

export interface Contribution {
  id: string;
  goalId: string;
  playerId: string;
  playerName: string;
  amount: number;
  evidenceId: string;
  evidenceUrl: string | null;
  evidenceType: string | null;
  note: string | null;
  status: ContributionStatus;
  struckById: string | null;
  struckByName: string | null;
  struckReason: string | null;
  createdAt: string;
}

export interface Standing {
  playerId: string;
  playerName: string;
  amount: number;
  /** 0–1 of the counted total. */
  share: number;
  rank: number;
  contributions: number;
  firstAt: string;
}

export interface GroupGoal {
  id: string;
  title: string;
  detail: string | null;
  unit: string;
  target: number;
  statId: string | null;
  statLabel: string | null;
  rewardMode: RewardMode;
  rewardPool: number;
  rewardFirst: number;
  rewardSecond: number;
  rewardThird: number;
  deadline: string | null;
  status: GoalStatus;
  completedAt: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** Counted contributions only. */
  progress: number;
  standings: Standing[];
  /** Players already covered by a filed payout suggestion. */
  paidOutPlayerIds: string[];
}

export async function ensureGroupGoalTables(): Promise<void> {
  return ensureOnce('groupGoals', ensureGroupGoalTablesUncached);
}

async function ensureGroupGoalTablesUncached(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS GroupGoal (
       id           TEXT PRIMARY KEY,
       title        TEXT NOT NULL,
       detail       TEXT,
       unit         TEXT NOT NULL,
       target       INTEGER NOT NULL,
       statId       TEXT,
       statLabel    TEXT,
       rewardMode   TEXT NOT NULL DEFAULT 'proportional',
       rewardPool   INTEGER NOT NULL DEFAULT 0,
       rewardFirst  INTEGER NOT NULL DEFAULT 0,
       rewardSecond INTEGER NOT NULL DEFAULT 0,
       rewardThird  INTEGER NOT NULL DEFAULT 0,
       deadline     TEXT,
       status       TEXT NOT NULL DEFAULT 'active',
       completedAt  TEXT,
       createdById  TEXT NOT NULL,
       createdAt    TEXT NOT NULL,
       updatedAt    TEXT NOT NULL
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS GroupGoalContribution (
       id           TEXT PRIMARY KEY,
       goalId       TEXT NOT NULL,
       playerId     TEXT NOT NULL,
       amount       INTEGER NOT NULL,
       evidenceId   TEXT NOT NULL,
       note         TEXT,
       status       TEXT NOT NULL DEFAULT 'counted',
       struckById   TEXT,
       struckReason TEXT,
       createdAt    TEXT NOT NULL
     )`
  );
  // Payout suggestions point back at their goal, the same way ambition
  // rewards do. Safe if it already exists.
  try {
    await query('ALTER TABLE Suggestion ADD COLUMN groupGoalId TEXT');
  } catch {
    /* column already exists */
  }
}

/**
 * Each player's total, ranked.
 *
 * Ties are broken by who got there first — in a race to a shared target, the
 * person who put the work in earlier carried more of the risk that it wouldn't
 * be finished at all.
 */
export function computeStandings(contributions: Contribution[]): Standing[] {
  const counted = contributions.filter((c) => c.status === 'counted');
  const byPlayer = new Map<string, Standing>();

  for (const c of counted) {
    const existing = byPlayer.get(c.playerId);
    if (existing) {
      existing.amount += c.amount;
      existing.contributions += 1;
      if (c.createdAt < existing.firstAt) existing.firstAt = c.createdAt;
    } else {
      byPlayer.set(c.playerId, {
        playerId: c.playerId,
        playerName: c.playerName,
        amount: c.amount,
        share: 0,
        rank: 0,
        contributions: 1,
        firstAt: c.createdAt,
      });
    }
  }

  const total = [...byPlayer.values()].reduce((sum, s) => sum + s.amount, 0);
  const standings = [...byPlayer.values()].sort(
    (a, b) => b.amount - a.amount || (a.firstAt < b.firstAt ? -1 : 1)
  );
  standings.forEach((s, i) => {
    s.rank = i + 1;
    s.share = total > 0 ? s.amount / total : 0;
  });
  return standings;
}

export interface PayoutShare {
  playerId: string;
  playerName: string;
  amount: number;
  rank: number;
  points: number;
  /** Why they got this, for the suggestion's written account. */
  basis: string;
}

/**
 * Turn final standings into per-player point awards.
 *
 * Proportional uses the largest-remainder method so the awards sum to EXACTLY
 * the pool — naive rounding either overspends or leaves points unspent, and
 * with a crew watching a shared total, "the numbers don't add up" is the one
 * thing that would sink the feature. When the pool is big enough to go round,
 * everyone who contributed is floored at 1 point, because turning up and
 * getting zero for it defeats the purpose of a group effort.
 */
export function computePayout(
  goal: Pick<GroupGoal, 'rewardMode' | 'rewardPool' | 'rewardFirst' | 'rewardSecond' | 'rewardThird'>,
  standings: Standing[]
): PayoutShare[] {
  const contributors = standings.filter((s) => s.amount > 0);
  if (contributors.length === 0) return [];

  if (goal.rewardMode === 'podium') {
    const podium = [goal.rewardFirst, goal.rewardSecond, goal.rewardThird];
    return contributors
      .slice(0, PODIUM_PLACES)
      .map((s, i) => ({
        playerId: s.playerId,
        playerName: s.playerName,
        amount: s.amount,
        rank: s.rank,
        points: podium[i] || 0,
        basis: `${['1st', '2nd', '3rd'][i]} place`,
      }))
      .filter((p) => p.points > 0);
  }

  const pool = Math.max(0, Math.floor(goal.rewardPool));
  if (pool === 0) return [];

  // Floor of 1 each, but only when there's enough to actually go round.
  const floorEach = pool >= contributors.length ? 1 : 0;
  const distributable = pool - floorEach * contributors.length;
  const total = contributors.reduce((sum, s) => sum + s.amount, 0);

  const exact = contributors.map((s) => (total > 0 ? (distributable * s.amount) / total : 0));
  const points = exact.map((v) => Math.floor(v));
  let remaining = distributable - points.reduce((sum, v) => sum + v, 0);

  // Hand the rounding leftovers to the biggest fractional parts first.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    points[i] += 1;
    remaining -= 1;
  }

  return contributors
    .map((s, i) => ({
      playerId: s.playerId,
      playerName: s.playerName,
      amount: s.amount,
      rank: s.rank,
      points: points[i] + floorEach,
      basis: `${Math.round(s.share * 100)}% of the total`,
    }))
    .filter((p) => p.points > 0);
}

function mapContribution(r: Record<string, unknown>): Contribution {
  const text = (key: string) => (r[key] == null ? null : String(r[key]));
  return {
    id: String(r.id),
    goalId: String(r.goalId),
    playerId: String(r.playerId),
    playerName: String(r.playerName || 'Unknown'),
    amount: Number(r.amount),
    evidenceId: String(r.evidenceId),
    evidenceUrl: text('evidenceUrl'),
    evidenceType: text('evidenceType'),
    note: text('note'),
    status: (String(r.status) as ContributionStatus) || 'counted',
    struckById: text('struckById'),
    struckByName: text('struckByName'),
    struckReason: text('struckReason'),
    createdAt: String(r.createdAt),
  };
}

export async function listContributions(goalId?: string): Promise<Contribution[]> {
  await ensureGroupGoalTables();
  const rows = await queryAll(
    `SELECT gc.*, p.username AS playerName,
            e.mediaUrl AS evidenceUrl, e.mediaType AS evidenceType,
            sp.username AS struckByName
     FROM GroupGoalContribution gc
     JOIN Player p ON gc.playerId = p.id
     LEFT JOIN Evidence e ON gc.evidenceId = e.id
     LEFT JOIN Player sp ON gc.struckById = sp.id
     ${goalId ? 'WHERE gc.goalId = ?' : ''}
     ORDER BY gc.createdAt DESC`,
    goalId ? [goalId] : []
  );
  return (rows as Record<string, unknown>[]).map(mapContribution);
}

function mapGoal(
  r: Record<string, unknown>,
  contributions: Contribution[],
  paidOutPlayerIds: string[]
): GroupGoal {
  const standings = computeStandings(contributions);
  const text = (key: string) => (r[key] == null ? null : String(r[key]));
  return {
    id: String(r.id),
    title: String(r.title),
    detail: text('detail'),
    unit: String(r.unit),
    target: Number(r.target),
    statId: text('statId'),
    statLabel: text('statLabel'),
    rewardMode: (String(r.rewardMode) as RewardMode) || 'proportional',
    rewardPool: Number(r.rewardPool || 0),
    rewardFirst: Number(r.rewardFirst || 0),
    rewardSecond: Number(r.rewardSecond || 0),
    rewardThird: Number(r.rewardThird || 0),
    deadline: text('deadline'),
    status: (String(r.status) as GoalStatus) || 'active',
    completedAt: text('completedAt'),
    createdById: String(r.createdById),
    createdByName: String(r.createdByName || 'Unknown'),
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
    progress: standings.reduce((sum, s) => sum + s.amount, 0),
    standings,
    paidOutPlayerIds,
  };
}

export async function listGoals(): Promise<GroupGoal[]> {
  await ensureGroupGoalTables();
  const rows = await queryAll(
    `SELECT g.*, p.username AS createdByName
     FROM GroupGoal g
     JOIN Player p ON g.createdById = p.id
     ORDER BY (g.status = 'active') DESC, COALESCE(g.completedAt, g.createdAt) DESC`
  );
  const contributions = await listContributions();
  const byGoal = new Map<string, Contribution[]>();
  for (const c of contributions) {
    if (!byGoal.has(c.goalId)) byGoal.set(c.goalId, []);
    byGoal.get(c.goalId)!.push(c);
  }

  // Which players already have a payout suggestion filed, so the UI never
  // offers to file a second one for the same person.
  const paidRows = await queryAll(
    `SELECT groupGoalId, playerId FROM Suggestion
     WHERE groupGoalId IS NOT NULL AND status IN ('pending','approved')`
  ).catch(() => [] as unknown[]);
  const paidByGoal = new Map<string, string[]>();
  for (const r of paidRows as Record<string, unknown>[]) {
    const key = String(r.groupGoalId);
    if (!paidByGoal.has(key)) paidByGoal.set(key, []);
    paidByGoal.get(key)!.push(String(r.playerId));
  }

  return (rows as Record<string, unknown>[]).map((r) =>
    mapGoal(r, byGoal.get(String(r.id)) || [], paidByGoal.get(String(r.id)) || [])
  );
}

export async function getGoal(goalId: string): Promise<GroupGoal | null> {
  await ensureGroupGoalTables();
  const row = await queryOne(
    `SELECT g.*, p.username AS createdByName
     FROM GroupGoal g JOIN Player p ON g.createdById = p.id
     WHERE g.id = ?`,
    [goalId]
  );
  if (!row) return null;
  const paidRows = await queryAll(
    `SELECT playerId FROM Suggestion
     WHERE groupGoalId = ? AND status IN ('pending','approved')`,
    [goalId]
  ).catch(() => [] as unknown[]);
  return mapGoal(
    row as Record<string, unknown>,
    await listContributions(goalId),
    (paidRows as Record<string, unknown>[]).map((r) => String(r.playerId))
  );
}

/**
 * Flip a goal to completed once the counted total reaches its target.
 *
 * Called after every contribution change (including strikes), so a goal that
 * drops back below target because a contribution was struck re-opens rather
 * than staying falsely complete.
 */
export async function syncGoalCompletion(goalId: string): Promise<GroupGoal | null> {
  const goal = await getGoal(goalId);
  if (!goal || goal.status === 'archived') return goal;

  const reached = goal.progress >= goal.target;
  const now = new Date().toISOString();

  if (reached && goal.status !== 'completed') {
    await query('UPDATE GroupGoal SET status = ?, completedAt = ?, updatedAt = ? WHERE id = ?', [
      'completed',
      now,
      now,
      goalId,
    ]);
    return getGoal(goalId);
  }
  // Only re-open while nothing has been paid out — clawing back an approved
  // award would mean editing stats outside the vote system.
  if (!reached && goal.status === 'completed' && goal.paidOutPlayerIds.length === 0) {
    await query('UPDATE GroupGoal SET status = ?, completedAt = NULL, updatedAt = ? WHERE id = ?', [
      'active',
      now,
      goalId,
    ]);
    return getGoal(goalId);
  }
  return goal;
}

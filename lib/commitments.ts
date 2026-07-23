import { query, queryOne, queryAll } from './db';
import { getEligibleVoterIds } from './suggestionEngine';
import { announceStatMilestones } from './milestones';
import { firePush } from './push';
import { v4 as uuid } from 'uuid';

/**
 * Commitments — a public promise with a deadline, judged by the crew.
 *
 *   declare intent → check in with evidence → deadline → verdict → stats move
 *
 * Everything else in 4WARD is retrospective (evidence proves the past,
 * suggestions reward it). This is the forward-looking half, and it makes stat
 * changes automatic instead of relying on someone remembering to file a
 * suggestion.
 *
 * Deliberate rules (decided with Zeyan):
 * - You commit only for yourself.
 * - A miss is RECORDED, never penalised — stats only ever move on 'kept', so
 *   people stay willing to promise ambitious things.
 * - Verdict = strict majority of eligible voters, reusing the suggestion
 *   engine's eligibility (active ∧ claimed ∧ not vote-locked ∧ not you).
 * - Forfeit is self-serve and counts as a miss.
 * - Withdrawal for genuinely unavoidable circumstances does NOT count as a
 *   miss, but needs a UNANIMOUS yes from every eligible voter — one 'no' and
 *   the commitment simply resumes.
 */

export type CommitmentStatus =
  | 'active'
  | 'awaiting_verdict'
  | 'withdraw_pending'
  | 'kept'
  | 'missed'
  | 'withdrawn';

export type Cadence = 'none' | 'weekly';

export const MIN_DEADLINE_HOURS = 12;
export const MAX_DEADLINE_DAYS = 365;

let tablesReady = false;

/** All tables self-create on first use — no manual Turso migration. */
export async function ensureCommitmentTables(): Promise<void> {
  if (tablesReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS Commitment (
       id             TEXT PRIMARY KEY,
       playerId       TEXT NOT NULL,
       title          TEXT NOT NULL,
       detail         TEXT,
       cadence        TEXT NOT NULL DEFAULT 'none',
       deadline       TEXT NOT NULL,
       status         TEXT NOT NULL DEFAULT 'active',
       withdrawReason TEXT,
       createdAt      TEXT NOT NULL,
       updatedAt      TEXT NOT NULL,
       resolvedAt     TEXT
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS CommitmentStat (
       commitmentId TEXT NOT NULL,
       statId       TEXT NOT NULL,
       delta        INTEGER NOT NULL,
       PRIMARY KEY (commitmentId, statId)
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS CommitmentCheckIn (
       id           TEXT PRIMARY KEY,
       commitmentId TEXT NOT NULL,
       evidenceId   TEXT,
       note         TEXT,
       createdAt    TEXT NOT NULL
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS CommitmentVote (
       id           TEXT PRIMARY KEY,
       commitmentId TEXT NOT NULL,
       voterId      TEXT NOT NULL,
       kind         TEXT NOT NULL,
       choice       TEXT NOT NULL,
       createdAt    TEXT NOT NULL,
       UNIQUE(commitmentId, voterId, kind)
     )`
  );
  tablesReady = true;
}

export interface CommitmentRow {
  id: string;
  playerId: string;
  title: string;
  detail: string | null;
  cadence: Cadence;
  deadline: string;
  status: CommitmentStatus;
  withdrawReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export const OPEN_STATUSES: CommitmentStatus[] = ['active', 'awaiting_verdict', 'withdraw_pending'];

export function isOpen(status: string): boolean {
  return OPEN_STATUSES.includes(status as CommitmentStatus);
}

/** Completion rate ignores withdrawals — they were excused, not failed. */
export function completionRate(kept: number, missed: number): number | null {
  const judged = kept + missed;
  return judged === 0 ? null : kept / judged;
}

/* ============================ Tallying ============================ */

export interface VoteTally {
  eligibleCount: number;
  votesNeeded: number;
  yes: number;
  no: number;
  voters: { playerId: string; choice: string }[];
  waitingOn: string[];
}

/**
 * Count votes of one kind for a commitment. Only currently-eligible voters
 * count, matching how suggestions behave when someone is locked or archived.
 */
export async function tallyVotes(
  commitmentId: string,
  subjectPlayerId: string,
  kind: 'verdict' | 'withdrawal'
): Promise<VoteTally> {
  const eligibleIds = await getEligibleVoterIds(subjectPlayerId);
  const eligible = new Set(eligibleIds);
  const rows = await queryAll(
    'SELECT voterId, choice FROM CommitmentVote WHERE commitmentId = ? AND kind = ?',
    [commitmentId, kind]
  );

  const voters: { playerId: string; choice: string }[] = [];
  let yes = 0;
  let no = 0;
  for (const r of rows as any[]) {
    const pid = String(r.voterId);
    if (!eligible.has(pid)) continue;
    const choice = String(r.choice);
    voters.push({ playerId: pid, choice });
    // 'kept'/'yes' are the affirmative choices for their respective votes
    if (choice === 'kept' || choice === 'yes') yes++;
    else no++;
  }

  const votedIds = new Set(voters.map((v) => v.playerId));
  const names = await queryAll(
    eligibleIds.length > 0
      ? `SELECT id, username FROM Player WHERE id IN (${eligibleIds.map(() => '?').join(',')})`
      : 'SELECT id, username FROM Player WHERE 0',
    eligibleIds
  );
  const waitingOn = (names as any[])
    .filter((p) => !votedIds.has(String(p.id)))
    .map((p) => String(p.username));

  return {
    eligibleCount: eligibleIds.length,
    // Verdict needs a strict majority; withdrawal needs everyone.
    votesNeeded: kind === 'withdrawal' ? eligibleIds.length : Math.floor(eligibleIds.length / 2) + 1,
    yes,
    no,
    voters,
    waitingOn,
  };
}

/* ============================ Resolution ============================ */

/** Apply a kept commitment's stat changes. Mirrors suggestionEngine.applyApproval. */
async function applyCommitmentStats(commitment: CommitmentRow, now: string): Promise<void> {
  const changes = await queryAll('SELECT statId, delta FROM CommitmentStat WHERE commitmentId = ?', [
    commitment.id,
  ]);

  for (const change of changes as any[]) {
    const statId = String(change.statId);
    const delta = Number(change.delta);

    let statValue = await queryOne('SELECT id, value FROM StatValue WHERE statId = ? AND playerId = ?', [
      statId,
      commitment.playerId,
    ]);
    if (!statValue) {
      const svId = uuid();
      await query(
        'INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt) VALUES (?, ?, ?, 5, ?, ?)',
        [svId, statId, commitment.playerId, now, now]
      );
      statValue = { id: svId, value: 5 } as any;
    }

    const oldValue = Number(statValue!.value);
    const newValue = Math.max(0, oldValue + delta);

    await query('UPDATE StatValue SET value = ?, updatedAt = ? WHERE id = ?', [
      newValue,
      now,
      String(statValue!.id),
    ]);
    await query(
      `INSERT INTO StatHistory (id, statValueId, oldValue, newValue, reason, changedById, source, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'commitment', ?)`,
      [
        uuid(),
        String(statValue!.id),
        oldValue,
        newValue,
        `Commitment kept: ${commitment.title}`,
        commitment.playerId,
        now,
      ]
    );

    try {
      await announceStatMilestones({
        playerId: commitment.playerId,
        statId,
        oldValue,
        newValue,
        delta,
      });
    } catch (e) {
      console.error('Milestone announcement failed (commitment still applied):', e);
    }
  }
}

/**
 * Resolve a commitment's verdict if the vote has reached a conclusion.
 * Approved ('kept') applies the stats; 'missed' is recorded only.
 */
export async function resolveVerdict(commitmentId: string): Promise<CommitmentStatus | null> {
  await ensureCommitmentTables();
  const c = (await queryOne('SELECT * FROM Commitment WHERE id = ?', [commitmentId])) as any;
  if (!c || String(c.status) !== 'awaiting_verdict') return c ? (String(c.status) as CommitmentStatus) : null;

  const commitment: CommitmentRow = {
    id: String(c.id),
    playerId: String(c.playerId),
    title: String(c.title),
    detail: c.detail ? String(c.detail) : null,
    cadence: String(c.cadence) as Cadence,
    deadline: String(c.deadline),
    status: String(c.status) as CommitmentStatus,
    withdrawReason: c.withdrawReason ? String(c.withdrawReason) : null,
    createdAt: String(c.createdAt),
    resolvedAt: c.resolvedAt ? String(c.resolvedAt) : null,
  };

  const tally = await tallyVotes(commitment.id, commitment.playerId, 'verdict');
  const now = new Date().toISOString();

  // Nobody eligible to judge (solo roster): trust the subject, treat as kept.
  if (tally.eligibleCount === 0) {
    await applyCommitmentStats(commitment, now);
    await query("UPDATE Commitment SET status = 'kept', resolvedAt = ?, updatedAt = ? WHERE id = ?", [
      now,
      now,
      commitment.id,
    ]);
    return 'kept';
  }

  if (tally.yes >= tally.votesNeeded) {
    await applyCommitmentStats(commitment, now);
    await query("UPDATE Commitment SET status = 'kept', resolvedAt = ?, updatedAt = ? WHERE id = ?", [
      now,
      now,
      commitment.id,
    ]);
    notifyResolution(commitment, 'kept');
    return 'kept';
  }

  if (tally.no >= tally.votesNeeded) {
    await query("UPDATE Commitment SET status = 'missed', resolvedAt = ?, updatedAt = ? WHERE id = ?", [
      now,
      now,
      commitment.id,
    ]);
    notifyResolution(commitment, 'missed');
    return 'missed';
  }

  return 'awaiting_verdict';
}

/**
 * Resolve a withdrawal request. Needs UNANIMOUS yes; a single no denies it
 * and the commitment goes straight back to active.
 */
export async function resolveWithdrawal(commitmentId: string): Promise<CommitmentStatus | null> {
  await ensureCommitmentTables();
  const c = (await queryOne('SELECT * FROM Commitment WHERE id = ?', [commitmentId])) as any;
  if (!c || String(c.status) !== 'withdraw_pending') return c ? (String(c.status) as CommitmentStatus) : null;

  const subjectId = String(c.playerId);
  const tally = await tallyVotes(commitmentId, subjectId, 'withdrawal');
  const now = new Date().toISOString();

  // Any objection at all ends it — unanimity is impossible from here.
  if (tally.no > 0) {
    await query('DELETE FROM CommitmentVote WHERE commitmentId = ? AND kind = ?', [commitmentId, 'withdrawal']);
    await query("UPDATE Commitment SET status = 'active', withdrawReason = NULL, updatedAt = ? WHERE id = ?", [
      now,
      commitmentId,
    ]);
    firePush([subjectId], {
      title: 'Withdrawal declined',
      body: `The crew didn't agree to withdraw "${String(c.title)}" — it's active again.`,
      url: `/commitments/${commitmentId}`,
      tag: `commitment-${commitmentId}`,
    });
    return 'active';
  }

  // Unanimous (or nobody left to object)
  if (tally.eligibleCount === 0 || tally.yes >= tally.eligibleCount) {
    await query("UPDATE Commitment SET status = 'withdrawn', resolvedAt = ?, updatedAt = ? WHERE id = ?", [
      now,
      now,
      commitmentId,
    ]);
    firePush([subjectId], {
      title: 'Withdrawal granted',
      body: `"${String(c.title)}" was withdrawn — it won't count against you.`,
      url: `/commitments/${commitmentId}`,
      tag: `commitment-${commitmentId}`,
    });
    return 'withdrawn';
  }

  return 'withdraw_pending';
}

function notifyResolution(commitment: CommitmentRow, outcome: 'kept' | 'missed') {
  firePush([commitment.playerId], {
    title: outcome === 'kept' ? '✅ Commitment kept' : '❌ Commitment missed',
    body:
      outcome === 'kept'
        ? `The crew agreed you delivered on "${commitment.title}".`
        : `The crew judged "${commitment.title}" as missed.`,
    url: `/commitments/${commitment.id}`,
    tag: `commitment-${commitment.id}`,
  });
}

/**
 * Flip any active commitment whose deadline has passed into awaiting_verdict
 * and ask the crew to judge it. Safe to call repeatedly — called lazily from
 * the listing and from the daily cron, so it works with or without cron.
 */
export async function sweepDeadlines(): Promise<number> {
  await ensureCommitmentTables();
  const now = new Date().toISOString();
  const due = await queryAll(
    "SELECT id, playerId, title FROM Commitment WHERE status = 'active' AND deadline <= ?",
    [now]
  );

  for (const c of due as any[]) {
    await query("UPDATE Commitment SET status = 'awaiting_verdict', updatedAt = ? WHERE id = ?", [
      now,
      String(c.id),
    ]);

    const voters = await getEligibleVoterIds(String(c.playerId));
    const subject = await queryOne('SELECT username FROM Player WHERE id = ?', [String(c.playerId)]);
    if (voters.length > 0) {
      firePush(voters, {
        title: 'A commitment needs judging',
        body: `${String(subject?.username || 'Someone')}'s deadline passed on "${String(c.title)}" — did they do it?`,
        url: `/commitments/${String(c.id)}`,
        tag: `commitment-verdict-${String(c.id)}`,
      });
    }
    firePush([String(c.playerId)], {
      title: 'Deadline reached',
      body: `"${String(c.title)}" is now with the crew to judge.`,
      url: `/commitments/${String(c.id)}`,
      tag: `commitment-${String(c.id)}`,
    });

    // A commitment with nobody to judge it resolves itself
    await resolveVerdict(String(c.id));
  }

  return due.length;
}

/** Nudge a weekly commitment if there's been no check-in for this long. */
const CHECKIN_SILENCE_DAYS = 7;
/** Chase a verdict that's been outstanding this long. */
const VERDICT_STALE_HOURS = 24;

/**
 * Daily upkeep: advance deadlines, nudge quiet weekly commitments, chase
 * outstanding verdicts. Lives here (not in the route) so the single daily
 * cron can chain it — Vercel's Hobby plan is stingy with cron entries, and
 * sweepDeadlines also runs lazily on page load, so this is a backstop.
 */
export async function runCommitmentUpkeep(): Promise<{ swept: number; nudged: number; chased: number }> {
  await ensureCommitmentTables();
  const swept = await sweepDeadlines();

  const silenceCutoff = new Date(Date.now() - CHECKIN_SILENCE_DAYS * 86400000).toISOString();
  const quiet = await queryAll(
    `SELECT c.id, c.playerId, c.title, c.createdAt,
            (SELECT MAX(createdAt) FROM CommitmentCheckIn ci WHERE ci.commitmentId = c.id) as lastCheckIn
     FROM Commitment c
     WHERE c.status = 'active' AND c.cadence = 'weekly'`
  );
  let nudged = 0;
  for (const c of quiet as any[]) {
    const last = String(c.lastCheckIn || c.createdAt);
    if (last > silenceCutoff) continue;
    firePush([String(c.playerId)], {
      title: 'Check in on your commitment',
      body: `No update on "${String(c.title)}" for a week. Still on it?`,
      url: `/commitments/${String(c.id)}`,
      tag: `commitment-checkin-${String(c.id)}`,
    });
    nudged++;
  }

  const verdictCutoff = new Date(Date.now() - VERDICT_STALE_HOURS * 3600000).toISOString();
  const awaiting = await queryAll(
    "SELECT id, playerId, title FROM Commitment WHERE status = 'awaiting_verdict' AND deadline < ?",
    [verdictCutoff]
  );
  let chased = 0;
  for (const c of awaiting as any[]) {
    const voted = await queryAll(
      "SELECT voterId FROM CommitmentVote WHERE commitmentId = ? AND kind = 'verdict'",
      [String(c.id)]
    );
    const votedIds = new Set((voted as any[]).map((v) => String(v.voterId)));
    const outstanding = (await getEligibleVoterIds(String(c.playerId))).filter((id) => !votedIds.has(id));
    if (outstanding.length === 0) continue;
    firePush(outstanding, {
      title: 'A commitment still needs your verdict',
      body: `"${String(c.title)}" — did they do it?`,
      url: `/commitments/${String(c.id)}`,
      tag: `commitment-verdict-${String(c.id)}`,
    });
    chased++;
  }

  return { swept, nudged, chased };
}

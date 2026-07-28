import { query, queryOne, queryAll } from './db';
import { announceStatMilestones } from './milestones';
import { getPlayersLockedFrom } from './featureLocks';
import { getStatTier } from './categories';
import { sendPushToPlayers } from './push';
import { v4 as uuid } from 'uuid';

/**
 * Suggestion resolution engine — the ONLY code path that changes a stat value.
 *
 * Rules:
 * - Eligible voters = all currently ACTIVE players except the subject.
 * - The proposer's creation counts as an implicit "yes" (a Vote row is written
 *   at creation time, so tallies stay simple).
 * - Approved once yes-votes form a strict majority of eligible voters.
 * - ASSUMPTION (flagged to Zeyan, easy to strip — see IMPOSSIBLE_CHECK):
 *   if a yes-majority becomes mathematically impossible, the suggestion is
 *   rejected immediately instead of sitting dead forever.
 * - On approval: delta applies to the running total, floored at 0, and a
 *   StatHistory row is written with source = "suggestion".
 */

const IMPOSSIBLE_CHECK = true;

/** Pending suggestions older than this auto-resolve with whatever votes exist. */
const STALE_AFTER_DAYS = 7;

/**
 * Resolve pending suggestions older than STALE_AFTER_DAYS by majority of the
 * votes actually cast (eligible voters only): yes > no approves, anything
 * else — tie or no eligible votes — rejects. Called lazily from the
 * suggestions GET so no cron is needed; a failure never breaks the listing.
 */
export async function expireStaleSuggestions(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86400000).toISOString();
  const stale = await queryAll(
    "SELECT id, playerId, proposedById, statId, delta, reason, status FROM Suggestion WHERE status = 'pending' AND createdAt < ?",
    [cutoff]
  );
  let resolved = 0;
  const approvedBySubject = new Map<string, ApprovedChange[]>();
  for (const suggestion of stale as any[]) {
    const eligibleIds = new Set(await getEligibleVoterIds(String(suggestion.playerId)));
    const votes = await queryAll('SELECT userId, choice FROM Vote WHERE suggestionId = ?', [String(suggestion.id)]);
    let yes = 0;
    let no = 0;
    for (const vote of votes as any[]) {
      if (!eligibleIds.has(String(vote.userId))) continue;
      if (String(vote.choice) === 'yes') yes++;
      else no++;
    }

    const now = new Date().toISOString();
    if (yes > no) {
      const applied = await applyApproval(suggestion, now);
      await query("UPDATE Suggestion SET status = 'approved', resolvedAt = ?, updatedAt = ? WHERE id = ?", [
        now,
        now,
        String(suggestion.id),
      ]);
      const list = approvedBySubject.get(applied.playerId) || [];
      list.push(applied);
      approvedBySubject.set(applied.playerId, list);
    } else {
      await query("UPDATE Suggestion SET status = 'rejected', resolvedAt = ?, updatedAt = ? WHERE id = ?", [
        now,
        now,
        String(suggestion.id),
      ]);
    }
    resolved++;
  }

  // One batched push per subject for everything that expired in their favour.
  for (const [pid, changes] of approvedBySubject) {
    await notifyApprovedChanges(pid, changes);
  }
  return resolved;
}

export interface ResolutionResult {
  status: 'pending' | 'approved' | 'rejected';
  yesVotes: number;
  noVotes: number;
  eligibleCount: number;
  votesNeeded: number;
  /** Present only when this call just approved the suggestion and moved a stat. */
  applied?: ApprovedChange;
}

/** What an approval actually did to a stat — used to batch the subject's push. */
export interface ApprovedChange {
  playerId: string;
  statId: string;
  statLabel: string;
  delta: number;
  oldValue: number;
  newValue: number;
  rankedUp: boolean;
  newTierName: string;
}

/**
 * Tell the subject their crew-approved changes landed. Deliberately ONE push
 * per resolution event rather than one per stat: a batch of approvals (e.g. a
 * multi-stat proposal that resolves at once) collapses to a single summary.
 * Tier-ups are the rare loud moment, so each still gets its own celebratory
 * push on top of the summary. Awaited so it actually sends before a serverless
 * function returns (fire-and-forget gets killed with the response).
 */
export async function notifyApprovedChanges(playerId: string, changes: ApprovedChange[]): Promise<void> {
  if (!playerId || changes.length === 0) return;
  try {
    if (changes.length === 1) {
      const c = changes[0];
      await sendPushToPlayers([playerId], {
        title: c.rankedUp ? `🏆 ${c.newTierName}!` : `${c.statLabel} ${c.delta > 0 ? '+' : ''}${c.delta}`,
        body: c.rankedUp
          ? `${c.statLabel} reached ${c.newTierName} — now ${c.newValue} pts.`
          : `${c.oldValue} → ${c.newValue} pts, approved by the crew.`,
        url: `/players/${playerId}`,
        tag: `stat-${c.statId}`,
      });
      return;
    }

    const summary = changes.map((c) => `${c.delta > 0 ? '+' : ''}${c.delta} ${c.statLabel}`).join(', ');
    await sendPushToPlayers([playerId], {
      title: `✅ ${changes.length} stat changes approved`,
      body: summary.length > 150 ? `${summary.slice(0, 149)}…` : summary,
      url: `/players/${playerId}`,
      tag: `approved-batch-${playerId}`,
    });

    // Call out each tier-up separately — a milestone shouldn't hide inside a list.
    for (const c of changes.filter((c) => c.rankedUp)) {
      await sendPushToPlayers([playerId], {
        title: `🏆 ${c.newTierName}!`,
        body: `${c.statLabel} reached ${c.newTierName} — now ${c.newValue} pts.`,
        url: `/players/${playerId}`,
        tag: `tier-${c.statId}`,
      });
    }
  } catch (e) {
    console.error('Approved-changes push failed (ignored):', e);
  }
}

export async function getEligibleVoterIds(subjectPlayerId: string): Promise<string[]> {
  // JOIN User: a player who has never claimed an account can't sign in to
  // vote, so counting them toward majorities stalls suggestions forever.
  // They join the pool the moment they claim a profile.
  const rows = await queryAll(
    `SELECT DISTINCT p.id FROM Player p
     JOIN User u ON u.playerId = p.id
     WHERE p.active = 1 AND p.id != ?`,
    [subjectPlayerId]
  );
  // A vote-locked player doesn't exist for vote math: majorities shrink and
  // their already-cast votes on pending suggestions stop counting while locked.
  const voteLocked = await getPlayersLockedFrom('vote');
  return rows.map((r: any) => String(r.id)).filter((id) => !voteLocked.has(id));
}

/**
 * Tally votes and, if the suggestion just crossed a threshold, resolve it.
 * Only votes from currently-eligible (active, non-subject) players count.
 */
export async function resolveSuggestion(suggestionId: string): Promise<ResolutionResult | null> {
  const suggestion = await queryOne(
    'SELECT id, playerId, proposedById, statId, delta, reason, status FROM Suggestion WHERE id = ?',
    [suggestionId]
  );
  if (!suggestion) return null;

  const eligibleIds = await getEligibleVoterIds(String(suggestion.playerId));
  const eligibleCount = eligibleIds.length;
  const majority = Math.floor(eligibleCount / 2) + 1; // strict majority

  const votes = await queryAll('SELECT userId, choice FROM Vote WHERE suggestionId = ?', [suggestionId]);
  const eligibleSet = new Set(eligibleIds);
  let yesVotes = 0;
  let noVotes = 0;
  for (const vote of votes as any[]) {
    if (!eligibleSet.has(String(vote.userId))) continue;
    if (String(vote.choice) === 'yes') yesVotes++;
    else noVotes++;
  }

  const result: ResolutionResult = {
    status: 'pending',
    yesVotes,
    noVotes,
    eligibleCount,
    votesNeeded: majority,
  };

  if (String(suggestion.status) !== 'pending') {
    result.status = String(suggestion.status) as any;
    return result;
  }

  const now = new Date().toISOString();

  if (yesVotes >= majority) {
    const applied = await applyApproval(suggestion, now);
    await query(
      "UPDATE Suggestion SET status = 'approved', resolvedAt = ?, updatedAt = ? WHERE id = ?",
      [now, now, suggestionId]
    );
    result.status = 'approved';
    result.applied = applied;
    return result;
  }

  if (IMPOSSIBLE_CHECK) {
    const maxPossibleYes = yesVotes + (eligibleCount - yesVotes - noVotes);
    if (maxPossibleYes < majority) {
      await query(
        "UPDATE Suggestion SET status = 'rejected', resolvedAt = ?, updatedAt = ? WHERE id = ?",
        [now, now, suggestionId]
      );
      result.status = 'rejected';
      return result;
    }
  }

  return result;
}

async function applyApproval(suggestion: any, now: string): Promise<ApprovedChange> {
  const statId = String(suggestion.statId);
  const playerId = String(suggestion.playerId);
  const delta = Number(suggestion.delta);

  // Ensure the StatValue row exists (lazy default is 5, matching the rest of the app)
  let statValue = await queryOne('SELECT id, value FROM StatValue WHERE statId = ? AND playerId = ?', [
    statId,
    playerId,
  ]);
  if (!statValue) {
    const svId = uuid();
    await query(
      'INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt) VALUES (?, ?, ?, 5, ?, ?)',
      [svId, statId, playerId, now, now]
    );
    statValue = { id: svId, value: 5 } as any;
  }

  const oldValue = Number(statValue.value);
  const newValue = Math.max(0, oldValue + delta); // unbounded above, floored at 0

  await query('UPDATE StatValue SET value = ?, updatedAt = ? WHERE id = ?', [
    newValue,
    now,
    String(statValue.id),
  ]);
  await query(
    `INSERT INTO StatHistory (id, statValueId, oldValue, newValue, reason, changedById, source, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 'suggestion', ?)`,
    [uuid(), String(statValue.id), oldValue, newValue, String(suggestion.reason), String(suggestion.proposedById), now]
  );

  // Celebrate tier-ups / category milestones on the board — never let a
  // failure here undo the approved stat change.
  try {
    await announceStatMilestones({ playerId, statId, oldValue, newValue, delta });
  } catch (e) {
    console.error('Milestone announcement failed (stat change still applied):', e);
  }

  // Describe what changed; the caller batches these into the subject's push
  // (see notifyApprovedChanges) so a multi-stat approval is one notification.
  const stat = await queryOne('SELECT label FROM Stat WHERE id = ?', [statId]);
  const statLabel = stat ? String(stat.label) : 'A stat';
  const oldTier = getStatTier(oldValue);
  const newTier = getStatTier(newValue);
  const rankedUp = newValue > oldValue && newTier.name !== oldTier.name;
  return { playerId, statId, statLabel, delta, oldValue, newValue, rankedUp, newTierName: newTier.name };
}

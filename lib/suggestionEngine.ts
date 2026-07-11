import { query, queryOne, queryAll } from './db';
import { announceStatMilestones } from './milestones';
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

export interface ResolutionResult {
  status: 'pending' | 'approved' | 'rejected';
  yesVotes: number;
  noVotes: number;
  eligibleCount: number;
  votesNeeded: number;
}

export async function getEligibleVoterIds(subjectPlayerId: string): Promise<string[]> {
  const rows = await queryAll('SELECT id FROM Player WHERE active = 1 AND id != ?', [subjectPlayerId]);
  return rows.map((r: any) => String(r.id));
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
    await applyApproval(suggestion, now);
    await query(
      "UPDATE Suggestion SET status = 'approved', resolvedAt = ?, updatedAt = ? WHERE id = ?",
      [now, now, suggestionId]
    );
    result.status = 'approved';
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

async function applyApproval(suggestion: any, now: string) {
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
}

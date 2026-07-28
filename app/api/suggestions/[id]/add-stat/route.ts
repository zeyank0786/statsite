import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { featureLockMessage, getPlayersLockedFrom } from '@/lib/featureLocks';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import { getEligibleVoterIds, resolveSuggestion, notifyApprovedChanges } from '@/lib/suggestionEngine';
import { sendPushToPlayers } from '@/lib/push';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const ALLOWED_DELTAS = [-2, -1, 1, 2];

/**
 * Add a stat the original proposer missed to an existing suggestion.
 *
 * A suggestion is really a batch of per-stat rows (auto-split), so "adding a
 * stat" = adding another row to the same batch: same subject, same evidence
 * and testimony, same written reason. The person who adds it becomes that
 * row's proposer, their add counts as their implicit yes, and the crew votes
 * on it independently like every other stat in the batch.
 *
 * Only an eligible voter can add — never the affected player, and never
 * someone locked out of suggesting.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adderId = (session.user as any)?.playerId;
    if (!adderId) return NextResponse.json({ error: 'No player linked to this account' }, { status: 400 });

    const lockMsg = await featureLockMessage(String(adderId), 'suggest');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { statId, delta } = await request.json();
    if (!statId || !ALLOWED_DELTAS.includes(Number(delta))) {
      return NextResponse.json({ error: 'A statId and a delta of -2/-1/+1/+2 are required' }, { status: 400 });
    }

    // The referenced row anchors the batch and carries the shared grounding
    const anchor = await queryOne(
      'SELECT id, playerId, proposedById, reason, testimony, batchId FROM Suggestion WHERE id = ?',
      [id]
    );
    if (!anchor) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });

    const subjectId = String(anchor.playerId);
    if (subjectId === String(adderId)) {
      return NextResponse.json({ error: "You can't add stats to a suggestion about yourself" }, { status: 403 });
    }

    const eligible = await getEligibleVoterIds(subjectId);
    if (!eligible.includes(String(adderId))) {
      return NextResponse.json({ error: "You're not eligible to weigh in on this suggestion" }, { status: 403 });
    }

    // Old single suggestions have no batchId — adopt the anchor's id as the
    // batch key so the addition groups with it going forward.
    const batchId = anchor.batchId ? String(anchor.batchId) : String(anchor.id);
    if (!anchor.batchId) {
      await query('UPDATE Suggestion SET batchId = ? WHERE id = ?', [batchId, String(anchor.id)]).catch(() => {});
    }

    // Batch members — the addition only makes sense while something's still live
    const members = await queryAll(
      'SELECT id, statId, status FROM Suggestion WHERE batchId = ? OR id = ?',
      [batchId, String(anchor.id)]
    );
    const anyPending = (members as any[]).some((m) => String(m.status) === 'pending');
    if (!anyPending) {
      return NextResponse.json({ error: 'This suggestion is already resolved' }, { status: 400 });
    }
    if ((members as any[]).some((m) => String(m.statId) === String(statId))) {
      return NextResponse.json({ error: 'That stat is already part of this suggestion' }, { status: 400 });
    }

    // Same gating as creating a suggestion: visible + unlocked for the subject
    const stat = await queryOne('SELECT id, label FROM Stat WHERE id = ?', [statId]);
    if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

    const hidden = await queryOne(
      'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
      [statId, subjectId]
    );
    if (hidden) {
      return NextResponse.json({ error: `"${String(stat.label)}" isn't tracked for this player` }, { status: 400 });
    }
    const lock = await isStatLockedForPlayer(String(statId), subjectId);
    if (lock.locked) {
      return NextResponse.json(
        { error: `"${String(stat.label)}" is locked for this player. ${describeLock(lock)}` },
        { status: 400 }
      );
    }

    // Create the new row, inheriting the batch's reason / testimony / evidence
    const newId = uuid();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO Suggestion (id, playerId, proposedById, statId, delta, reason, testimony, batchId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        newId,
        subjectId,
        String(adderId),
        String(statId),
        Number(delta),
        String(anchor.reason),
        anchor.testimony ? String(anchor.testimony) : null,
        batchId,
        now,
        now,
      ]
    );

    const evidence = await queryAll('SELECT evidenceId FROM SuggestionEvidence WHERE suggestionId = ?', [
      String(anchor.id),
    ]);
    for (const e of evidence as any[]) {
      await query('INSERT INTO SuggestionEvidence (suggestionId, evidenceId) VALUES (?, ?)', [
        newId,
        String(e.evidenceId),
      ]);
    }

    // Adding it is the adder's yes vote (mirrors how proposing works)
    await query('INSERT INTO Vote (id, suggestionId, userId, choice, createdAt) VALUES (?, ?, ?, ?, ?)', [
      uuid(),
      newId,
      String(adderId),
      'yes',
      now,
    ]);

    const resolution = await resolveSuggestion(newId);

    // Ping the subject + the other eligible voters that there's a new change to weigh
    const [adder, subject] = await Promise.all([
      queryOne('SELECT username FROM Player WHERE id = ?', [adderId]),
      queryOne('SELECT username FROM Player WHERE id = ?', [subjectId]),
    ]);
    const voteLocked = await getPlayersLockedFrom('vote');
    const notify = [subjectId, ...eligible].filter(
      (pid) => pid !== String(adderId) && !voteLocked.has(pid)
    );
    await sendPushToPlayers([...new Set(notify)], {
      title: 'Stat added to a suggestion',
      body: `${String(adder?.username || 'Someone')} added ${Number(delta) > 0 ? '+' : ''}${Number(
        delta
      )} ${String(stat.label)} to the suggestion about ${String(subject?.username || 'a player')}.`,
      url: '/suggestions',
      tag: `suggestion-batch-${batchId}`,
    });

    // If adding it immediately cleared the threshold, tell the subject.
    if (resolution?.applied) {
      await notifyApprovedChanges(resolution.applied.playerId, [resolution.applied]);
    }

    return NextResponse.json({ success: true, id: newId, resolution });
  } catch (error: any) {
    console.error('Error adding stat to suggestion:', error);
    return NextResponse.json({ error: 'Failed to add stat', details: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import { featureLockMessage } from '@/lib/featureLocks';
import { resolveSuggestion } from '@/lib/suggestionEngine';
import { recordMentions } from '@/lib/mentionsServer';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const ALLOWED_DELTAS = [-2, -1, 1, 2];
const MIN_TESTIMONY_LENGTH = 1;

/**
 * PATCH: edit a suggestion the current player proposed — change the reason,
 * testimony, evidence, the set of stats, and each stat's delta.
 *
 * A suggestion is really a batch of per-stat rows (auto-split at creation),
 * sharing one reason / testimony / evidence set. Editing therefore edits the
 * WHOLE batch: [id] is any row in it (usually the anchor). We reconcile the
 * batch's rows against the submitted stats — updating kept ones, inserting
 * added ones (each with the proposer's implicit yes), deleting removed ones.
 *
 * Allowed ONLY while the proposal is untouched: the proposer owns every row,
 * every row is still pending, and NO eligible voter other than the proposer
 * has cast a vote. The instant someone else weighs in, editing locks so a
 * proposal can't be changed out from under the votes already cast.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const proposerId = (session.user as any)?.playerId;
    if (!proposerId) return NextResponse.json({ error: 'No player linked to this account' }, { status: 400 });

    const lockMsg = await featureLockMessage(String(proposerId), 'suggest');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { changes, reason, evidenceIds, testimony } = await request.json();

    // The referenced row anchors the batch and its shared grounding.
    const anchor = await queryOne(
      'SELECT id, playerId, proposedById, batchId FROM Suggestion WHERE id = ?',
      [id]
    );
    if (!anchor) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });

    const subjectId = String(anchor.playerId);
    const batchId = anchor.batchId ? String(anchor.batchId) : String(anchor.id);

    // Every row that belongs to this batch (legacy single rows have no batchId).
    const members = await queryAll(
      'SELECT id, statId, proposedById, status FROM Suggestion WHERE batchId = ? OR id = ?',
      [batchId, String(anchor.id)]
    );

    // GATE 1: you can only edit a proposal you made in full.
    if ((members as any[]).some((m) => String(m.proposedById) !== String(proposerId))) {
      return NextResponse.json(
        { error: "You can only edit a suggestion you proposed yourself" },
        { status: 403 }
      );
    }
    // GATE 2: nothing in the batch may have resolved yet.
    if ((members as any[]).some((m) => String(m.status) !== 'pending')) {
      return NextResponse.json({ error: 'This suggestion has already resolved — it can no longer be edited' }, { status: 400 });
    }
    // GATE 3: the moment anyone else votes, editing locks.
    const memberIds = (members as any[]).map((m) => String(m.id));
    const placeholders = memberIds.map(() => '?').join(',');
    const otherVote = await queryOne(
      `SELECT 1 FROM Vote WHERE suggestionId IN (${placeholders}) AND userId != ? LIMIT 1`,
      [...memberIds, String(proposerId)]
    );
    if (otherVote) {
      return NextResponse.json(
        { error: "Someone has already voted on this — you can't edit it now. Withdraw and re-propose instead." },
        { status: 409 }
      );
    }

    // ---- Validate the submitted payload (mirrors POST /api/suggestions) ----
    if (!reason?.trim()) {
      return NextResponse.json({ error: 'A reason is required' }, { status: 400 });
    }
    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json({ error: 'Keep at least one stat to change' }, { status: 400 });
    }
    const statIds = changes.map((c: any) => String(c?.statId || ''));
    if (statIds.some((s: string) => !s) || new Set(statIds).size !== statIds.length) {
      return NextResponse.json({ error: 'Each change needs a distinct statId' }, { status: 400 });
    }
    for (const change of changes) {
      if (!ALLOWED_DELTAS.includes(Number(change.delta))) {
        return NextResponse.json({ error: 'Each delta must be -2, -1, +1 or +2' }, { status: 400 });
      }
    }
    const hasEvidence = Array.isArray(evidenceIds) && evidenceIds.length > 0;
    const cleanTestimony = typeof testimony === 'string' ? testimony.trim() : '';
    if (!hasEvidence && cleanTestimony.length < MIN_TESTIMONY_LENGTH) {
      return NextResponse.json(
        { error: 'Ground the suggestion: attach an evidence post, or write what you witnessed first-hand' },
        { status: 400 }
      );
    }

    const subject = await queryOne('SELECT active FROM Player WHERE id = ?', [subjectId]);
    if (!subject || !Number(subject.active)) {
      return NextResponse.json({ error: 'Subject player is not active' }, { status: 400 });
    }

    // Each named stat must exist, be visible for the subject, and be unlocked.
    for (const change of changes) {
      const stat = await queryOne('SELECT id, label FROM Stat WHERE id = ?', [change.statId]);
      if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

      const hiddenRow = await queryOne(
        'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
        [change.statId, subjectId]
      );
      if (hiddenRow) {
        return NextResponse.json({ error: `"${stat.label}" is not tracked for this player` }, { status: 400 });
      }
      const lock = await isStatLockedForPlayer(String(change.statId), subjectId);
      if (lock.locked) {
        return NextResponse.json(
          { error: `"${stat.label}" is locked for this player. ${describeLock(lock)}` },
          { status: 400 }
        );
      }
    }

    // Evidence (when attached): must exist and be posted by the subject.
    const uniqueEvidenceIds = hasEvidence ? [...new Set(evidenceIds as string[])] : [];
    if (hasEvidence) {
      const ph = uniqueEvidenceIds.map(() => '?').join(',');
      const evidence = await queryAll(
        `SELECT e.id, e.playerId FROM Evidence e WHERE e.id IN (${ph})`,
        uniqueEvidenceIds
      );
      if (evidence.length !== uniqueEvidenceIds.length) {
        return NextResponse.json({ error: 'One or more evidence posts were not found' }, { status: 400 });
      }
      for (const post of evidence as any[]) {
        if (String(post.playerId) !== subjectId) {
          return NextResponse.json({ error: 'Evidence must be posted by the subject themselves' }, { status: 400 });
        }
      }
    }

    // ---- Reconcile the batch against the submitted stats ----
    const now = new Date().toISOString();
    const cleanReason = reason.trim();
    const testimonyValue = cleanTestimony || null;

    // Legacy single suggestion (no batchId): adopt its id as the batch key so
    // any stats added during this edit group with it going forward.
    if (!anchor.batchId) {
      await query('UPDATE Suggestion SET batchId = ? WHERE id = ?', [batchId, String(anchor.id)]).catch(() => {});
    }

    const rowByStatId = new Map<string, string>();
    for (const m of members as any[]) rowByStatId.set(String(m.statId), String(m.id));
    const keepStatIds = new Set(statIds);

    // Remove rows for stats that were dropped (cascades their votes + evidence).
    for (const m of members as any[]) {
      if (!keepStatIds.has(String(m.statId))) {
        await query('DELETE FROM Suggestion WHERE id = ?', [String(m.id)]);
      }
    }

    const survivingRowIds: string[] = [];
    const newRowIds: string[] = [];
    for (const change of changes) {
      const statId = String(change.statId);
      const delta = Number(change.delta);
      const existingRowId = rowByStatId.get(statId);
      if (existingRowId) {
        await query(
          'UPDATE Suggestion SET delta = ?, reason = ?, testimony = ?, updatedAt = ? WHERE id = ?',
          [delta, cleanReason, testimonyValue, now, existingRowId]
        );
        survivingRowIds.push(existingRowId);
      } else {
        const newId = uuid();
        await query(
          `INSERT INTO Suggestion (id, playerId, proposedById, statId, delta, reason, testimony, batchId, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [newId, subjectId, String(proposerId), statId, delta, cleanReason, testimonyValue, batchId, now, now]
        );
        // Proposing a stat counts as the proposer's implicit yes.
        await query('INSERT INTO Vote (id, suggestionId, userId, choice, createdAt) VALUES (?, ?, ?, ?, ?)', [
          uuid(),
          newId,
          String(proposerId),
          'yes',
          now,
        ]);
        survivingRowIds.push(newId);
        newRowIds.push(newId);
      }
    }

    // Re-sync the shared evidence set across every row in the batch.
    for (const rowId of survivingRowIds) {
      await query('DELETE FROM SuggestionEvidence WHERE suggestionId = ?', [rowId]);
      for (const evidenceId of uniqueEvidenceIds) {
        await query('INSERT INTO SuggestionEvidence (suggestionId, evidenceId) VALUES (?, ?)', [rowId, evidenceId]);
      }
    }

    // A newly added stat could clear the bar on its own in a tiny roster.
    for (const rowId of newRowIds) {
      await resolveSuggestion(rowId).catch(() => null);
    }

    // Refresh @mentions for the (possibly rewritten) reason.
    const proposerRow = await queryOne('SELECT username FROM Player WHERE id = ?', [proposerId]);
    recordMentions({
      content: cleanReason,
      byId: String(proposerId),
      byName: String(proposerRow?.username || 'Someone'),
      context: 'suggestion',
      url: '/suggestions',
    });

    return NextResponse.json({ success: true, batchId, count: survivingRowIds.length });
  } catch (error: any) {
    console.error('Error editing suggestion:', error);
    return NextResponse.json({ error: 'Failed to edit suggestion', details: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { featureLockMessage, getPlayersLockedFrom } from '@/lib/featureLocks';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import { getEligibleVoterIds, resolveSuggestion, notifyApprovedChanges } from '@/lib/suggestionEngine';
import { sendPushToPlayers } from '@/lib/push';
import { mergeAccount } from '@/lib/suggestionText';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

const ALLOWED_DELTAS = [-2, -1, 1, 2];

/** One stat being added, after validation. */
interface Addition {
  statId: string;
  delta: number;
  label: string;
}

/**
 * Add stats the original proposer missed to an existing suggestion.
 *
 * A suggestion is really a batch of per-stat rows (auto-split), so "adding a
 * stat" = adding another row to the same batch: same subject, same evidence,
 * same written account. The person who adds it becomes that row's proposer,
 * their add counts as their implicit yes, and the crew votes on it
 * independently like every other stat in the batch.
 *
 * Accepts several at once, each with its own delta — one moment routinely
 * demonstrates more than one thing. Validation is all-or-nothing: if any stat
 * in the request is locked, hidden or already present, nothing is written, so
 * a partial add can't leave a half-built batch behind.
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

    const body = await request.json();
    // `{ stats: [{statId, delta}] }` is the current shape; `{ statId, delta }`
    // is what a client cached from before this accepted more than one.
    const requested: { statId: unknown; delta: unknown }[] = Array.isArray(body?.stats)
      ? body.stats
      : [{ statId: body?.statId, delta: body?.delta }];

    if (requested.length === 0) {
      return NextResponse.json({ error: 'Pick at least one stat' }, { status: 400 });
    }
    for (const r of requested) {
      if (!r?.statId || !ALLOWED_DELTAS.includes(Number(r.delta))) {
        return NextResponse.json(
          { error: 'Every stat needs an id and a delta of -2/-1/+1/+2' },
          { status: 400 }
        );
      }
    }
    const uniqueIds = new Set(requested.map((r) => String(r.statId)));
    if (uniqueIds.size !== requested.length) {
      return NextResponse.json({ error: 'The same stat was listed twice' }, { status: 400 });
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
    const alreadyPresent = new Set((members as any[]).map((m) => String(m.statId)));

    // Validate EVERY stat before writing any of them.
    const additions: Addition[] = [];
    for (const r of requested) {
      const statId = String(r.statId);
      const delta = Number(r.delta);

      if (alreadyPresent.has(statId)) {
        return NextResponse.json(
          { error: 'One of those stats is already part of this suggestion' },
          { status: 400 }
        );
      }

      // Same gating as creating a suggestion: visible + unlocked for the subject
      const stat = await queryOne('SELECT id, label FROM Stat WHERE id = ?', [statId]);
      if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });
      const label = String(stat.label);

      const hidden = await queryOne(
        'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
        [statId, subjectId]
      );
      if (hidden) {
        return NextResponse.json({ error: `"${label}" isn't tracked for this player` }, { status: 400 });
      }
      const lock = await isStatLockedForPlayer(statId, subjectId);
      if (lock.locked) {
        return NextResponse.json(
          { error: `"${label}" is locked for this player. ${describeLock(lock)}` },
          { status: 400 }
        );
      }

      additions.push({ statId, delta, label });
    }

    // Shared grounding for every new row. An anchor written back when there
    // were two boxes is merged into the single field the new rows store, so
    // each addition carries the whole story.
    const sharedReason = mergeAccount(
      anchor.reason ? String(anchor.reason) : '',
      anchor.testimony ? String(anchor.testimony) : null
    );
    const evidence = await queryAll('SELECT evidenceId FROM SuggestionEvidence WHERE suggestionId = ?', [
      String(anchor.id),
    ]);

    const now = new Date().toISOString();
    const createdIds: string[] = [];
    const resolutions: unknown[] = [];
    const applied: Parameters<typeof notifyApprovedChanges>[1] = [];

    for (const addition of additions) {
      const newId = uuid();
      createdIds.push(newId);
      await query(
        `INSERT INTO Suggestion (id, playerId, proposedById, statId, delta, reason, testimony, batchId, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [newId, subjectId, String(adderId), addition.statId, addition.delta, sharedReason, null, batchId, now, now]
      );

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
      resolutions.push(resolution);
      if (resolution?.applied) applied.push(resolution.applied);
    }

    // Ping the subject + the other eligible voters that there's a new change to
    // weigh. One push for the whole add, however many stats it carried.
    const [adder, subject] = await Promise.all([
      queryOne('SELECT username FROM Player WHERE id = ?', [adderId]),
      queryOne('SELECT username FROM Player WHERE id = ?', [subjectId]),
    ]);
    const voteLocked = await getPlayersLockedFrom('vote');
    const notify = [subjectId, ...eligible].filter(
      (pid) => pid !== String(adderId) && !voteLocked.has(pid)
    );
    const summary =
      additions.length === 1
        ? `${additions[0].delta > 0 ? '+' : ''}${additions[0].delta} ${additions[0].label}`
        : `${additions.length} stats`;
    await sendPushToPlayers([...new Set(notify)], {
      title: additions.length === 1 ? 'Stat added to a suggestion' : 'Stats added to a suggestion',
      body: `${String(adder?.username || 'Someone')} added ${summary} to the suggestion about ${String(
        subject?.username || 'a player'
      )}.`,
      url: '/suggestions',
      tag: `suggestion-batch-${batchId}`,
    });

    // If adding them immediately cleared the threshold, tell the subject — one
    // notification covering everything that landed, not one per stat.
    if (applied.length > 0) {
      await notifyApprovedChanges(applied[0].playerId, applied);
    }

    return NextResponse.json({
      success: true,
      ids: createdIds,
      id: createdIds[0], // legacy single-add callers
      resolutions,
    });
  } catch (error: any) {
    console.error('Error adding stat to suggestion:', error);
    return NextResponse.json(errorPayload('Failed to add stat', error), { status: 500 });
  }
}

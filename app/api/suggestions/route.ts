import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import {
  resolveSuggestion,
  expireStaleSuggestions,
  getEligibleVoterIds,
  notifyApprovedChanges,
  type ApprovedChange,
} from '@/lib/suggestionEngine';
import { featureLockMessage, getPlayersLockedFrom } from '@/lib/featureLocks';
import { sendPushToPlayers } from '@/lib/push';
import { recordMentions } from '@/lib/mentionsServer';
import { mergeAccount } from '@/lib/suggestionText';
import { backfillPointerHistory } from '@/lib/suggestionBackfill';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

const ALLOWED_DELTAS = [-2, -1, 1, 2];

async function getSessionPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  return playerId ? String(playerId) : null;
}

/** Resolved suggestions returned on the first page; older ones on request. */
const INITIAL_RESOLVED = 20;
const MORE_RESOLVED = 50;

/**
 * GET: the pending queue in full, plus a page of resolved history.
 *
 * The queue is what the page is for and is never large, so it is never capped.
 * Resolved history is, because it only grows — and this endpoint is polled.
 */
export async function GET(request: Request) {
  const currentPlayerId = await getSessionPlayerId();
  if (!currentPlayerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Pending suggestions are always returned in full — they're the queue, and
  // there are never many. Only resolved history pages.
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get('resolved'));
  const resolvedLimit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, 500)
      : INITIAL_RESOLVED;

  try {
    // Housekeeping that used to run here — expiring week-old suggestions and a
    // one-shot history backfill — now runs from the daily cron. Both could only
    // change once a day, and this endpoint is polled every few seconds.

    // Recap watermark: a suggestion that resolved WITHOUT your vote after this
    // moment counts as "missed". Defaults to when you joined, so a new player
    // never inherits a backlog of votes from before they existed. Column is
    // additive (created on first mark-as-seen) — tolerate its absence.
    let recapWatermarkMs = 0;
    try {
      const meRow = await queryOne('SELECT recapSeenAt, createdAt FROM Player WHERE id = ?', [currentPlayerId]);
      const stamp = String((meRow?.recapSeenAt as string) || meRow?.createdAt || '');
      recapWatermarkMs = stamp ? Date.parse(stamp) : 0;
    } catch (e: any) {
      if (!/no column named|no such column/i.test(String(e?.message))) throw e;
      const meRow = await queryOne('SELECT createdAt FROM Player WHERE id = ?', [currentPlayerId]);
      recapWatermarkMs = meRow?.createdAt ? Date.parse(String(meRow.createdAt)) : 0;
    }
    if (Number.isNaN(recapWatermarkMs)) recapWatermarkMs = 0;

    // Pending and resolved are fetched separately so the resolved half can be
    // capped. A single ORDER BY over both meant every poll read, joined and
    // sorted the entire Suggestion table to render a screen showing ~20 rows.
    const COLUMNS = `sg.*,
              subject.username as subjectName, subject.active as subjectActive,
              proposer.username as proposerName,
              s.code as statCode, s.label as statLabel,
              c.code as categoryCode, c.label as categoryLabel,
              COALESCE(sv.value, 5) as currentValue`;
    const JOINS = `FROM Suggestion sg
       JOIN Player subject ON sg.playerId = subject.id
       JOIN Player proposer ON sg.proposedById = proposer.id
       JOIN Stat s ON sg.statId = s.id
       JOIN Category c ON s.categoryId = c.id
       LEFT JOIN StatValue sv ON sv.statId = sg.statId AND sv.playerId = sg.playerId`;

    // One row past the limit answers "is there more?" for free. Asking
    // COUNT(*) instead meant scanning the whole table on every poll to render
    // a button label.
    const [pending, resolvedPlusOne] = await Promise.all([
      queryAll(
        `SELECT ${COLUMNS} ${JOINS}
         WHERE sg.status = 'pending'
         ORDER BY sg.createdAt DESC`
      ),
      queryAll(
        `SELECT ${COLUMNS} ${JOINS}
         WHERE sg.status != 'pending'
         ORDER BY COALESCE(sg.resolvedAt, sg.createdAt) DESC
         LIMIT ?`,
        [resolvedLimit + 1]
      ),
    ]);
    const hasMoreResolved = resolvedPlusOne.length > resolvedLimit;
    const resolved = hasMoreResolved ? resolvedPlusOne.slice(0, resolvedLimit) : resolvedPlusOne;
    const suggestions = [...pending, ...resolved];

    // What an approved suggestion ACTUALLY moved the stat from/to.
    // `currentValue` above is the live value, which for a resolved suggestion
    // already includes this change — rendering "current + delta" would double
    // count it. applyApproval() stamps the StatHistory row with the same
    // timestamp it sets resolvedAt to, so statId+playerId+timestamp identifies
    // the exact row (works retroactively; no migration needed).
    // Everything below is scoped to the suggestions actually being returned.
    // These three used to read the whole StatHistory, Vote and
    // SuggestionEvidence tables on every poll, then throw most of it away.
    const ids = (suggestions as unknown as { id: string }[]).map((s) => String(s.id));
    const idHoles = ids.map(() => '?').join(',');
    const noRows = ids.length === 0;

    // The earliest suggestion on this page bounds how far back the applied
    // history can possibly be, which keeps the scan off the whole table.
    const oldestAt = (suggestions as unknown as { resolvedAt?: string; createdAt: string }[]).reduce(
      (min, s) => {
        const at = String(s.resolvedAt || s.createdAt);
        return !min || at < min ? at : min;
      },
      ''
    );

    const appliedRows = noRows
      ? []
      : await queryAll(
          `SELECT sv.statId as statId, sv.playerId as playerId,
                  sh.oldValue, sh.newValue, sh.createdAt
           FROM StatHistory sh
           JOIN StatValue sv ON sh.statValueId = sv.id
           WHERE sh.source = 'suggestion' AND sh.createdAt >= ?`,
          [oldestAt]
        );
    const appliedByKey = new Map<string, { oldValue: number; newValue: number }>();
    for (const r of appliedRows as any[]) {
      appliedByKey.set(`${String(r.statId)}:${String(r.playerId)}:${String(r.createdAt)}`, {
        oldValue: Number(r.oldValue),
        newValue: Number(r.newValue),
      });
    }

    const votes = noRows
      ? []
      : await queryAll(
          `SELECT v.suggestionId, v.userId, v.choice, p.username
           FROM Vote v JOIN Player p ON v.userId = p.id
           WHERE v.suggestionId IN (${idHoles})`,
          ids
        );
    const votesBySuggestion = new Map<string, any[]>();
    for (const vote of votes as any[]) {
      const key = String(vote.suggestionId);
      if (!votesBySuggestion.has(key)) votesBySuggestion.set(key, []);
      votesBySuggestion.get(key)!.push(vote);
    }

    const evidenceLinks = noRows
      ? []
      : await queryAll(
          `SELECT se.suggestionId, e.id, e.mediaUrl, e.mediaType, e.caption, e.captionHidden, e.playerId,
                  p.username as posterName
           FROM SuggestionEvidence se
           JOIN Evidence e ON se.evidenceId = e.id
           JOIN Player p ON e.playerId = p.id
           WHERE se.suggestionId IN (${idHoles})`,
          ids
        );
    const evidenceBySuggestion = new Map<string, any[]>();
    for (const link of evidenceLinks as any[]) {
      const key = String(link.suggestionId);
      if (!evidenceBySuggestion.has(key)) evidenceBySuggestion.set(key, []);
      evidenceBySuggestion.get(key)!.push({
        id: String(link.id),
        mediaUrl: link.mediaUrl || null,
        mediaType: link.mediaType || null,
        caption: Number(link.captionHidden) ? null : link.caption || null,
        posterName: String(link.posterName),
      });
    }

    // Eligible pool = active AND claimed (has a login) AND not vote-locked.
    // Unclaimed players can't sign in to vote — counting them stalls
    // suggestions forever. Must match lib/suggestionEngine.getEligibleVoterIds.
    const activePlayers = await queryAll(
      `SELECT DISTINCT p.id, p.username FROM Player p
       JOIN User u ON u.playerId = p.id
       WHERE p.active = 1`
    );
    const voteLocked = await getPlayersLockedFrom('vote');
    const activeIds = new Set(
      (activePlayers as any[]).map((p) => String(p.id)).filter((id) => !voteLocked.has(id))
    );
    const eligibleNameById = new Map(
      (activePlayers as any[])
        .filter((p) => activeIds.has(String(p.id)))
        .map((p) => [String(p.id), String(p.username)])
    );

    const payload = (suggestions as any[]).map((sg) => {
      const id = String(sg.id);
      const subjectId = String(sg.playerId);
      const suggestionVotes = votesBySuggestion.get(id) || [];
      const eligibleCount = [...activeIds].filter((pid) => pid !== subjectId).length;
      const eligibleVotes = suggestionVotes.filter(
        (v) => activeIds.has(String(v.userId)) && String(v.userId) !== subjectId
      );
      const yesVotes = eligibleVotes.filter((v) => String(v.choice) === 'yes').length;
      const noVotes = eligibleVotes.filter((v) => String(v.choice) === 'no').length;
      const myVote = suggestionVotes.find((v) => String(v.userId) === currentPlayerId);
      const applied =
        String(sg.status) === 'approved' && sg.resolvedAt
          ? appliedByKey.get(`${String(sg.statId)}:${subjectId}:${String(sg.resolvedAt)}`) || null
          : null;
      // Who could still vote but hasn't — makes stalls self-explanatory
      const votedIds = new Set(eligibleVotes.map((v) => String(v.userId)));
      const waitingOn =
        String(sg.status) === 'pending'
          ? [...eligibleNameById.entries()]
              .filter(([pid]) => pid !== subjectId && !votedIds.has(pid))
              .map(([, name]) => name)
          : [];

      return {
        id,
        batchId: sg.batchId ? String(sg.batchId) : null,
        waitingOn,
        subjectId,
        subjectName: String(sg.subjectName),
        proposerId: String(sg.proposedById),
        proposerName: String(sg.proposerName),
        statId: String(sg.statId),
        statCode: String(sg.statCode),
        statLabel: String(sg.statLabel),
        categoryCode: String(sg.categoryCode),
        categoryLabel: String(sg.categoryLabel),
        currentValue: Number(sg.currentValue),
        // Non-null only for approved suggestions: the real before/after at the
        // moment it was applied, so resolved cards don't re-add the delta.
        appliedOldValue: applied ? applied.oldValue : null,
        appliedNewValue: applied ? applied.newValue : null,
        delta: Number(sg.delta),
        // One account per suggestion. Rows written while there were two boxes
        // are folded together here, so every surface reads a single field and
        // nothing that was typed goes unseen.
        reason: mergeAccount(String(sg.reason), sg.testimony ? String(sg.testimony) : null),
        status: String(sg.status),
        createdAt: sg.createdAt,
        resolvedAt: sg.resolvedAt || null,
        evidence: evidenceBySuggestion.get(id) || [],
        yesVotes,
        noVotes,
        eligibleCount,
        votesNeeded: Math.floor(eligibleCount / 2) + 1,
        voters: eligibleVotes.map((v) => ({
          playerId: String(v.userId),
          name: String(v.username),
          choice: String(v.choice),
        })),
        yourVote: myVote ? String(myVote.choice) : null,
        canVote:
          String(sg.status) === 'pending' &&
          activeIds.has(currentPlayerId) &&
          currentPlayerId !== subjectId,
        isSubject: currentPlayerId === subjectId,
        isProposer: currentPlayerId === String(sg.proposedById),
        // A vote you never got to cast: resolved, not about you, you didn't
        // vote, and it resolved after your last catch-up. Powers the Missed tab.
        youMissed:
          String(sg.status) !== 'pending' &&
          currentPlayerId !== subjectId &&
          !myVote &&
          Boolean(sg.resolvedAt) &&
          Date.parse(String(sg.resolvedAt)) > recapWatermarkMs,
      };
    });

    // Still an array at the top level so existing callers keep working; the
    // paging flags ride alongside as non-enumerable-ish extras on the body.
    return NextResponse.json({
      suggestions: payload,
      hasMoreResolved,
      resolvedShown: resolved.length,
      nextResolved: hasMoreResolved ? resolved.length + MORE_RESOLVED : null,
    });
  } catch (error: any) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json(errorPayload('Failed to fetch suggestions', error), { status: 500 });
  }
}

/**
 * POST: create a suggestion. Enforces the full trust model:
 * proposer ≠ subject, both active, delta ∈ {-2,-1,1,2}, a written account
 * required, and the stat must be visible and unlocked for the subject.
 *
 * The account is ONE field. It used to be two — a `reason` plus a separate
 * witness `testimony` — and because only `reason` reached StatHistory, people
 * writing the real story in the other box lost it from the permanent record.
 * Evidence posts (which must belong to the subject) are optional supporting
 * material attached alongside.
 */
const MIN_ACCOUNT_LENGTH = 1;

export async function POST(request: Request) {
  const proposerId = await getSessionPlayerId();
  if (!proposerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lockMsg = await featureLockMessage(proposerId, 'suggest');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { subjectPlayerId, changes, reason, evidenceIds, testimony } = await request.json();

    // `testimony` is only still read so a stale browser tab holding the old
    // two-box form doesn't silently drop what someone typed — it's folded into
    // the single account rather than stored separately.
    const account = mergeAccount(reason, testimony);

    if (!subjectPlayerId || account.length < MIN_ACCOUNT_LENGTH) {
      return NextResponse.json(
        { error: 'subjectPlayerId and a written account are required' },
        { status: 400 }
      );
    }
    if (subjectPlayerId === proposerId) {
      return NextResponse.json({ error: "You can't make suggestions about your own stats" }, { status: 403 });
    }
    // changes = [{ statId, delta }, ...] — one suggestion is created per stat
    // (auto-split), so the crew votes on each change independently.
    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json({ error: 'Pick at least one stat to change' }, { status: 400 });
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

    const [proposer, subject] = await Promise.all([
      queryOne('SELECT active FROM Player WHERE id = ?', [proposerId]),
      queryOne('SELECT active FROM Player WHERE id = ?', [subjectPlayerId]),
    ]);
    if (!proposer || !Number(proposer.active)) {
      return NextResponse.json({ error: 'Only active players can propose' }, { status: 403 });
    }
    if (!subject || !Number(subject.active)) {
      return NextResponse.json({ error: 'Subject player is not active' }, { status: 400 });
    }

    // Every named stat must exist, be visible for the subject, and be unlocked.
    // Categories are chosen manually by the proposer now — evidence tags no
    // longer constrain which stats are fair game (written testimony has no
    // tags, so the constraint stopped making sense).
    for (const change of changes) {
      const stat = await queryOne('SELECT s.id, s.label FROM Stat s WHERE s.id = ?', [change.statId]);
      if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

      const hiddenRow = await queryOne(
        'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
        [change.statId, subjectPlayerId]
      );
      if (hiddenRow) {
        return NextResponse.json({ error: `"${stat.label}" is not tracked for this player` }, { status: 400 });
      }

      const lock = await isStatLockedForPlayer(String(change.statId), String(subjectPlayerId));
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
      const placeholders = uniqueEvidenceIds.map(() => '?').join(',');
      const evidence = await queryAll(
        `SELECT e.id, e.playerId FROM Evidence e WHERE e.id IN (${placeholders})`,
        uniqueEvidenceIds
      );
      if (evidence.length !== uniqueEvidenceIds.length) {
        return NextResponse.json({ error: 'One or more evidence posts were not found' }, { status: 400 });
      }
      for (const post of evidence as any[]) {
        if (String(post.playerId) !== String(subjectPlayerId)) {
          return NextResponse.json({ error: 'Evidence must be posted by the subject themselves' }, { status: 400 });
        }
      }
    }

    // Auto-split: one Suggestion row per stat change, all sharing the same
    // account / evidence links AND a batchId so the UI can group them under a
    // single card. The crew still votes on each independently.
    const now = new Date().toISOString();
    const created: { id: string; statId: string; resolution: any }[] = [];
    const batchId = uuid();
    let columnsEnsured = false;

    for (const change of changes) {
      const id = uuid();
      // testimony is written NULL: the account lives in `reason`, which is the
      // field that reaches StatHistory when the suggestion is approved.
      const insertArgs = [
        id,
        subjectPlayerId,
        proposerId,
        String(change.statId),
        Number(change.delta),
        account,
        null,
        batchId,
        now,
        now,
      ];
      const insertSql = `INSERT INTO Suggestion (id, playerId, proposedById, statId, delta, reason, testimony, batchId, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`;
      try {
        await query(insertSql, insertArgs);
      } catch (e: any) {
        // Self-healing migration: testimony/batchId are additive columns —
        // create them on first use instead of requiring a manual migration.
        if (columnsEnsured || !/no column named|no such column/i.test(String(e?.message))) throw e;
        for (const alter of [
          'ALTER TABLE Suggestion ADD COLUMN testimony TEXT',
          'ALTER TABLE Suggestion ADD COLUMN batchId TEXT',
        ]) {
          try {
            await query(alter);
          } catch {
            /* already exists */
          }
        }
        columnsEnsured = true;
        await query(insertSql, insertArgs);
      }
      for (const evidenceId of uniqueEvidenceIds) {
        await query('INSERT INTO SuggestionEvidence (suggestionId, evidenceId) VALUES (?, ?)', [id, evidenceId]);
      }

      // Proposing counts as an implicit yes — write the Vote row so tallies stay simple
      await query('INSERT INTO Vote (id, suggestionId, userId, choice, createdAt) VALUES (?, ?, ?, ?, ?)', [
        uuid(),
        id,
        proposerId,
        'yes',
        now,
      ]);

      // A 2-player roster means 1 eligible voter — the proposal itself is already a majority
      const resolution = await resolveSuggestion(id);
      created.push({ id, statId: String(change.statId), resolution });
    }

    // One push per batch (not per stat) to everyone who still needs to vote —
    // the proposer already auto-voted, and anything already resolved is moot.
    // AWAITED (not fire-and-forget): an unawaited send gets killed when the
    // serverless function returns its response, which is why these never
    // arrived. Blocking on it costs a beat but guarantees delivery.
    try {
      const stillPending = created.filter((c) => c.resolution?.status === 'pending');
      if (stillPending.length > 0) {
        const voters = (await getEligibleVoterIds(String(subjectPlayerId))).filter((id) => id !== proposerId);
        if (voters.length > 0) {
          const [proposerRow, subjectRow] = await Promise.all([
            queryOne('SELECT username FROM Player WHERE id = ?', [proposerId]),
            queryOne('SELECT username FROM Player WHERE id = ?', [subjectPlayerId]),
          ]);
          const n = stillPending.length;
          await sendPushToPlayers(voters, {
            title: 'A suggestion needs your vote',
            body: `${String(proposerRow?.username || 'Someone')} proposed ${
              n > 1 ? `${n} stat changes` : 'a stat change'
            } for ${String(subjectRow?.username || 'a player')}.`,
            url: '/suggestions',
            tag: 'vote-needed',
          });
        }
      }
    } catch (e) {
      console.error('Vote-needed push failed (ignored):', e);
    }

    // In a small roster a proposal can clear on creation (the proposer's own
    // yes is already a majority). Tell the subject once for the whole batch
    // rather than firing a separate push for every approved stat.
    try {
      const applied = created
        .map((c) => c.resolution?.applied)
        .filter((a): a is ApprovedChange => Boolean(a));
      await notifyApprovedChanges(String(subjectPlayerId), applied);
    } catch (e) {
      console.error('Approval push failed (ignored):', e);
    }

    // @mentions in the account
    const proposerRow = await queryOne('SELECT username FROM Player WHERE id = ?', [proposerId]);
    recordMentions({
      content: account,
      byId: proposerId,
      byName: String(proposerRow?.username || 'Someone'),
      context: 'suggestion',
      url: '/suggestions',
    });

    return NextResponse.json({ success: true, created, count: created.length });
  } catch (error: any) {
    console.error('Error creating suggestion:', error);
    return NextResponse.json(errorPayload('Failed to create suggestion', error), { status: 500 });
  }
}

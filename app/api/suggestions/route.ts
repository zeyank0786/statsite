import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import { resolveSuggestion, expireStaleSuggestions, getEligibleVoterIds } from '@/lib/suggestionEngine';
import { featureLockMessage, getPlayersLockedFrom } from '@/lib/featureLocks';
import { firePush } from '@/lib/push';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const ALLOWED_DELTAS = [-2, -1, 1, 2];

async function getSessionPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  return playerId ? String(playerId) : null;
}

/** GET: pending queue + resolved history, with everything the page needs. */
export async function GET() {
  const currentPlayerId = await getSessionPlayerId();
  if (!currentPlayerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Lazy housekeeping: resolve week-old pending suggestions by votes cast
    try {
      await expireStaleSuggestions();
    } catch (e) {
      console.error('Stale-suggestion expiry failed (listing continues):', e);
    }

    const suggestions = await queryAll(
      `SELECT sg.*,
              subject.username as subjectName, subject.active as subjectActive,
              proposer.username as proposerName,
              s.code as statCode, s.label as statLabel,
              c.code as categoryCode, c.label as categoryLabel,
              COALESCE(sv.value, 5) as currentValue
       FROM Suggestion sg
       JOIN Player subject ON sg.playerId = subject.id
       JOIN Player proposer ON sg.proposedById = proposer.id
       JOIN Stat s ON sg.statId = s.id
       JOIN Category c ON s.categoryId = c.id
       LEFT JOIN StatValue sv ON sv.statId = sg.statId AND sv.playerId = sg.playerId
       ORDER BY (sg.status = 'pending') DESC, COALESCE(sg.resolvedAt, sg.createdAt) DESC`
    );

    // What an approved suggestion ACTUALLY moved the stat from/to.
    // `currentValue` above is the live value, which for a resolved suggestion
    // already includes this change — rendering "current + delta" would double
    // count it. applyApproval() stamps the StatHistory row with the same
    // timestamp it sets resolvedAt to, so statId+playerId+timestamp identifies
    // the exact row (works retroactively; no migration needed).
    const appliedRows = await queryAll(
      `SELECT sv.statId as statId, sv.playerId as playerId,
              sh.oldValue, sh.newValue, sh.createdAt
       FROM StatHistory sh
       JOIN StatValue sv ON sh.statValueId = sv.id
       WHERE sh.source = 'suggestion'`
    );
    const appliedByKey = new Map<string, { oldValue: number; newValue: number }>();
    for (const r of appliedRows as any[]) {
      appliedByKey.set(`${String(r.statId)}:${String(r.playerId)}:${String(r.createdAt)}`, {
        oldValue: Number(r.oldValue),
        newValue: Number(r.newValue),
      });
    }

    const votes = await queryAll(
      `SELECT v.suggestionId, v.userId, v.choice, p.username
       FROM Vote v JOIN Player p ON v.userId = p.id`
    );
    const votesBySuggestion = new Map<string, any[]>();
    for (const vote of votes as any[]) {
      const key = String(vote.suggestionId);
      if (!votesBySuggestion.has(key)) votesBySuggestion.set(key, []);
      votesBySuggestion.get(key)!.push(vote);
    }

    const evidenceLinks = await queryAll(
      `SELECT se.suggestionId, e.id, e.mediaUrl, e.mediaType, e.caption, e.captionHidden, e.playerId,
              p.username as posterName
       FROM SuggestionEvidence se
       JOIN Evidence e ON se.evidenceId = e.id
       JOIN Player p ON e.playerId = p.id`
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
        reason: String(sg.reason),
        testimony: sg.testimony ? String(sg.testimony) : null,
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
      };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json({ error: 'Failed to fetch suggestions', details: error.message }, { status: 500 });
  }
}

/**
 * POST: create a suggestion. Enforces the full trust model:
 * proposer ≠ subject, both active, delta ∈ {-2,-1,1,2}, reason required,
 * grounding required — EITHER ≥1 evidence post (all posted BY the subject and
 * tagged with the stat's category) OR a written witness testimony (for things
 * seen in real life with no media) — and the stat must be visible and
 * unlocked for the subject.
 */
const MIN_TESTIMONY_LENGTH = 1;

export async function POST(request: Request) {
  const proposerId = await getSessionPlayerId();
  if (!proposerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lockMsg = await featureLockMessage(proposerId, 'suggest');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { subjectPlayerId, changes, reason, evidenceIds, testimony } = await request.json();

    if (!subjectPlayerId || !reason?.trim()) {
      return NextResponse.json({ error: 'subjectPlayerId and reason are required' }, { status: 400 });
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
    const cleanTestimony = typeof testimony === 'string' ? testimony.trim() : '';
    if (!hasEvidence && cleanTestimony.length < MIN_TESTIMONY_LENGTH) {
      return NextResponse.json(
        {
          error:
            cleanTestimony.length > 0
              ? `Witness testimony needs at least ${MIN_TESTIMONY_LENGTH} characters — describe what actually happened`
              : 'Ground the suggestion: attach an evidence post, or write what you witnessed first-hand',
        },
        { status: 400 }
      );
    }

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
    // reason / testimony / evidence links AND a batchId so the UI can group
    // them under a single card. The crew still votes on each independently.
    const now = new Date().toISOString();
    const created: { id: string; statId: string; resolution: any }[] = [];
    const batchId = uuid();
    let columnsEnsured = false;

    for (const change of changes) {
      const id = uuid();
      const insertArgs = [
        id,
        subjectPlayerId,
        proposerId,
        String(change.statId),
        Number(change.delta),
        reason.trim(),
        cleanTestimony || null,
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
          firePush(voters, {
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

    return NextResponse.json({ success: true, created, count: created.length });
  } catch (error: any) {
    console.error('Error creating suggestion:', error);
    return NextResponse.json({ error: 'Failed to create suggestion', details: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import { resolveSuggestion } from '@/lib/suggestionEngine';
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

    const activePlayers = await queryAll('SELECT id FROM Player WHERE active = 1');
    const activeIds = new Set((activePlayers as any[]).map((p) => String(p.id)));

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

      return {
        id,
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
const MIN_TESTIMONY_LENGTH = 20;

export async function POST(request: Request) {
  const proposerId = await getSessionPlayerId();
  if (!proposerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { subjectPlayerId, statId, delta, reason, evidenceIds, testimony } = await request.json();

    if (!subjectPlayerId || !statId || !reason?.trim()) {
      return NextResponse.json({ error: 'subjectPlayerId, statId and reason are required' }, { status: 400 });
    }
    if (subjectPlayerId === proposerId) {
      return NextResponse.json({ error: "You can't make suggestions about your own stats" }, { status: 403 });
    }
    if (!ALLOWED_DELTAS.includes(Number(delta))) {
      return NextResponse.json({ error: 'Delta must be -2, -1, +1 or +2' }, { status: 400 });
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

    const stat = await queryOne('SELECT s.id, s.categoryId, s.label FROM Stat s WHERE s.id = ?', [statId]);
    if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

    // Visibility: hidden stats aren't suggestible for that player
    const hiddenRow = await queryOne(
      'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
      [statId, subjectPlayerId]
    );
    if (hiddenRow) {
      return NextResponse.json({ error: 'That stat is not tracked for this player' }, { status: 400 });
    }

    // Locking: blocked with a clear unlock message
    const lock = await isStatLockedForPlayer(String(statId), String(subjectPlayerId));
    if (lock.locked) {
      return NextResponse.json(
        { error: `"${stat.label}" is locked for this player. ${describeLock(lock)}` },
        { status: 400 }
      );
    }

    // Evidence (when attached): must exist, be posted by the subject, and at
    // least one piece must be tagged with the stat's category (keeps
    // suggestions relevant). Testimony-only suggestions skip these checks —
    // the written account itself is the grounding, vetted by the vote.
    const uniqueEvidenceIds = hasEvidence ? [...new Set(evidenceIds as string[])] : [];
    if (hasEvidence) {
      const placeholders = uniqueEvidenceIds.map(() => '?').join(',');
      const evidence = await queryAll(
        `SELECT e.id, e.playerId,
                (SELECT COUNT(*) FROM EvidenceCategory ec WHERE ec.evidenceId = e.id AND ec.categoryId = ?) as matchesCategory
         FROM Evidence e WHERE e.id IN (${placeholders})`,
        [String(stat.categoryId), ...uniqueEvidenceIds]
      );
      if (evidence.length !== uniqueEvidenceIds.length) {
        return NextResponse.json({ error: 'One or more evidence posts were not found' }, { status: 400 });
      }
      for (const post of evidence as any[]) {
        if (String(post.playerId) !== String(subjectPlayerId)) {
          return NextResponse.json({ error: 'Evidence must be posted by the subject themselves' }, { status: 400 });
        }
      }
      if (!(evidence as any[]).some((post) => Number(post.matchesCategory) > 0)) {
        return NextResponse.json(
          { error: 'The stat must belong to a category the attached evidence was tagged with' },
          { status: 400 }
        );
      }
    }

    const id = uuid();
    const now = new Date().toISOString();
    const insertArgs = [
      id,
      subjectPlayerId,
      proposerId,
      statId,
      Number(delta),
      reason.trim(),
      cleanTestimony || null,
      now,
      now,
    ];
    try {
      await query(
        `INSERT INTO Suggestion (id, playerId, proposedById, statId, delta, reason, testimony, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        insertArgs
      );
    } catch (e: any) {
      // Self-healing migration: the testimony column is additive, so create it
      // on first use instead of requiring a manual Turso migration.
      if (!/no column named testimony|no such column/i.test(String(e?.message))) throw e;
      await query('ALTER TABLE Suggestion ADD COLUMN testimony TEXT');
      await query(
        `INSERT INTO Suggestion (id, playerId, proposedById, statId, delta, reason, testimony, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        insertArgs
      );
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

    return NextResponse.json({ success: true, id, resolution });
  } catch (error: any) {
    console.error('Error creating suggestion:', error);
    return NextResponse.json({ error: 'Failed to create suggestion', details: error.message }, { status: 500 });
  }
}

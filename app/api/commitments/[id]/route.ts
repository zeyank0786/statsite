import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { firePush } from '@/lib/push';
import { ensureCommitmentTables, tallyVotes, resolveWithdrawal } from '@/lib/commitments';
import { getEligibleVoterIds } from '@/lib/suggestionEngine';

export const dynamic = 'force-dynamic';

async function getPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  return playerId ? String(playerId) : null;
}

/** GET: one commitment with stats, check-ins and the live vote tally. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentPlayerId = await getPlayerId();
  if (!currentPlayerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    await ensureCommitmentTables();

    const c = (await queryOne(
      `SELECT c.*, p.username as playerName, p.active as playerActive
       FROM Commitment c JOIN Player p ON c.playerId = p.id WHERE c.id = ?`,
      [id]
    )) as any;
    if (!c) return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });

    const subjectId = String(c.playerId);
    const status = String(c.status);

    const [stats, checkIns] = await Promise.all([
      queryAll(
        `SELECT cs.statId, cs.delta, s.code, s.label, cat.code as categoryCode, cat.label as categoryLabel,
                COALESCE(sv.value, 5) as currentValue
         FROM CommitmentStat cs
         JOIN Stat s ON cs.statId = s.id
         JOIN Category cat ON s.categoryId = cat.id
         LEFT JOIN StatValue sv ON sv.statId = cs.statId AND sv.playerId = ?
         WHERE cs.commitmentId = ?`,
        [subjectId, id]
      ),
      queryAll(
        `SELECT ci.id, ci.note, ci.createdAt, e.id as evidenceId, e.mediaUrl, e.mediaType, e.caption, e.captionHidden
         FROM CommitmentCheckIn ci
         LEFT JOIN Evidence e ON ci.evidenceId = e.id
         WHERE ci.commitmentId = ? ORDER BY ci.createdAt DESC`,
        [id]
      ),
    ]);

    let tally = null;
    if (status === 'awaiting_verdict' || status === 'withdraw_pending') {
      const kind = status === 'withdraw_pending' ? 'withdrawal' : 'verdict';
      const t = await tallyVotes(id, subjectId, kind);
      const mine = t.voters.find((v) => v.playerId === currentPlayerId);
      const eligible = await getEligibleVoterIds(subjectId);
      tally = {
        kind,
        eligibleCount: t.eligibleCount,
        votesNeeded: t.votesNeeded,
        yes: t.yes,
        no: t.no,
        waitingOn: t.waitingOn,
        yourVote: mine ? mine.choice : null,
        canVote: subjectId !== currentPlayerId && eligible.includes(currentPlayerId),
      };
    }

    return NextResponse.json({
      id: String(c.id),
      playerId: subjectId,
      playerName: String(c.playerName),
      playerActive: Boolean(Number(c.playerActive)),
      title: String(c.title),
      detail: c.detail ? String(c.detail) : null,
      cadence: String(c.cadence),
      deadline: String(c.deadline),
      status,
      withdrawReason: c.withdrawReason ? String(c.withdrawReason) : null,
      createdAt: String(c.createdAt),
      resolvedAt: c.resolvedAt ? String(c.resolvedAt) : null,
      isSubject: subjectId === currentPlayerId,
      stats: (stats as any[]).map((s) => ({
        statId: String(s.statId),
        delta: Number(s.delta),
        code: String(s.code),
        label: String(s.label),
        categoryCode: String(s.categoryCode),
        categoryLabel: String(s.categoryLabel),
        currentValue: Number(s.currentValue),
      })),
      checkIns: (checkIns as any[]).map((ci) => ({
        id: String(ci.id),
        note: ci.note ? String(ci.note) : null,
        createdAt: String(ci.createdAt),
        evidence: ci.evidenceId
          ? {
              id: String(ci.evidenceId),
              mediaUrl: ci.mediaUrl || null,
              mediaType: ci.mediaType || null,
              caption: Number(ci.captionHidden) ? null : ci.caption || null,
            }
          : null,
      })),
      tally,
    });
  } catch (error: any) {
    console.error('Error loading commitment:', error);
    return NextResponse.json({ error: 'Failed to load commitment', details: error.message }, { status: 500 });
  }
}

/**
 * PATCH — subject-only lifecycle actions:
 *   { action: 'forfeit' }                      → recorded as missed
 *   { action: 'requestWithdrawal', reason }    → needs a unanimous crew yes
 *   { action: 'cancelWithdrawal' }             → back to active
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const { action, reason } = await request.json();
    await ensureCommitmentTables();

    const c = (await queryOne('SELECT * FROM Commitment WHERE id = ?', [id])) as any;
    if (!c) return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });
    if (String(c.playerId) !== playerId) {
      return NextResponse.json({ error: "That's not your commitment" }, { status: 403 });
    }

    const status = String(c.status);
    const now = new Date().toISOString();

    if (action === 'forfeit') {
      if (status !== 'active' && status !== 'awaiting_verdict' && status !== 'withdraw_pending') {
        return NextResponse.json({ error: 'This commitment is already resolved' }, { status: 400 });
      }
      await query("UPDATE Commitment SET status = 'missed', resolvedAt = ?, updatedAt = ? WHERE id = ?", [
        now,
        now,
        id,
      ]);
      const others = await getEligibleVoterIds(playerId);
      const subject = await queryOne('SELECT username FROM Player WHERE id = ?', [playerId]);
      firePush(others, {
        title: `${String(subject?.username || 'Someone')} forfeited a commitment`,
        body: String(c.title),
        url: `/commitments/${id}`,
        tag: `commitment-${id}`,
      });
      return NextResponse.json({ success: true, status: 'missed' });
    }

    if (action === 'requestWithdrawal') {
      if (status !== 'active' && status !== 'awaiting_verdict') {
        return NextResponse.json({ error: 'This commitment is already resolved' }, { status: 400 });
      }
      if (!reason?.trim() || reason.trim().length < 10) {
        return NextResponse.json(
          { error: 'Explain the circumstances — the crew has to agree unanimously, so give them something real.' },
          { status: 400 }
        );
      }
      await query('DELETE FROM CommitmentVote WHERE commitmentId = ? AND kind = ?', [id, 'withdrawal']);
      await query(
        "UPDATE Commitment SET status = 'withdraw_pending', withdrawReason = ?, updatedAt = ? WHERE id = ?",
        [reason.trim(), now, id]
      );

      const voters = await getEligibleVoterIds(playerId);
      const subject = await queryOne('SELECT username FROM Player WHERE id = ?', [playerId]);
      firePush(voters, {
        title: `${String(subject?.username || 'Someone')} asked to withdraw`,
        body: `"${String(c.title)}" — needs everyone to agree. Reason: ${reason.trim()}`,
        url: `/commitments/${id}`,
        tag: `commitment-withdraw-${id}`,
      });

      // No eligible voters at all → nothing to be unanimous about
      const outcome = await resolveWithdrawal(id);
      return NextResponse.json({ success: true, status: outcome });
    }

    if (action === 'cancelWithdrawal') {
      if (status !== 'withdraw_pending') {
        return NextResponse.json({ error: 'No withdrawal is pending' }, { status: 400 });
      }
      await query('DELETE FROM CommitmentVote WHERE commitmentId = ? AND kind = ?', [id, 'withdrawal']);
      await query("UPDATE Commitment SET status = 'active', withdrawReason = NULL, updatedAt = ? WHERE id = ?", [
        now,
        id,
      ]);
      return NextResponse.json({ success: true, status: 'active' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('Error updating commitment:', error);
    return NextResponse.json({ error: 'Failed to update commitment', details: error.message }, { status: 500 });
  }
}

/** DELETE: only an untouched, still-active commitment can be removed outright. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    await ensureCommitmentTables();
    const c = await queryOne('SELECT playerId, status FROM Commitment WHERE id = ?', [id]);
    if (!c) return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });
    if (String(c.playerId) !== playerId) {
      return NextResponse.json({ error: "That's not your commitment" }, { status: 403 });
    }
    if (String(c.status) !== 'active') {
      return NextResponse.json(
        { error: 'Only an active commitment can be deleted — forfeit or request a withdrawal instead.' },
        { status: 400 }
      );
    }
    const checkIns = await queryOne('SELECT COUNT(*) as n FROM CommitmentCheckIn WHERE commitmentId = ?', [id]);
    if (Number(checkIns?.n) > 0) {
      return NextResponse.json(
        { error: "You've already checked in on this — forfeit or request a withdrawal instead." },
        { status: 400 }
      );
    }

    await query('DELETE FROM CommitmentStat WHERE commitmentId = ?', [id]);
    await query('DELETE FROM CommitmentVote WHERE commitmentId = ?', [id]);
    await query('DELETE FROM Commitment WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting commitment:', error);
    return NextResponse.json({ error: 'Failed to delete commitment', details: error.message }, { status: 500 });
  }
}

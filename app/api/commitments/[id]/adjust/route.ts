import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryOne, queryAll } from '@/lib/db';
import { featureLockMessage } from '@/lib/featureLocks';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import { getEligibleVoterIds } from '@/lib/suggestionEngine';
import { ensureCommitmentTables, proposeAdjustment, ALLOWED_DELTAS } from '@/lib/commitments';

export const dynamic = 'force-dynamic';

/**
 * POST { stats: [{ statId, delta }], reason? }
 *
 * Re-price a commitment that's awaiting a verdict. The subject sets their own
 * reward, so the crew needs a way to say "you did it, but that's worth less"
 * without having to call a completed commitment missed.
 *
 * Voters only — the subject can't re-price their own promise. Adjusting
 * resets verdict votes so nobody's existing vote gets reinterpreted.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const voterId = (session.user as any)?.playerId;
    if (!voterId) return NextResponse.json({ error: 'No player linked to this account' }, { status: 400 });

    const lockMsg = await featureLockMessage(String(voterId), 'vote');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    await ensureCommitmentTables();
    const c = await queryOne('SELECT playerId, status FROM Commitment WHERE id = ?', [id]);
    if (!c) return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });

    const subjectId = String(c.playerId);
    if (String(c.status) !== 'awaiting_verdict') {
      return NextResponse.json(
        { error: 'The reward can only be adjusted while the commitment is awaiting a verdict' },
        { status: 400 }
      );
    }
    if (subjectId === String(voterId)) {
      return NextResponse.json({ error: "You can't re-price your own commitment" }, { status: 403 });
    }
    const eligible = await getEligibleVoterIds(subjectId);
    if (!eligible.includes(String(voterId))) {
      return NextResponse.json({ error: "You're not eligible to vote on this" }, { status: 403 });
    }

    const { stats, reason } = await request.json();
    if (!Array.isArray(stats)) {
      return NextResponse.json({ error: 'stats must be an array' }, { status: 400 });
    }

    // An empty list is allowed: "you did it, but it isn't worth points"
    const seen = new Set<string>();
    const parsed: { statId: string; delta: number }[] = [];
    for (const s of stats) {
      const statId = String(s?.statId || '');
      const delta = Number(s?.delta);
      if (!statId || seen.has(statId)) {
        return NextResponse.json({ error: 'Each stat can only be listed once' }, { status: 400 });
      }
      if (!ALLOWED_DELTAS.includes(delta)) {
        return NextResponse.json({ error: 'Deltas must be -2, -1, +1 or +2' }, { status: 400 });
      }
      seen.add(statId);
      parsed.push({ statId, delta });
    }

    // Same visibility/lock rules as creating a commitment — the crew can't
    // route around gating by re-pricing onto a locked stat.
    for (const change of parsed) {
      const stat = await queryOne('SELECT id, label FROM Stat WHERE id = ?', [change.statId]);
      if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });
      const hidden = await queryOne(
        'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
        [change.statId, subjectId]
      );
      if (hidden) {
        return NextResponse.json(
          { error: `"${String(stat.label)}" isn't tracked for them` },
          { status: 400 }
        );
      }
      const lock = await isStatLockedForPlayer(change.statId, subjectId);
      if (lock.locked) {
        return NextResponse.json(
          { error: `"${String(stat.label)}" is locked for them. ${describeLock(lock)}` },
          { status: 400 }
        );
      }
    }

    await proposeAdjustment({
      commitmentId: id,
      proposerId: String(voterId),
      stats: parsed,
      reason: reason || null,
    });

    return NextResponse.json({ success: true, adjusted: parsed.length });
  } catch (error: any) {
    console.error('Error adjusting commitment:', error);
    return NextResponse.json({ error: 'Failed to adjust', details: error.message }, { status: 500 });
  }
}

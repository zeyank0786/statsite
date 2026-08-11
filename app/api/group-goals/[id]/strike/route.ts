import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ensureGroupGoalTables, syncGoalCompletion } from '@/lib/groupGoals';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Challenge a contribution, or withdraw the challenge.
 *
 * Contributions count on sight so a long goal keeps moving, and this is the
 * counterweight: anyone in the crew can strike one they don't believe, which
 * pulls it out of the total immediately. The row is never deleted — the claim,
 * the challenger and the reason all stay on the record, and un-striking is a
 * single call, so a mistaken strike costs nothing.
 *
 * You cannot strike your own contribution: that's what deleting would be, and
 * quietly erasing a claim you made is exactly what the record exists to stop.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: goalId } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
    if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureGroupGoalTables();
    const body = await request.json();
    const contributionId = typeof body.contributionId === 'string' ? body.contributionId : '';
    const strike = body.strike !== false; // default: strike it

    const contribution = await queryOne(
      'SELECT id, goalId, playerId, status FROM GroupGoalContribution WHERE id = ? AND goalId = ?',
      [contributionId, goalId]
    );
    if (!contribution) return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });

    if (strike && String(contribution.playerId) === String(playerId)) {
      return NextResponse.json(
        { error: "You can't strike your own contribution — ask a crewmate to review it" },
        { status: 403 }
      );
    }

    // Paid-out goals are frozen: the standings the payout was computed from
    // have to stay exactly as they were when the crew voted on it.
    const paid = await queryOne(
      "SELECT id FROM Suggestion WHERE groupGoalId = ? AND status IN ('pending','approved') LIMIT 1",
      [goalId]
    ).catch(() => null);
    if (paid) {
      return NextResponse.json(
        { error: 'This goal has already gone to payout — its contributions are locked' },
        { status: 409 }
      );
    }

    if (strike) {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) {
        return NextResponse.json({ error: 'Say why you\'re challenging it' }, { status: 400 });
      }
      await query(
        'UPDATE GroupGoalContribution SET status = ?, struckById = ?, struckReason = ? WHERE id = ?',
        ['struck', String(playerId), reason, contributionId]
      );
    } else {
      await query(
        'UPDATE GroupGoalContribution SET status = ?, struckById = NULL, struckReason = NULL WHERE id = ?',
        ['counted', contributionId]
      );
    }

    return NextResponse.json({ success: true, goal: await syncGoalCompletion(goalId) });
  } catch (error: unknown) {
    console.error('Error striking contribution:', error);
    return NextResponse.json(errorPayload('Failed to update contribution', error), { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryAll, queryOne } from '@/lib/db';
import { ensureGroupGoalTables, getGoal, syncGoalCompletion } from '@/lib/groupGoals';
import { featureLockMessage } from '@/lib/featureLocks';
import { sendPushToPlayers } from '@/lib/push';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Add to a group goal's total.
 *
 * Evidence is mandatory and must be YOUR OWN post — the same rule suggestions
 * use, for the same reason: a number nobody can check is worth nothing on a
 * board built on proof. The contribution counts immediately; the crew's
 * recourse is to strike it (see ./strike), not to gate it behind a vote that
 * would stall a month-long goal.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: goalId } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
    if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Someone locked out of posting evidence has no business logging progress
    // that must be evidenced.
    const lockMsg = await featureLockMessage(String(playerId), 'evidence');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    await ensureGroupGoalTables();
    const goal = await getGoal(goalId);
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    if (goal.status === 'archived') {
      return NextResponse.json({ error: 'This goal is archived' }, { status: 400 });
    }
    if (goal.status === 'completed') {
      return NextResponse.json({ error: 'This goal is already complete' }, { status: 400 });
    }
    if (goal.deadline && Date.parse(goal.deadline) < Date.now()) {
      return NextResponse.json({ error: 'The deadline for this goal has passed' }, { status: 400 });
    }

    const body = await request.json();
    const amount = Math.floor(Number(body.amount));
    if (!Number.isInteger(amount) || amount < 1) {
      return NextResponse.json({ error: 'Log a positive whole number' }, { status: 400 });
    }

    const evidenceId = typeof body.evidenceId === 'string' ? body.evidenceId : '';
    if (!evidenceId) {
      return NextResponse.json(
        { error: 'Attach an evidence post — every contribution has to be provable' },
        { status: 400 }
      );
    }
    const evidence = await queryOne('SELECT id, playerId FROM Evidence WHERE id = ?', [evidenceId]);
    if (!evidence) return NextResponse.json({ error: 'Evidence post not found' }, { status: 404 });
    if (String(evidence.playerId) !== String(playerId)) {
      return NextResponse.json(
        { error: 'The evidence has to be your own post' },
        { status: 403 }
      );
    }
    // One contribution per evidence post, or the same photo could be logged
    // over and over to run the total up.
    const reused = await queryOne(
      'SELECT id FROM GroupGoalContribution WHERE goalId = ? AND evidenceId = ?',
      [goalId, evidenceId]
    );
    if (reused) {
      return NextResponse.json(
        { error: "That evidence post is already logged against this goal" },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    await query(
      `INSERT INTO GroupGoalContribution
        (id, goalId, playerId, amount, evidenceId, note, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'counted', ?)`,
      [
        uuid(),
        goalId,
        String(playerId),
        amount,
        evidenceId,
        typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
        now,
      ]
    );

    const updated = await syncGoalCompletion(goalId);

    // Completing a shared goal is a crew moment — everyone hears about it.
    // The goal was still active on the way in (guarded above), so a completed
    // status here means this contribution is the one that got it over the line.
    if (updated?.status === 'completed') {
      try {
        const crew = await queryAll(
          'SELECT p.id FROM Player p JOIN User u ON u.playerId = p.id WHERE p.active = 1'
        );
        const ids = (crew as Record<string, unknown>[]).map((r) => String(r.id));
        if (ids.length > 0) {
          await sendPushToPlayers(ids, {
            title: '🎯 Crew goal complete!',
            body: `"${goal.title}" — ${updated.progress.toLocaleString()} ${goal.unit}. Time to settle up.`,
            url: '/group-goals',
            tag: `group-goal-${goalId}`,
          });
        }
      } catch (e) {
        console.error('Goal-complete push failed (ignored):', e);
      }
    }

    return NextResponse.json({ success: true, goal: updated });
  } catch (error: unknown) {
    console.error('Error contributing to group goal:', error);
    return NextResponse.json(errorPayload('Failed to log contribution', error), { status: 500 });
  }
}

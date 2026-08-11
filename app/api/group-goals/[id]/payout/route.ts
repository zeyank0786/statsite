import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryAll, queryOne } from '@/lib/db';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import { featureLockMessage } from '@/lib/featureLocks';
import {
  getEligibleVoterIds,
  resolveSuggestion,
  notifyApprovedChanges,
} from '@/lib/suggestionEngine';
import { computePayout, ensureGroupGoalTables, getGoal } from '@/lib/groupGoals';
import { sendPushToPlayers } from '@/lib/push';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * File the payout for a completed goal.
 *
 * The crew's one hard rule is that stats only move through a voted suggestion,
 * and a group goal is no exception: this computes each player's share and
 * files them as ordinary suggestions (uncapped, linked by `groupGoalId`) that
 * still have to clear a vote.
 *
 * That rule also means the caller cannot file their OWN share — proposer must
 * differ from subject. So this files everyone else's and reports who is still
 * outstanding; a second crew member calls it to cover the first. Every share is
 * idempotent per player, so repeated calls never double-file.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: goalId } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    const proposerId = (session?.user as { playerId?: string } | undefined)?.playerId;
    if (!proposerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const lockMsg = await featureLockMessage(String(proposerId), 'suggest');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    await ensureGroupGoalTables();
    const goal = await getGoal(goalId);
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    if (goal.status !== 'completed') {
      return NextResponse.json(
        { error: 'The goal has to be complete before it pays out' },
        { status: 400 }
      );
    }
    if (!goal.statId) {
      return NextResponse.json({ error: 'This goal has no stat to award' }, { status: 400 });
    }

    const shares = computePayout(goal, goal.standings);
    if (shares.length === 0) {
      return NextResponse.json({ error: 'Nothing to pay out' }, { status: 400 });
    }

    const alreadyFiled = new Set(goal.paidOutPlayerIds);
    const now = new Date().toISOString();
    const filed: { playerId: string; playerName: string; points: number }[] = [];
    const skipped: { playerId: string; playerName: string; points: number; why: string }[] = [];

    for (const share of shares) {
      if (alreadyFiled.has(share.playerId)) continue;

      // The invariant that makes this whole feature safe.
      if (share.playerId === String(proposerId)) {
        skipped.push({ ...share, why: 'your own share — a crewmate has to file it' });
        continue;
      }
      const eligible = await getEligibleVoterIds(share.playerId);
      if (!eligible.includes(String(proposerId))) {
        skipped.push({ ...share, why: "you're not eligible to propose for them" });
        continue;
      }
      const hidden = await queryOne(
        'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
        [goal.statId, share.playerId]
      );
      if (hidden) {
        skipped.push({ ...share, why: `${goal.statLabel} isn't tracked for them` });
        continue;
      }
      const lock = await isStatLockedForPlayer(String(goal.statId), share.playerId);
      if (lock.locked) {
        skipped.push({ ...share, why: `${goal.statLabel} is locked — ${describeLock(lock)}` });
        continue;
      }

      const suggestionId = uuid();
      const reason = `🎯 Crew goal payout — "${goal.title}". ${share.playerName} logged ${share.amount.toLocaleString()} ${goal.unit} (${share.basis}), all evidenced on the board.`;
      await query(
        `INSERT INTO Suggestion
          (id, playerId, proposedById, statId, delta, reason, batchId, groupGoalId, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          suggestionId,
          share.playerId,
          String(proposerId),
          String(goal.statId),
          share.points,
          reason,
          suggestionId,
          goalId,
          now,
          now,
        ]
      );
      // Filing it counts as the proposer's yes, same as any suggestion.
      await query('INSERT INTO Vote (id, suggestionId, userId, choice, createdAt) VALUES (?, ?, ?, ?, ?)', [
        uuid(),
        suggestionId,
        String(proposerId),
        'yes',
        now,
      ]);

      const resolution = await resolveSuggestion(suggestionId);
      if (resolution?.applied) {
        await notifyApprovedChanges(resolution.applied.playerId, [resolution.applied]).catch(() => {});
      }
      filed.push({ playerId: share.playerId, playerName: share.playerName, points: share.points });
    }

    // One push for the batch, to everyone who still owes a vote.
    if (filed.length > 0) {
      try {
        const crew = await queryAll(
          'SELECT p.id FROM Player p JOIN User u ON u.playerId = p.id WHERE p.active = 1 AND p.id != ?',
          [String(proposerId)]
        );
        const ids = (crew as Record<string, unknown>[]).map((r) => String(r.id));
        if (ids.length > 0) {
          await sendPushToPlayers(ids, {
            title: 'Crew goal payout needs your vote',
            body: `${filed.length} award${filed.length === 1 ? '' : 's'} filed for "${goal.title}".`,
            url: '/suggestions',
            tag: 'vote-needed',
          });
        }
      } catch (e) {
        console.error('Payout push failed (ignored):', e);
      }
    }

    return NextResponse.json({
      success: true,
      filed,
      skipped,
      goal: await getGoal(goalId),
    });
  } catch (error: unknown) {
    console.error('Error paying out group goal:', error);
    return NextResponse.json(errorPayload('Failed to file payout', error), { status: 500 });
  }
}

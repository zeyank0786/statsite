import { NextResponse } from 'next/server';
import { featureLockMessage } from '@/lib/featureLocks';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryAll, queryOne } from '@/lib/db';
import {
  MAX_REWARD_POOL,
  MAX_TARGET,
  ensureGroupGoalTables,
  listGoals,
  type RewardMode,
} from '@/lib/groupGoals';
import { sendPushToPlayers } from '@/lib/push';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

async function getPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  return playerId ? String(playerId) : null;
}

/** GET: every goal, with live standings. */
export async function GET() {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await listGoals());
  } catch (error: unknown) {
    console.error('Error listing group goals:', error);
    return NextResponse.json(errorPayload('Failed to load group goals', error), { status: 500 });
  }
}

/**
 * POST: create a goal. Anyone in the crew can set one — the reward is decided
 * up front, in the open, and still has to survive a vote when it pays out.
 */
export async function POST(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lockMsg = await featureLockMessage(String(playerId), 'goals');
  if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

  try {
    await ensureGroupGoalTables();
    const body = await request.json();

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
    const target = Math.floor(Number(body.target));
    if (!title) return NextResponse.json({ error: 'Give the goal a title' }, { status: 400 });
    if (!unit) {
      return NextResponse.json({ error: 'Name the unit being counted (reps, km, books…)' }, { status: 400 });
    }
    if (!Number.isInteger(target) || target < 1 || target > MAX_TARGET) {
      return NextResponse.json({ error: 'Target must be a positive whole number' }, { status: 400 });
    }

    const rewardMode: RewardMode = body.rewardMode === 'podium' ? 'podium' : 'proportional';
    const asPoints = (value: unknown) => {
      const n = Math.floor(Number(value));
      return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_REWARD_POOL) : 0;
    };
    const rewardPool = rewardMode === 'proportional' ? asPoints(body.rewardPool) : 0;
    const rewardFirst = rewardMode === 'podium' ? asPoints(body.rewardFirst) : 0;
    const rewardSecond = rewardMode === 'podium' ? asPoints(body.rewardSecond) : 0;
    const rewardThird = rewardMode === 'podium' ? asPoints(body.rewardThird) : 0;

    if (rewardMode === 'proportional' && rewardPool < 1) {
      return NextResponse.json({ error: 'Set a reward pool of at least 1 point' }, { status: 400 });
    }
    if (rewardMode === 'podium' && rewardFirst + rewardSecond + rewardThird < 1) {
      return NextResponse.json({ error: 'Set at least one podium reward' }, { status: 400 });
    }

    // The stat the payout lands on. Required — a reward with nowhere to go
    // would leave the crew arguing about it after the fact.
    const statId = typeof body.statId === 'string' ? body.statId : '';
    if (!statId) return NextResponse.json({ error: 'Pick which stat the reward lands on' }, { status: 400 });
    const stat = await queryOne('SELECT id, label FROM Stat WHERE id = ?', [statId]);
    if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

    let deadline: string | null = null;
    if (body.deadline) {
      const ms = Date.parse(String(body.deadline));
      if (Number.isNaN(ms)) return NextResponse.json({ error: 'Deadline is not a valid date' }, { status: 400 });
      deadline = new Date(ms).toISOString();
    }

    const id = uuid();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO GroupGoal
        (id, title, detail, unit, target, statId, statLabel, rewardMode, rewardPool,
         rewardFirst, rewardSecond, rewardThird, deadline, status, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        id,
        title,
        typeof body.detail === 'string' && body.detail.trim() ? body.detail.trim() : null,
        unit,
        target,
        statId,
        String(stat.label),
        rewardMode,
        rewardPool,
        rewardFirst,
        rewardSecond,
        rewardThird,
        deadline,
        String(playerId),
        now,
        now,
      ]
    );

    // Tell the crew there's something to get behind. Awaited, not fired — an
    // unawaited send dies when the serverless function returns.
    try {
      const others = await queryAll(
        'SELECT p.id FROM Player p JOIN User u ON u.playerId = p.id WHERE p.active = 1 AND p.id != ?',
        [String(playerId)]
      );
      const creator = await queryOne('SELECT username FROM Player WHERE id = ?', [String(playerId)]);
      const ids = (others as Record<string, unknown>[]).map((r) => String(r.id));
      if (ids.length > 0) {
        await sendPushToPlayers(ids, {
          title: 'New crew goal',
          body: `${String(creator?.username || 'Someone')} set "${title}" — ${target.toLocaleString()} ${unit} between all of us.`,
          url: '/group-goals',
          tag: `group-goal-${id}`,
        });
      }
    } catch (e) {
      console.error('Group-goal push failed (ignored):', e);
    }

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    console.error('Error creating group goal:', error);
    return NextResponse.json(errorPayload('Failed to create group goal', error), { status: 500 });
  }
}

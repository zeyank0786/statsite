import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { featureLockMessage } from '@/lib/featureLocks';
import { firePush } from '@/lib/push';
import {
  NUDGE_KINDS,
  NUDGE_COOLDOWN_HOURS,
  isValidNudgeKind,
  nudgeCooldownRemaining,
  recordNudge,
} from '@/lib/nudges';

export const dynamic = 'force-dynamic';

/**
 * POST { targetPlayerId, kind } → poke someone.
 * GET  ?targetPlayerId=X       → { kinds, cooldownMs } so the UI can show
 *                                 whether the button is available yet.
 */

async function getPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  return playerId ? String(playerId) : null;
}

export async function GET(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const targetPlayerId = new URL(request.url).searchParams.get('targetPlayerId');
  const cooldownMs = targetPlayerId ? await nudgeCooldownRemaining(playerId, targetPlayerId) : 0;

  return NextResponse.json({
    kinds: NUDGE_KINDS.map((k) => ({ key: k.key, label: k.label })),
    cooldownMs,
    cooldownHours: NUDGE_COOLDOWN_HOURS,
  });
}

export async function POST(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // A player barred from the message board shouldn't be able to ping people
    // through a side door.
    const lockMsg = await featureLockMessage(playerId, 'messages');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { targetPlayerId, kind } = await request.json();
    if (!targetPlayerId || !kind) {
      return NextResponse.json({ error: 'targetPlayerId and kind are required' }, { status: 400 });
    }
    if (!isValidNudgeKind(String(kind))) {
      return NextResponse.json({ error: 'Unknown nudge kind' }, { status: 400 });
    }
    if (String(targetPlayerId) === playerId) {
      return NextResponse.json({ error: "You can't nudge yourself" }, { status: 400 });
    }

    const [target, sender] = await Promise.all([
      queryOne('SELECT username, active FROM Player WHERE id = ?', [targetPlayerId]),
      queryOne('SELECT username FROM Player WHERE id = ?', [playerId]),
    ]);
    if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    if (!Number(target.active)) {
      return NextResponse.json({ error: 'That player is not active' }, { status: 400 });
    }

    const remaining = await nudgeCooldownRemaining(playerId, String(targetPlayerId));
    if (remaining > 0) {
      const hours = Math.ceil(remaining / 3600_000);
      return NextResponse.json(
        { error: `You already nudged ${String(target.username)} — try again in ${hours}h.` },
        { status: 429 }
      );
    }

    await recordNudge(playerId, String(targetPlayerId), String(kind) as any);

    const meta = NUDGE_KINDS.find((k) => k.key === kind)!;
    firePush([String(targetPlayerId)], {
      title: `👉 ${String(sender?.username || 'Someone')} ${meta.title}`,
      body: meta.body,
      url: meta.url,
      tag: `nudge-${playerId}`,
    });

    return NextResponse.json({ success: true, cooldownHours: NUDGE_COOLDOWN_HOURS });
  } catch (error: any) {
    console.error('Error sending nudge:', error);
    return NextResponse.json({ error: 'Failed to send nudge', details: error.message }, { status: 500 });
  }
}

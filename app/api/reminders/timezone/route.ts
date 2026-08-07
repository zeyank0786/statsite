import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { getPlayerTimezone, setPlayerTimezone, isValidTimezone } from '@/lib/reminders';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Per-user timezone — the clock every one of that player's reminders is
 * judged against. A player sets their own; an admin may set anyone's.
 */

async function getActor(): Promise<{ playerId: string; isAdmin: boolean } | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return null;
  return { playerId: String(playerId), isAdmin: Boolean((session?.user as any)?.isAdmin) };
}

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const requested = new URL(request.url).searchParams.get('playerId');
  const targetId = requested && requested !== actor.playerId ? requested : actor.playerId;
  if (targetId !== actor.playerId && !actor.isAdmin) {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }
  const timezone = await getPlayerTimezone(targetId);
  return NextResponse.json({ timezone });
}

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const timezone = String(body?.timezone ?? '').trim();
    const targetId = body?.playerId ? String(body.playerId) : actor.playerId;

    if (targetId !== actor.playerId && !actor.isAdmin) {
      return NextResponse.json({ error: 'Only admins can set someone else’s timezone' }, { status: 403 });
    }
    if (!isValidTimezone(timezone)) {
      return NextResponse.json({ error: 'That doesn’t look like a valid timezone' }, { status: 400 });
    }

    await setPlayerTimezone(targetId, timezone);
    return NextResponse.json({ success: true, timezone });
  } catch (error: any) {
    console.error('Error setting timezone:', error);
    return NextResponse.json(errorPayload('Failed to set timezone', error), { status: 500 });
  }
}

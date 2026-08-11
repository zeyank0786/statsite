import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { compareAcrossTime } from '@/lib/wayback';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * GET /api/history/wayback?from=<iso>&to=<iso>&playerId=<id>
 *
 * Your stat sheet on two dates, and everything that moved between them.
 * `playerId` defaults to the signed-in player; `to` defaults to now.
 */
export async function GET(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const sessionPlayerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  if (!sessionPlayerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') || String(sessionPlayerId);

    const player = await queryOne('SELECT id, username FROM Player WHERE id = ?', [playerId]);
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    const now = new Date().toISOString();
    const parse = (raw: string | null, fallback: string): string | null => {
      if (!raw) return fallback;
      const ms = Date.parse(raw);
      if (Number.isNaN(ms)) return null;
      // Clamp to now: a future date would just repeat today's sheet while
      // looking like it meant something.
      return ms > Date.now() ? now : new Date(ms).toISOString();
    };

    // A bare date ("2026-03-01") parses as midnight UTC, which reads as the
    // START of that day. For the later end of the window that would silently
    // exclude everything that happened on the day you picked, so a date-only
    // `to` is pushed to the end of its day.
    const rawTo = url.searchParams.get('to');
    const toIsDateOnly = Boolean(rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo));
    const from = parse(url.searchParams.get('from'), new Date(Date.now() - 90 * 86400000).toISOString());
    let to = parse(rawTo, now);
    if (from === null || to === null) {
      return NextResponse.json({ error: 'from and to must be valid dates' }, { status: 400 });
    }
    if (toIsDateOnly) {
      const endOfDay = new Date(Date.parse(`${rawTo}T23:59:59.999Z`)).toISOString();
      to = endOfDay > now ? now : endOfDay;
    }

    const result = await compareAcrossTime(playerId, from, to);

    return NextResponse.json({
      player: { id: String(player.id), username: String(player.username) },
      ...result,
    });
  } catch (error: unknown) {
    console.error('Error building wayback comparison:', error);
    return NextResponse.json(errorPayload('Failed to build comparison', error), { status: 500 });
  }
}

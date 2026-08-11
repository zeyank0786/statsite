import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import {
  TRAINING_GAMES,
  getGame,
  getLeaderboards,
  getRecentResults,
  recordResult,
} from '@/lib/training';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

async function getPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  return playerId ? String(playerId) : null;
}

/** GET → the game catalog, every leaderboard, and the recent run feed. */
export async function GET() {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [leaderboards, recent] = await Promise.all([getLeaderboards(), getRecentResults()]);
    return NextResponse.json({ games: TRAINING_GAMES, leaderboards, recent });
  } catch (error: unknown) {
    console.error('Error loading training data:', error);
    return NextResponse.json(errorPayload('Failed to load the facility', error), { status: 500 });
  }
}

/**
 * POST → record a run.
 *
 * Scores are reported by the client and only bounded here, which is fine by
 * design: a run buys a leaderboard position, never points. Turning one into
 * stats is a separate suggestion a crewmate files and the crew votes on.
 */
export async function POST(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const game = getGame(String(body.gameId || ''));
    if (!game) return NextResponse.json({ error: 'Unknown game' }, { status: 400 });

    const score = Math.floor(Number(body.score));
    if (!Number.isInteger(score) || score < 0) {
      return NextResponse.json({ error: 'Score must be a whole number' }, { status: 400 });
    }
    if (score > game.maxScore) {
      return NextResponse.json(
        { error: `That score is above what ${game.name} can produce` },
        { status: 400 }
      );
    }

    const detail =
      body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)
        ? (body.detail as Record<string, unknown>)
        : null;

    return NextResponse.json({ success: true, ...(await recordResult(playerId, game.id, score, detail)) });
  } catch (error: unknown) {
    console.error('Error recording training result:', error);
    return NextResponse.json(errorPayload('Failed to record the run', error), { status: 500 });
  }
}

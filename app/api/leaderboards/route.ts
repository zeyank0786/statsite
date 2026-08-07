import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { getLeaderboard } from '@/lib/leaderboard';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * The board itself is cached crew-wide (see lib/leaderboard.ts) — the auth
 * check stays out here, per request, so caching never serves data to a
 * signed-out caller.
 */
export async function GET() {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const players = await getLeaderboard();
    return NextResponse.json({ players });
  } catch (error: any) {
    console.error('Error building leaderboards:', error);
    return NextResponse.json(errorPayload('Failed to build leaderboards', error), { status: 500 });
  }
}

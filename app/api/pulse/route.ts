import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { getPulseCounts } from '@/lib/pulse';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * One round trip for everything the app shell polls.
 *
 * The shell previously fired three requests every 15s (/messages/unread,
 * /evidence/unread, /suggestions/unvoted) on every page, with the notification
 * bell and activity ticker adding two more on their own timers — roughly 16
 * requests a minute per open tab before the page itself did anything.
 *
 * The counting lives in lib/pulse so it can be measured by scripts/bench
 * without standing up a request. The original endpoints are intentionally left
 * in place: they also carry the POST handlers that mark things read, and other
 * callers still use them.
 */
export async function GET() {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playerId = (session.user as { playerId?: string })?.playerId;
    if (!playerId) {
      return NextResponse.json({ messages: 0, evidence: 0, suggestions: 0 });
    }

    return NextResponse.json(await getPulseCounts(String(playerId)));
  } catch (error: unknown) {
    console.error('Error building pulse:', error);
    return NextResponse.json(errorPayload('Failed to load pulse', error), { status: 500 });
  }
}

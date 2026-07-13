import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { buildFeed, markSeen } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * GET  → { events, unseenCount, celebrations } for the signed-in player
 * POST { seen?: true, celebrated?: true } → advance the respective marker
 */

async function getPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  return playerId ? String(playerId) : null;
}

export async function GET() {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const feed = await buildFeed(playerId);
    return NextResponse.json(feed);
  } catch (error: any) {
    console.error('Error building notification feed:', error);
    return NextResponse.json({ error: 'Failed to build feed', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { seen, celebrated } = await request.json();
    await markSeen(playerId, { seen: Boolean(seen), celebrated: Boolean(celebrated) });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking notifications:', error);
    return NextResponse.json({ error: 'Failed to mark', details: error.message }, { status: 500 });
  }
}

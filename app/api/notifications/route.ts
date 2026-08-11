import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { buildFeed, markSeen } from '@/lib/notifications';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * GET  → { events, unseenCount, celebrations } for the signed-in player
 * POST { seen?: true, celebrated?: true, section?: string } → advance a marker.
 *       `seen` clears the whole feed (the bell was opened); `section` clears
 *       just one page's items (that page was opened).
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
    return NextResponse.json(errorPayload('Failed to build feed', error), { status: 500 });
  }
}

export async function POST(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { seen, celebrated, section } = await request.json();
    // Sections are free-form path segments; bound the length so a junk value
    // can't bloat the table.
    const cleanSection =
      typeof section === 'string' && /^[a-z0-9-]{1,40}$/i.test(section.trim())
        ? section.trim()
        : undefined;
    await markSeen(playerId, {
      seen: Boolean(seen),
      celebrated: Boolean(celebrated),
      section: cleanSection,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking notifications:', error);
    return NextResponse.json(errorPayload('Failed to mark', error), { status: 500 });
  }
}

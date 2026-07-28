import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { createBroadcast, getRecentBroadcasts } from '@/lib/broadcasts';
import { sendPushToPlayers } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * Admin mass nudge — announce something to the whole crew.
 * GET  → { broadcasts } recent history
 * POST { title, message?, url? } → records it (shows in everyone's bell) and
 *   fires one push to every active player. Push is AWAITED so it actually
 *   sends before the function returns.
 */

const TITLE_MAX = 90;
const MESSAGE_MAX = 300;

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const broadcasts = await getRecentBroadcasts(20);
    return NextResponse.json({ broadcasts });
  } catch (error: any) {
    console.error('Error listing broadcasts:', error);
    return NextResponse.json({ error: 'Failed to list broadcasts', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { title, message, url } = await request.json();
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanMessage = typeof message === 'string' ? message.trim() : '';
    const cleanUrl = typeof url === 'string' && url.trim().startsWith('/') ? url.trim() : '';

    if (!cleanTitle) {
      return NextResponse.json({ error: 'A title is required' }, { status: 400 });
    }
    if (cleanTitle.length > TITLE_MAX) {
      return NextResponse.json({ error: `Title must be ${TITLE_MAX} characters or fewer` }, { status: 400 });
    }
    if (cleanMessage.length > MESSAGE_MAX) {
      return NextResponse.json({ error: `Message must be ${MESSAGE_MAX} characters or fewer` }, { status: 400 });
    }

    const createdById = (session.user as any)?.playerId ? String((session.user as any).playerId) : null;
    const record = await createBroadcast({
      title: cleanTitle,
      body: cleanMessage || null,
      url: cleanUrl || null,
      createdById,
    });

    // Push to everyone still on the active roster.
    const players = await queryAll('SELECT id FROM Player WHERE active = 1');
    const ids = (players as any[]).map((p) => String(p.id));
    const pushed = await sendPushToPlayers(ids, {
      title: `📢 ${cleanTitle}`,
      body: cleanMessage || 'New announcement from the admin.',
      url: cleanUrl || '/',
      tag: `broadcast-${record.id}`,
    });

    return NextResponse.json({ ok: true, id: record.id, recipients: ids.length, pushed });
  } catch (error: any) {
    console.error('Error sending broadcast:', error);
    return NextResponse.json({ error: 'Failed to send broadcast', details: error.message }, { status: 500 });
  }
}

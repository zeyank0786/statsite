import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { pushConfigured, saveSubscription, removeSubscription, sendPushToPlayers } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * GET    → { configured, vapidPublicKey } so the client can subscribe.
 *          Served at runtime rather than inlined via NEXT_PUBLIC_*, so adding
 *          the env vars in Vercel takes effect on redeploy with no build-time
 *          coupling and the UI can honestly report "not configured yet".
 * POST   { subscription }   → store this device's subscription
 * POST   { test: true }     → send yourself a test notification
 * DELETE { endpoint }       → forget this device
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

  return NextResponse.json({
    configured: pushConfigured,
    vapidPublicKey: pushConfigured ? process.env.VAPID_PUBLIC_KEY : null,
  });
}

export async function POST(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();

    if (body?.test) {
      if (!pushConfigured) {
        return NextResponse.json({ error: 'Push is not configured on the server yet' }, { status: 400 });
      }
      const sent = await sendPushToPlayers([playerId], {
        title: '4WARD',
        body: "Notifications are on. This is what they'll look like.",
        url: '/',
        tag: 'test',
      });
      return NextResponse.json({ success: true, sent });
    }

    const sub = body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }
    await saveSubscription(playerId, sub);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving push subscription:', error);
    return NextResponse.json({ error: 'Failed to save subscription', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { endpoint } = await request.json();
    if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
    await removeSubscription(String(endpoint));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing push subscription:', error);
    return NextResponse.json({ error: 'Failed to remove subscription', details: error.message }, { status: 500 });
  }
}

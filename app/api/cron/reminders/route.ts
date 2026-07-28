import { NextResponse } from 'next/server';
import { runDueReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

/**
 * Fires custom reminders that are due.
 *
 * Meant to be hit frequently (~every 15 min) so time-of-day reminders land on
 * time. Vercel's Hobby cron only runs once a day, so point a free external
 * pinger at this endpoint — see REMINDERS-SETUP.md. The daily Vercel cron
 * (vote-reminders) also calls runDueReminders() as a once-a-day backstop.
 *
 * Auth: when CRON_SECRET is set, send it as either an `Authorization: Bearer`
 * header (Vercel + most cron services) or a `?secret=` query param (for
 * services that can't set headers). Unset → open, for local testing.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    const url = new URL(request.url);
    const qs = url.searchParams.get('secret') || url.searchParams.get('key');
    if (auth !== `Bearer ${secret}` && qs !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Reminder cron failed:', error);
    return NextResponse.json({ error: 'Cron failed', details: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

// Some cron services default to POST — accept both.
export async function POST(request: Request) {
  return handle(request);
}

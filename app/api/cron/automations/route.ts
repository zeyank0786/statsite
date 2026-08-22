import { NextResponse } from 'next/server';
import { runDueAutomations } from '@/lib/automations';
import { describeSource, recordCronRun } from '@/lib/cronHealth';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Applies every automatic stat change that has come due.
 *
 * Slots are whole calendar days, so once a day is enough — the daily Vercel cron
 * (vote-reminders) already calls runDueAutomations() as a backstop, and this
 * endpoint exists so an external pinger can drive it more often if you ever want
 * changes landing earlier in the day.
 *
 * Running it twice in a day is harmless: a qualifier's nextRunAt moves into the
 * future the moment it fires, so the second pass finds nothing due.
 *
 * Auth matches the other crons: CRON_SECRET as a Bearer header or ?secret=,
 * open when unset for local testing.
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

  const source = describeSource(request);
  try {
    const result = await runDueAutomations();
    await recordCronRun('automations', { ok: true, source });
    return NextResponse.json({ ok: true, source, ...result });
  } catch (error: any) {
    console.error('Automation cron failed:', error);
    await recordCronRun('automations', { ok: false, source, error });
    return NextResponse.json(errorPayload('Cron failed', error), { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

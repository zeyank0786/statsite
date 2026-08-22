import { NextResponse } from 'next/server';
import { runCommitmentUpkeep } from '@/lib/commitments';
import { describeSource, recordCronRun } from '@/lib/cronHealth';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Commitments upkeep — deadline sweep, weekly check-in nudges, verdict chasing.
 *
 * The daily vote-reminders cron already chains runCommitmentUpkeep(), so this
 * route exists for manual runs and for scheduling separately if the project
 * ever moves off Vercel's Hobby cron limits.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const source = describeSource(request);
  try {
    const result = await runCommitmentUpkeep();
    await recordCronRun('commitments', { ok: true, source });
    return NextResponse.json({ ok: true, source, ...result });
  } catch (error: any) {
    console.error('Commitments cron failed:', error);
    await recordCronRun('commitments', { ok: false, source, error });
    return NextResponse.json(errorPayload('Cron failed', error), { status: 500 });
  }
}

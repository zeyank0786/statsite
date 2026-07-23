import { NextResponse } from 'next/server';
import { runCommitmentUpkeep } from '@/lib/commitments';

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

  try {
    const result = await runCommitmentUpkeep();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Commitments cron failed:', error);
    return NextResponse.json({ error: 'Cron failed', details: error.message }, { status: 500 });
  }
}

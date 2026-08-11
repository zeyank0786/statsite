import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { listContributions } from '@/lib/groupGoals';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Every logged contribution across all goals — the receipts behind the totals.
 *
 * Fetched whole rather than per goal because the board shows several goals at
 * once and the volume is small (one row per evidenced effort).
 */
export async function GET(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!(session?.user as { playerId?: string } | undefined)?.playerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const goalId = new URL(request.url).searchParams.get('goalId') || undefined;
    return NextResponse.json(await listContributions(goalId));
  } catch (error: unknown) {
    console.error('Error listing contributions:', error);
    return NextResponse.json(errorPayload('Failed to load contributions', error), { status: 500 });
  }
}

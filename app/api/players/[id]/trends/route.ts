import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { computePlayerTrends } from '@/lib/trends';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * GET /api/players/[id]/trends
 *
 * The computation itself lives in lib/trends.ts so the server-rendered
 * dashboard can share it without an HTTP hop.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    return NextResponse.json(await computePlayerTrends(id));
  } catch (error: any) {
    console.error('Error computing trends:', error);
    return NextResponse.json(errorPayload('Failed to compute trends', error), { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { computeWrapped, listCompletedSeasons, seasonFromKey, previousSeason } from '@/lib/wrapped';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wrapped[?season=2026-Q2]
 * Returns the requested (or latest completed) season's recap for the current
 * user, plus the list of seasons that have data for the picker.
 */
export async function GET(request: Request) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const seasonKey = url.searchParams.get('season');

    const seasons = await listCompletedSeasons();
    const season = (seasonKey && seasonFromKey(seasonKey)) || seasons[0] || previousSeason();

    const wrapped = await computeWrapped(String(playerId), season);

    return NextResponse.json({
      wrapped,
      seasons: seasons.map((s) => ({ key: s.key, label: s.label, months: s.months })),
    });
  } catch (error: any) {
    console.error('Error building wrapped:', error);
    return NextResponse.json(errorPayload('Failed to build Wrapped', error), { status: 500 });
  }
}

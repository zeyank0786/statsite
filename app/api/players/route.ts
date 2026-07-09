import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Active roster by default. Pass ?includeInactive=1 to also get archived
 * players (used for color registration and historical displays).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === '1';

    const players = await queryAll(
      includeInactive
        ? 'SELECT id, username, active FROM Player ORDER BY active DESC, username ASC'
        : 'SELECT id, username, active FROM Player WHERE active = 1 ORDER BY username ASC'
    );

    return NextResponse.json(
      players.map((p: any) => ({
        id: String(p.id),
        username: String(p.username),
        active: Boolean(Number(p.active)),
      }))
    );
  } catch (error: any) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { error: 'Failed to fetch players', details: error.message },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { getLocksForPlayer } from '@/lib/featureLocks';

export const dynamic = 'force-dynamic';

/** The signed-in player's own lockouts: { feature: reason|null, ... } */
export async function GET() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const locks = await getLocksForPlayer(String(playerId));
    return NextResponse.json({ locks: Object.fromEntries(locks) });
  } catch (error: any) {
    console.error('Error loading own locks:', error);
    return NextResponse.json({ error: 'Failed to load locks', details: error.message }, { status: 500 });
  }
}

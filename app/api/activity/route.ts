import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { getRecentActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

/** Recent crew-wide public activity for the live ticker. */
export async function GET() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const events = await getRecentActivity(30);
    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Error building activity ticker:', error);
    return NextResponse.json({ events: [] });
  }
}

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getCronHealth } from '@/lib/cronHealth';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * GET → the state of every scheduled job.
 *
 * Admin-only because it names the endpoints and reports whether the pinger
 * hitting them is authenticated and alive — useful to an admin, and a map of
 * what to poke to anyone else.
 */
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

  try {
    return NextResponse.json({ jobs: await getCronHealth() });
  } catch (error: unknown) {
    console.error('Failed to read cron health:', error);
    return NextResponse.json(errorPayload('Failed to read cron health', error), { status: 500 });
  }
}

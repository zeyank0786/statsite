import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getAllLocks, setFeatureLock, isValidFeature, LOCKABLE_FEATURES } from '@/lib/featureLocks';

export const dynamic = 'force-dynamic';

/**
 * Admin management of per-player feature lockouts.
 * GET  → { features, locks }
 * POST { playerId, feature | 'all', locked, reason? }
 */

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const locks = await getAllLocks();
    return NextResponse.json({ features: LOCKABLE_FEATURES, locks });
  } catch (error: any) {
    console.error('Error listing feature locks:', error);
    return NextResponse.json({ error: 'Failed to list locks', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { playerId, feature, locked, reason } = await request.json();
    if (!playerId || typeof locked !== 'boolean') {
      return NextResponse.json({ error: 'playerId and locked(boolean) required' }, { status: 400 });
    }
    const adminPlayerId = (session.user as any)?.playerId ? String((session.user as any).playerId) : null;

    const features =
      feature === 'all' ? LOCKABLE_FEATURES.map((f) => f.key) : isValidFeature(String(feature)) ? [feature] : null;
    if (!features) {
      return NextResponse.json(
        { error: `feature must be 'all' or one of: ${LOCKABLE_FEATURES.map((f) => f.key).join(', ')}` },
        { status: 400 }
      );
    }

    for (const f of features) {
      await setFeatureLock({ playerId, feature: f, locked, reason, createdById: adminPlayerId });
    }
    return NextResponse.json({ success: true, affected: features.length });
  } catch (error: any) {
    console.error('Error setting feature lock:', error);
    return NextResponse.json({ error: 'Failed to set lock', details: error.message }, { status: 500 });
  }
}

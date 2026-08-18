import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getAllLocks, setFeatureLock, isValidFeature, LOCKABLE_FEATURES } from '@/lib/featureLocks';
import { ACCESS_LOCKS, isAccessLock } from '@/lib/accessLocks';
import { sendPushToPlayers } from '@/lib/push';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Admin management of per-player lockouts.
 * GET  → { features, accessLocks, locks }
 * POST { playerId, feature | 'all', locked, reason? }
 *
 * `feature` may be a named feature, one of the account-level locks
 * ('interact' / 'full'), or 'all' — which now means the account-level
 * `interact` lock rather than a snapshot of today's feature list. That
 * distinction is the whole point: the old 'all' wrote one row per feature that
 * existed at the time, so anything shipped afterwards was not covered by it.
 */

/** Push the affected player a plain account of what just changed for them. */
async function notifyLockChange(
  playerId: string,
  feature: string,
  locked: boolean,
  reason: string | null | undefined
): Promise<void> {
  const label =
    ACCESS_LOCKS.find((l) => l.key === feature)?.label ||
    LOCKABLE_FEATURES.find((f) => f.key === feature)?.label ||
    feature;

  const title = locked
    ? feature === 'full'
      ? 'Your account has been locked'
      : feature === 'interact'
      ? "You've been locked out of taking part"
      : `You've been locked out of ${label}`
    : feature === 'full' || feature === 'interact'
    ? 'Your account has been unlocked'
    : `${label} is available to you again`;

  const body = locked
    ? [
        feature === 'full'
          ? 'You cannot view the app while this is in place.'
          : 'You can still see everything — you just cannot take part for now.',
        reason?.trim() ? `Reason: ${reason.trim()}` : null,
        feature === 'full' ? null : 'Open the app to see what you can still do.',
      ]
        .filter(Boolean)
        .join(' ')
    : 'Everything works normally again. Welcome back.';

  await sendPushToPlayers([playerId], {
    title,
    body,
    url: locked && feature === 'full' ? '/locked' : '/',
    tag: `lock-${feature}`,
  });
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const locks = await getAllLocks();
    return NextResponse.json({ features: LOCKABLE_FEATURES, accessLocks: ACCESS_LOCKS, locks });
  } catch (error: any) {
    console.error('Error listing feature locks:', error);
    return NextResponse.json(errorPayload('Failed to list locks', error), { status: 500 });
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

    const key = String(feature);

    // An account-level lock on yourself is unrecoverable from inside the app:
    // `full` redirects /admin to /locked, so there would be no way back to the
    // switch that turns it off. Another admin can still lock you, and can
    // still unlock you — it is only self-application that traps.
    if (
      locked &&
      adminPlayerId &&
      adminPlayerId === String(playerId) &&
      (key === 'all' || isAccessLock(key))
    ) {
      return NextResponse.json(
        { error: "You can't lock your own account — you'd have no way back in to undo it." },
        { status: 400 }
      );
    }
    // 'all' is asymmetric on purpose, because the two directions mean
    // different things to an admin:
    //   locking   → the account-level `interact` lock, ONE row that covers
    //               every route by method, including routes added later.
    //   unlocking → clear everything this player has, whatever set it.
    // The old behaviour ("write one row per feature that exists today") is
    // exactly what let new features arrive unlocked for locked accounts.
    const features =
      key === 'all'
        ? locked
          ? ['interact' as const]
          : [...ACCESS_LOCKS.map((l) => l.key), ...LOCKABLE_FEATURES.map((f) => f.key)]
        : isAccessLock(key) || isValidFeature(key)
        ? [key]
        : null;
    if (!features) {
      const valid = [...ACCESS_LOCKS.map((l) => l.key), ...LOCKABLE_FEATURES.map((f) => f.key)];
      return NextResponse.json(
        { error: `feature must be 'all' or one of: ${valid.join(', ')}` },
        { status: 400 }
      );
    }

    for (const f of features) {
      await setFeatureLock({ playerId, feature: f, locked, reason, createdById: adminPlayerId });
    }

    // Tell them. Being silently unable to do anything is the worst version of
    // this, and they cannot ask why if they were never told there was a lock.
    // Awaited, not fired — a serverless function can be frozen on response.
    // A bulk clear sends one "you're unlocked" rather than one per feature.
    try {
      const subject = key === 'all' && !locked ? 'interact' : features[0];
      await notifyLockChange(String(playerId), subject, locked, reason);
    } catch (e) {
      console.error('Lock change push failed (lock itself is applied):', e);
    }

    return NextResponse.json({ success: true, affected: features.length });
  } catch (error: any) {
    console.error('Error setting feature lock:', error);
    return NextResponse.json(errorPayload('Failed to set lock', error), { status: 500 });
  }
}

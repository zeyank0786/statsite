import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { getAccessLevel, STILL_ALLOWED } from '@/lib/accessLocks';
import SignOutButton from './SignOutButton';

export const dynamic = 'force-dynamic';

/**
 * Where a fully locked-out account lands.
 *
 * Every other route redirects here (see proxy.ts), so this page has to answer
 * the only three questions they can have: what happened, why, and what now.
 * Silence would be worse than the lock.
 */
export default async function LockedPage() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/signin');

  const playerId = (session.user as { playerId?: string })?.playerId;
  const access = playerId ? await getAccessLevel(String(playerId)) : null;

  // Not locked (or the lock was just lifted) — nothing to see here.
  if (!access) redirect('/');

  const isFull = access.level === 'full';

  return (
    <main className="min-h-dvh flex items-center justify-center p-5">
      <div className="w-full max-w-lg glass card-shadow-lg p-7 animate-rise">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-5"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)' }}
        >
          🔒
        </div>

        <h1 className="font-display text-3xl font-bold text-white mb-2">
          {isFull ? 'Your account is locked' : 'You’re locked out of taking part'}
        </h1>

        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          {isFull
            ? 'The admin has paused your access to the app.'
            : 'You can look around as normal — you just can’t change anything for now.'}
        </p>

        {access.reason ? (
          <div
            className="rounded-2xl border p-4 mb-5"
            style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}
          >
            <p
              className="text-[11px] font-bold uppercase tracking-wider mb-1"
              style={{ color: 'var(--accent-red)' }}
            >
              Reason given
            </p>
            <p className="text-sm text-white">{access.reason}</p>
          </div>
        ) : null}

        {!isFull && (
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5 text-white">
              What you can still do
            </p>
            <ul className="space-y-2.5">
              {STILL_ALLOWED.map((item) => (
                <li key={item.title} className="flex gap-2.5">
                  <span className="shrink-0 mt-0.5" style={{ color: 'var(--accent-green)' }}>
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{item.title}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {item.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
          {isFull
            ? 'Keep notifications on and you’ll be told the moment this is lifted. Speak to the admin if you think it’s a mistake.'
            : 'You’ll get a notification the moment this is lifted.'}
        </p>

        <div className="flex gap-2.5 flex-wrap">
          {!isFull && (
            <Link href="/" className="btn-gradient text-sm py-2 px-4">
              Back to the app
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}

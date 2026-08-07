'use client';

/**
 * Route-level error boundary. Wraps every page below the root layout, so the
 * header and tab bar stay put and the crew keeps a way out — before this
 * existed, any thrown render error left a dead screen with no navigation.
 *
 * `error.message` is only the real message for errors thrown in Client
 * Components; Server Component errors arrive as a generic string plus a
 * `digest` that matches the server log. We surface the digest rather than
 * pretending to explain the failure.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { WarningIcon, HomeIcon, RefreshIcon } from '@/components/icons';

export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="glass card-shadow-lg p-8 max-w-md w-full text-center animate-rise">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(239, 68, 68, 0.14)', color: 'var(--accent-red)' }}
        >
          <WarningIcon size={26} />
        </div>

        <h1 className="font-display text-2xl font-bold text-white mb-2">That page broke</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Something went wrong rendering this screen. Your data is fine — nothing was
          lost. Try again, and if it keeps happening let the crew know.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button onClick={() => unstable_retry()} className="btn-gradient inline-flex justify-center">
            <RefreshIcon size={16} />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border text-neutral-300 hover:text-white hover:bg-white/5 transition"
            style={{ borderColor: 'var(--surface-border)' }}
          >
            <HomeIcon size={16} />
            Back home
          </Link>
        </div>

        {error.digest && (
          <p className="text-[11px] font-mono mt-6 opacity-60" style={{ color: 'var(--text-secondary)' }}>
            ref {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}

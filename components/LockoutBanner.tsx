'use client';

import { useEffect, useState } from 'react';

/**
 * Per-player feature lockouts, client side. The server is the real guard
 * (participation endpoints 403) — this is the VERY loud "you can look but
 * not touch" layer.
 */

export type MyLockouts = Record<string, string | null>;

/** The signed-in player's lockouts: { feature: reason|null }. Empty = none. */
export function useMyLockouts(enabled: boolean = true): MyLockouts {
  const [locks, setLocks] = useState<MyLockouts>({});
  useEffect(() => {
    if (!enabled) return;
    fetch('/api/feature-locks/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.locks) setLocks(data.locks);
      })
      .catch(() => {});
  }, [enabled]);
  return locks;
}

const FEATURE_LABELS: Record<string, string> = {
  suggest: 'making suggestions',
  vote: 'voting',
  evidence: 'posting evidence',
  messages: 'posting on the board',
  reviews: 'joining reviews',
  targets: 'setting targets',
};

export default function LockoutBanner({
  locks,
  feature,
}: {
  locks: MyLockouts;
  feature: string;
}) {
  if (!(feature in locks)) return null;
  const reason = locks[feature];
  return (
    <div
      className="rounded-2xl border-2 p-4 mb-5 flex items-start gap-3 animate-rise"
      style={{ borderColor: 'rgba(239,68,68,0.7)', background: 'rgba(239,68,68,0.12)' }}
      role="alert"
    >
      <span className="text-2xl shrink-0">🚫</span>
      <div>
        <p className="font-display font-bold text-red-300 text-base uppercase tracking-wide">
          You are locked out of {FEATURE_LABELS[feature] || feature}
        </p>
        <p className="text-sm mt-0.5 text-red-200/80">
          The admin has restricted your participation — you can view everything, but you can&apos;t
          take part{reason ? ` — “${reason}”` : ''}. Talk to the admin to get it lifted.
        </p>
      </div>
    </div>
  );
}

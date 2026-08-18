'use client';

import { useEffect, useState } from 'react';
import { STILL_ALLOWED } from '@/lib/accessLocks';

/**
 * Per-player lockouts, client side. The server is the real guard (proxy.ts
 * refuses the request outright) — this is the VERY loud "you can look but not
 * touch" layer, so nothing fails silently under someone's finger.
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

/**
 * Is this player barred from `feature`?
 *
 * The account-level `interact` lock covers everything, so a page asking about
 * its own feature must not have to know that. Every caller goes through here
 * rather than testing `feature in locks`, which is what let account-level
 * locks be bypassed by any page checking only its own key.
 */
export function isLockedOut(locks: MyLockouts, feature: string): boolean {
  return 'full' in locks || 'interact' in locks || feature in locks;
}

/** The reason to show, preferring the most specific lock in force. */
export function lockReason(locks: MyLockouts, feature: string): string | null {
  if (feature in locks) return locks[feature];
  if ('interact' in locks) return locks.interact;
  if ('full' in locks) return locks.full;
  return null;
}

const FEATURE_LABELS: Record<string, string> = {
  suggest: 'making suggestions',
  vote: 'voting',
  evidence: 'posting evidence',
  messages: 'posting on the board',
  reviews: 'joining reviews',
  targets: 'setting targets',
  commit: 'making commitments',
  ambitions: 'declaring ambitions',
  goals: 'group goals',
  training: 'the training drills',
  automations: 'automations',
  folders: 'evidence folders',
};

export default function LockoutBanner({
  locks,
  feature,
}: {
  locks: MyLockouts;
  feature: string;
}) {
  const accountLocked = 'interact' in locks || 'full' in locks;
  if (!isLockedOut(locks, feature)) return null;

  const reason = lockReason(locks, feature);

  return (
    <div
      className="rounded-2xl border-2 p-4 mb-5 animate-rise"
      style={{ borderColor: 'rgba(239,68,68,0.7)', background: 'rgba(239,68,68,0.12)' }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">🚫</span>
        <div className="min-w-0">
          <p className="font-display font-bold text-red-300 text-base uppercase tracking-wide">
            {accountLocked
              ? 'You are locked out of taking part'
              : `You are locked out of ${FEATURE_LABELS[feature] || feature}`}
          </p>
          <p className="text-sm mt-0.5 text-red-200/80">
            The admin has restricted your participation — you can view everything, but you can&apos;t
            take part{reason ? ` — “${reason}”` : ''}. Talk to the admin to get it lifted.
          </p>
        </div>
      </div>

      {/* An account-wide lock is broad enough that "what CAN I do" is a real
          question. Answer it here rather than leaving them to probe the UI. */}
      {accountLocked && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2 text-red-200">
            What you can still do
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {STILL_ALLOWED.map((item) => (
              <li key={item.title} className="flex gap-2 text-sm text-red-100/90">
                <span className="shrink-0" style={{ color: 'var(--accent-green)' }}>
                  ✓
                </span>
                <span>{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

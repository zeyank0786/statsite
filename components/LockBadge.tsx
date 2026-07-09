'use client';

import { useState } from 'react';
import { LockIcon, XIcon } from './icons';

export interface LockReasonData {
  type: 'stat' | 'category';
  label: string;
  comparator: string;
  threshold: number;
  current: number;
  met: boolean;
}

interface LockBadgeProps {
  reasons: LockReasonData[];
  source?: 'override' | 'rules' | null;
  size?: number;
  statLabel?: string;
}

/**
 * Small lock chip that opens a modal explaining what unlocks the stat —
 * people should see what they're working toward, not just a grey box.
 */
export default function LockBadge({ reasons, source, size = 13, statLabel }: LockBadgeProps) {
  const [open, setOpen] = useState(false);
  const unmet = reasons.filter((r) => !r.met);

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition hover:brightness-125"
        style={{ background: 'rgba(251, 191, 36, 0.15)', color: 'var(--accent-yellow)' }}
        title="Locked — tap to see how to unlock"
      >
        <LockIcon size={size} />
        Locked
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="card-shadow-lg border rounded-t-3xl sm:rounded-3xl p-6 max-w-sm w-full animate-rise"
            style={{ background: '#13131b', borderColor: 'var(--surface-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-xl"
                  style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--accent-yellow)' }}
                >
                  <LockIcon size={18} />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold text-white">Locked</h2>
                  {statLabel && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {statLabel}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
              >
                <XIcon size={17} />
              </button>
            </div>

            {source === 'override' ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                An admin has manually locked this stat. It can't be suggested on until they unlock it.
              </p>
            ) : (
              <div className="space-y-2.5">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  This stat unlocks when {reasons.length > 1 ? 'all of these are met' : 'this is met'}:
                </p>
                {reasons.map((reason, i) => (
                  <div
                    key={i}
                    className="rounded-xl px-3.5 py-3 border"
                    style={{
                      borderColor: reason.met ? 'rgba(52,211,153,0.35)' : 'rgba(251,191,36,0.3)',
                      background: reason.met ? 'rgba(52,211,153,0.06)' : 'rgba(251,191,36,0.05)',
                    }}
                  >
                    <p className="text-sm font-semibold text-white">
                      {reason.label} {reason.comparator} {reason.threshold}
                    </p>
                    <p
                      className="text-xs mt-0.5 font-medium"
                      style={{ color: reason.met ? 'var(--accent-green)' : 'var(--accent-yellow)' }}
                    >
                      {reason.met ? '✓ met' : `currently ${reason.current} — ${Math.max(0, reason.threshold - reason.current)} to go`}
                    </p>
                  </div>
                ))}
                {unmet.length === 0 && reasons.length > 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    All conditions are met — this will unlock on the next refresh.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SparklesIcon, ChevronRightIcon, XIcon } from './icons';

/**
 * Dashboard nudge: when the latest completed season has a recap the viewer
 * hasn't opened yet, invite them to their Wrapped. Gated per-season in
 * localStorage (the /wrapped page sets the same flag), so it shows once.
 */
export default function WrappedBanner() {
  const router = useRouter();
  const [season, setSeason] = useState<{ key: string; label: string; months: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/wrapped')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.wrapped?.hasData) return;
        const s = data.wrapped.season;
        try {
          if (localStorage.getItem(`wrapped-seen-${s.key}`)) return;
        } catch {
          /* ignore */
        }
        setSeason({ key: s.key, label: s.label, months: s.months });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    if (season) {
      try {
        localStorage.setItem(`wrapped-seen-${season.key}`, '1');
      } catch {
        /* ignore */
      }
    }
    setSeason(null);
  };

  if (!season) return null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2 p-5 mb-6 animate-rise flex items-center gap-4"
      style={{
        borderColor: 'rgba(168,85,247,0.5)',
        background: 'linear-gradient(120deg, rgba(168,85,247,0.18), rgba(34,211,238,0.1) 70%)',
      }}
    >
      <div className="p-2.5 rounded-xl shrink-0" style={{ background: 'rgba(168,85,247,0.2)', color: '#c084fc' }}>
        <SparklesIcon size={22} />
      </div>
      <button onClick={() => router.push('/wrapped')} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-bold text-white">Your {season.label} Wrapped is ready 🎁</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          See how your {season.months} went — biggest gains, evidence, where you ranked.
        </p>
      </button>
      <button onClick={() => router.push('/wrapped')} className="btn-gradient text-sm shrink-0 hidden sm:inline-flex">
        Open <ChevronRightIcon size={15} />
      </button>
      <button onClick={dismiss} className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition shrink-0" title="Dismiss">
        <XIcon size={16} />
      </button>
    </div>
  );
}

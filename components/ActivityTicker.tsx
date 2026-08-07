'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePoll } from '@/lib/usePoll';

interface ActivityItem {
  id: string;
  at: string;
  emoji: string;
  text: string;
  hex: string;
  href: string;
}

/**
 * A slim, always-moving marquee of recent crew activity across the top of the
 * dashboard. Two copies of the list scroll as one seamless loop; hovering
 * pauses it; reduced-motion turns it into a plain horizontal scroll. Polls so
 * it stays fresh without a refresh.
 */
export default function ActivityTicker() {
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);

  // Paused while the tab is hidden — a marquee nobody can see has no reason to
  // keep querying. Refetches immediately on return.
  usePoll(async () => {
    try {
      const r = await fetch('/api/activity');
      if (!r.ok) return;
      const data = await r.json();
      if (data) setItems(data.events || []);
    } catch {
      /* silent */
    }
  }, 25000);

  if (items.length === 0) return null;

  const Row = ({ ariaHidden }: { ariaHidden?: boolean }) => (
    <span className="inline-flex items-center" aria-hidden={ariaHidden}>
      {items.map((it) => (
        <button
          key={(ariaHidden ? 'b:' : 'a:') + it.id}
          onClick={() => it.href && router.push(it.href)}
          className="inline-flex items-center gap-1.5 px-3.5 py-0.5 hover:opacity-100 opacity-90 transition"
          title={it.text}
          tabIndex={ariaHidden ? -1 : 0}
        >
          <span className="text-sm">{it.emoji}</span>
          <span className="text-[12px] font-medium text-neutral-200">{it.text}</span>
          <span className="w-1 h-1 rounded-full ml-2" style={{ background: it.hex }} />
        </button>
      ))}
    </span>
  );

  return (
    <div
      className="ticker-mask relative overflow-hidden rounded-xl border mb-6 animate-rise"
      style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="flex items-center py-2">
        <span className="shrink-0 pl-3 pr-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--accent-cyan)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: 'var(--accent-cyan)' }} />
          Live
        </span>
        <div className="relative flex-1 overflow-x-auto sm:overflow-hidden">
          <div className="ticker-track">
            <Row />
            <Row ariaHidden />
          </div>
        </div>
      </div>
    </div>
  );
}

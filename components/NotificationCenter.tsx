'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon, XIcon } from './icons';

/**
 * The bell: a polled activity feed for the whole crew, plus personal
 * celebrations — full-screen confetti modal for achievements/tier-ups,
 * compact toasts for your stat changes. Self-contained: mounts in the
 * AppShell header and does its own fetching.
 */

interface FeedEvent {
  id: string;
  type: string;
  at: string;
  playerName: string;
  title: string;
  body?: string;
  href?: string;
  hex: string;
}

interface Celebration {
  id: string;
  kind: 'achievement' | 'tier' | 'stat';
  title: string;
  subtitle: string;
  hex: string;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const CONFETTI_COLORS = ['#22d3ee', '#ec4899', '#a855f7', '#f97316', '#34d399', '#fbbf24'];

function Confetti() {
  // Deterministic-enough randomness per mount; pure CSS animation
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    duration: 2.2 + Math.random() * 1.6,
    size: 6 + Math.random() * 6,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    spin: Math.random() > 0.5 ? 1 : -1,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--spin' as any]: `${p.spin * (540 + Math.random() * 360)}deg`,
          }}
        />
      ))}
    </div>
  );
}

export default function NotificationCenter() {
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const [modalQueue, setModalQueue] = useState<Celebration[]>([]);
  const [toasts, setToasts] = useState<Celebration[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events || []);
      setUnseen(data.unseenCount || 0);

      const celebrations: Celebration[] = data.celebrations || [];
      if (celebrations.length > 0) {
        // Mark celebrated immediately so a re-poll doesn't replay them,
        // then play the queue locally.
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ celebrated: true }),
        }).catch(() => {});
        const big = celebrations.filter((c) => c.kind !== 'stat');
        const small = celebrations.filter((c) => c.kind === 'stat');
        if (big.length > 0) setModalQueue((prev) => [...prev, ...big]);
        if (small.length > 0) {
          setToasts((prev) => [...prev, ...small]);
          small.forEach((t) =>
            setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 6000)
          );
        }
      }
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the panel on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && unseen > 0) {
      setUnseen(0);
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: true }),
      }).catch(() => {});
    }
  };

  const currentModal = modalQueue[0] || null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggleOpen}
        className={`relative p-2.5 rounded-xl transition ${
          open ? 'text-white bg-white/10' : 'text-neutral-400 hover:text-white hover:bg-white/5'
        }`}
        title="Recent updates"
        aria-label={`Notifications${unseen > 0 ? ` (${unseen} new)` : ''}`}
      >
        <BellIcon size={18} />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unseen > 99 ? '99+' : unseen}
          </span>
        )}
      </button>

      {/* Feed panel */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-[min(92vw,380px)] max-h-[70vh] overflow-y-auto rounded-2xl border backdrop-blur-xl z-[70] animate-rise"
          style={{ backgroundColor: 'rgba(14,14,20,0.97)', borderColor: 'var(--surface-border-strong)' }}
        >
          <div
            className="sticky top-0 px-4 py-3 border-b flex items-center justify-between backdrop-blur-xl"
            style={{ backgroundColor: 'rgba(14,14,20,0.97)', borderColor: 'var(--surface-border)' }}
          >
            <p className="font-display font-bold text-white text-sm">Recent updates</p>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-neutral-400 hover:text-white transition">
              <XIcon size={15} />
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--text-secondary)' }}>
              Nothing yet — go make something happen.
            </p>
          ) : (
            <div>
              {events.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    if (e.href) {
                      setOpen(false);
                      router.push(e.href);
                    }
                  }}
                  className={`w-full text-left px-4 py-3 border-b last:border-0 transition ${
                    e.href ? 'hover:bg-white/[0.04] cursor-pointer' : 'cursor-default'
                  }`}
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <span className="flex items-start gap-2.5">
                    <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: e.hex }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-neutral-200 leading-snug">{e.title}</span>
                      {e.body && (
                        <span className="block text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                          {e.body}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] shrink-0 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {timeAgo(e.at)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Celebration modal (one at a time) */}
      {currentModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <Confetti />
          <div
            className="relative w-full max-w-sm rounded-3xl border-2 p-8 text-center animate-rise"
            style={{
              borderColor: `${currentModal.hex}88`,
              background: `linear-gradient(160deg, ${currentModal.hex}26, rgba(14,14,20,0.98) 55%)`,
              boxShadow: `0 0 80px ${currentModal.hex}44`,
            }}
          >
            <p className="text-5xl mb-4">{currentModal.kind === 'achievement' ? '🎖️' : '🏆'}</p>
            <p
              className="font-display text-2xl font-bold uppercase tracking-wide mb-2"
              style={{ color: currentModal.hex }}
            >
              {currentModal.title}
            </p>
            <p className="text-[15px] text-neutral-200 leading-snug">{currentModal.subtitle}</p>
            <button
              onClick={() => setModalQueue((prev) => prev.slice(1))}
              className="btn-gradient w-full py-3 mt-6"
            >
              {modalQueue.length > 1 ? `Next (${modalQueue.length - 1} more)` : "Let's go"}
            </button>
          </div>
        </div>
      )}

      {/* Stat-change toasts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-24 md:bottom-6 right-4 z-[80] space-y-2 w-[min(88vw,320px)]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border px-3.5 py-2.5 backdrop-blur-xl animate-rise flex items-center gap-2.5"
              style={{
                backgroundColor: 'rgba(14,14,20,0.95)',
                borderColor: `${t.hex}66`,
              }}
            >
              <span style={{ color: t.hex }} className="text-lg shrink-0">
                {t.hex === '#ef4444' ? '⬇' : '⬆'}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-white truncate">
                  {t.title.replace(/^[^·]*· /, '')}
                </span>
                <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {t.subtitle}
                </span>
              </span>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="ml-auto text-neutral-500 hover:text-white transition shrink-0"
              >
                <XIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

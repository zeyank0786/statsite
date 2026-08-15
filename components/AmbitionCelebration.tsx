'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Avatar from './Avatar';

/**
 * The "overcome everyone's dashboard for a day" takeover. When someone
 * completes an ambition it stays celebrated crew-wide for 24h:
 *  - a loud pinned banner at the top of the dashboard for the whole window
 *  - a one-time full-screen confetti modal the first time each device sees it
 *    (remembered in localStorage so it doesn't replay on every load)
 * Data comes from /api/ambitions (`celebrations` = completed within 24h).
 */

interface Celebration {
  id: string;
  playerId: string;
  ownerName: string;
  title: string;
  completedAt: string | null;
}

const CONFETTI_COLORS = ['#f5c451', '#22d3ee', '#ec4899', '#a855f7', '#f97316', '#34d399'];

function Confetti() {
  const pieces = Array.from({ length: 80 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1,
    duration: 2.4 + Math.random() * 1.8,
    size: 6 + Math.random() * 7,
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

export default function AmbitionCelebration() {
  const router = useRouter();
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [modal, setModal] = useState<Celebration | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ambitions')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list: Celebration[] = data.celebrations || [];
        setCelebrations(list);
        const unseen = list.find((c) => {
          try {
            return !localStorage.getItem(`ambition-seen-${c.id}`);
          } catch {
            return false;
          }
        });
        if (unseen) setModal(unseen);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissModal = () => {
    if (modal) {
      try {
        localStorage.setItem(`ambition-seen-${modal.id}`, '1');
      } catch {
        /* private mode etc. — banner still carries it */
      }
    }
    setModal(null);
  };

  if (celebrations.length === 0) return null;

  return (
    <>
      {/* Pinned banner — stays up for the whole 24h window */}
      <div
        className="relative overflow-hidden rounded-2xl border-2 p-5 mb-6 animate-rise"
        style={{
          borderColor: 'rgba(245,196,81,0.5)',
          background: 'linear-gradient(120deg, rgba(245,196,81,0.18), rgba(168,85,247,0.12) 55%, rgba(34,211,238,0.12))',
          boxShadow: '0 0 50px rgba(245,196,81,0.18)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🎉</span>
          <p className="font-display font-bold uppercase tracking-wider text-sm" style={{ color: '#f5c451' }}>
            Ambition{celebrations.length > 1 ? 's' : ''} completed
          </p>
        </div>
        <div className="space-y-2">
          {celebrations.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push('/ambitions')}
              className="w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 transition hover:bg-white/[0.05]"
            >
              <Avatar id={c.playerId} name={c.ownerName} size={34} />
              <span className="min-w-0">
                <span className="block text-sm text-white leading-snug">
                  <span className="font-bold">{c.ownerName}</span> completed{' '}
                  <span className="font-semibold" style={{ color: '#f5c451' }}>
                    “{c.title}”
                  </span>
                </span>
                <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  The whole crew celebrates — go say something.
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* One-time full-screen takeover */}
      {modal &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm">
            <Confetti />
            <div
              className="relative w-full max-w-md rounded-3xl border-2 p-8 text-center animate-rise"
              style={{
                borderColor: 'rgba(245,196,81,0.6)',
                background: 'linear-gradient(160deg, rgba(245,196,81,0.22), var(--overlay) 60%)',
                boxShadow: '0 0 90px rgba(245,196,81,0.4)',
              }}
            >
              <p className="text-6xl mb-4">🎉</p>
              <p className="font-display text-xs font-bold uppercase tracking-[0.25em] mb-3" style={{ color: '#f5c451' }}>
                Ambition completed
              </p>
              <div className="flex items-center justify-center gap-2.5 mb-3">
                <Avatar id={modal.playerId} name={modal.ownerName} size={40} />
                <p className="font-display text-2xl font-bold text-white">{modal.ownerName}</p>
              </div>
              <p className="text-lg text-neutral-100 leading-snug mb-1">“{modal.title}”</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Years in the making, done. This one&apos;s worth a real reward.
              </p>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    dismissModal();
                    router.push('/ambitions');
                  }}
                  className="btn-gradient flex-1 py-3"
                >
                  See it
                </button>
                <button onClick={dismissModal} className="btn-ghost px-5 py-3">
                  Nice
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

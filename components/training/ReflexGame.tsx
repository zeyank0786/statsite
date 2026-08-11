'use client';

import { useEffect, useRef, useState } from 'react';
import { scoreReflex } from '@/lib/training';

/**
 * Reflex — hit ten targets as fast as they land.
 *
 * The delay before each target is random so it can't be anticipated, and
 * clicking before one appears adds a penalty rather than voiding the run —
 * a void would just teach people to spam and restart.
 */

const TARGETS = 10;
const MIN_DELAY_MS = 700;
const MAX_DELAY_MS = 2400;
/** Added to your average for each early click. */
const JUMP_PENALTY_MS = 120;

type Phase = 'idle' | 'waiting' | 'active' | 'done';

export default function ReflexGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [times, setTimes] = useState<number[]>([]);
  const [jumps, setJumps] = useState(0);
  const [position, setPosition] = useState({ top: 40, left: 40 });

  const appearedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const armNext = (done: number) => {
    if (done >= TARGETS) return;
    setPhase('waiting');
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    timer.current = setTimeout(() => {
      // Kept inside the arena's padding so the target is always fully visible.
      setPosition({ top: 10 + Math.random() * 70, left: 8 + Math.random() * 76 });
      appearedAt.current = performance.now();
      setPhase('active');
    }, delay);
  };

  const start = () => {
    setTimes([]);
    setJumps(0);
    armNext(0);
  };

  const hitTarget = () => {
    if (phase !== 'active') return;
    const elapsed = performance.now() - appearedAt.current;
    const next = [...times, elapsed];
    setTimes(next);

    if (next.length >= TARGETS) {
      setPhase('done');
      const average = next.reduce((sum, t) => sum + t, 0) / next.length + jumps * JUMP_PENALTY_MS;
      onFinish(scoreReflex(average));
    } else {
      armNext(next.length);
    }
  };

  const arenaClick = () => {
    // Only counts as jumping the gun while we're waiting for a target.
    if (phase === 'waiting') setJumps((j) => j + 1);
  };

  const average =
    times.length > 0 ? times.reduce((sum, t) => sum + t, 0) / times.length + jumps * JUMP_PENALTY_MS : 0;

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-3 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && `Hit ${TARGETS} targets as fast as they appear. Don't jump the gun.`}
        {phase === 'waiting' && 'Wait for it…'}
        {phase === 'active' && 'HIT IT'}
        {phase === 'done' && `${Math.round(average)}ms average${jumps > 0 ? ` (incl. ${jumps} early)` : ''}`}
      </p>

      <div
        onClick={arenaClick}
        className="relative w-full max-w-md h-64 rounded-2xl border overflow-hidden mb-4"
        style={{
          borderColor: 'var(--surface-border)',
          background: phase === 'waiting' ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)',
          cursor: phase === 'waiting' ? 'not-allowed' : 'default',
        }}
      >
        {phase === 'active' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              hitTarget();
            }}
            aria-label="Hit the target"
            className="absolute w-14 h-14 rounded-full transition-transform hover:scale-105"
            style={{
              top: `${position.top}%`,
              left: `${position.left}%`,
              background: 'radial-gradient(circle at 35% 30%, #6ee7b7, #10b981)',
              boxShadow: '0 0 30px rgba(52,211,153,0.7)',
            }}
          />
        )}
        {phase !== 'active' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-3xl font-bold" style={{ color: 'var(--text-secondary)' }}>
              {phase === 'waiting' ? '…' : phase === 'done' ? `${times.length}/${TARGETS}` : 'Ready'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {(phase === 'idle' || phase === 'done') && (
          <button onClick={start} className="btn-gradient px-6 py-2.5">
            {phase === 'done' ? 'Go again' : 'Start'}
          </button>
        )}
        {times.length > 0 && phase !== 'done' && (
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {times.length}/{TARGETS} · {Math.round(average)}ms avg
          </span>
        )}
        {jumps > 0 && (
          <span className="text-xs" style={{ color: 'var(--accent-red)' }}>
            {jumps} early (+{jumps * JUMP_PENALTY_MS}ms)
          </span>
        )}
      </div>
    </div>
  );
}

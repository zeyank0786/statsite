'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Rhythm — four beats set the tempo, then it goes silent and you keep it.
 *
 * Scored on average absolute drift from where each tap should have landed.
 * Drift is measured against the ideal grid (lead-in + n × interval), not
 * against your own previous tap: chaining tap-to-tap would let a run that
 * slides steadily off tempo score perfectly.
 *
 * The score IS that drift in milliseconds, so the lowest one wins.
 */

const LEAD_IN_BEATS = 4;
const TAP_BEATS = 8;
const INTERVAL_MS = 600; // 100bpm

export default function RhythmGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'tapping' | 'done'>('idle');
  const [pulse, setPulse] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const [drift, setDrift] = useState(0);

  // The instant the lead-in finished — every expected tap time derives from it.
  const tappingStartedAt = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  /** Short click. Created inside a click handler, so autoplay policy is happy. */
  const click = useCallback((strong: boolean) => {
    try {
      if (!audio.current) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        audio.current = new Ctor();
      }
      const ctx = audio.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = strong ? 880 : 660;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      /* audio is a nice-to-have — the visual pulse carries the beat */
    }
  }, []);

  const beat = useCallback(
    (strong: boolean) => {
      click(strong);
      setPulse(true);
      timers.current.push(setTimeout(() => setPulse(false), 110));
    },
    [click]
  );

  const start = () => {
    clearTimers();
    setTaps([]);
    setPhase('listening');

    for (let i = 0; i < LEAD_IN_BEATS; i++) {
      timers.current.push(setTimeout(() => beat(true), i * INTERVAL_MS));
    }
    timers.current.push(
      setTimeout(() => {
        tappingStartedAt.current = performance.now();
        setPhase('tapping');
      }, LEAD_IN_BEATS * INTERVAL_MS)
    );
  };

  const tap = () => {
    if (phase !== 'tapping') return;
    const at = performance.now() - tappingStartedAt.current;
    const next = [...taps, at];
    setTaps(next);
    setPulse(true);
    setTimeout(() => setPulse(false), 90);

    if (next.length >= TAP_BEATS) {
      // Tap n was due at (n+1) intervals after the lead-in ended.
      const total = next.reduce(
        (sum, actual, i) => sum + Math.abs(actual - (i + 1) * INTERVAL_MS),
        0
      );
      const average = total / next.length;
      setDrift(average);
      setPhase('done');
      // Milliseconds off the beat — the unit that means something here, so
      // the lowest score wins.
      onFinish(Math.round(average));
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center max-w-xs" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && `Four beats play, then it stops. Keep the same tempo for ${TAP_BEATS} taps.`}
        {phase === 'listening' && 'Listen…'}
        {phase === 'tapping' && `Keep it going — ${TAP_BEATS - taps.length} to go`}
        {phase === 'done' && `${Math.round(drift)}ms average drift`}
      </p>

      <button
        onClick={tap}
        disabled={phase !== 'tapping'}
        aria-label="Tap to the beat"
        className="w-44 h-44 rounded-full mb-5 transition-all duration-75 disabled:cursor-default flex items-center justify-center font-display text-lg font-bold"
        style={{
          background: pulse ? 'rgba(249,115,22,0.35)' : 'rgba(249,115,22,0.1)',
          border: `3px solid ${pulse ? '#f97316' : 'rgba(249,115,22,0.4)'}`,
          boxShadow: pulse ? '0 0 44px rgba(249,115,22,0.55)' : 'none',
          transform: pulse ? 'scale(0.96)' : 'scale(1)',
          color: phase === 'tapping' ? '#fff' : 'var(--text-secondary)',
        }}
      >
        {phase === 'tapping' ? 'TAP' : phase === 'listening' ? '♪' : ''}
      </button>

      {/* How each tap landed against the beat */}
      {taps.length > 0 && (
        <div className="flex gap-1 mb-4">
          {taps.map((actual, i) => {
            const off = Math.abs(actual - (i + 1) * INTERVAL_MS);
            return (
              <span
                key={i}
                className="w-2.5 h-2.5 rounded-full"
                title={`${Math.round(off)}ms off`}
                style={{ background: off < 60 ? '#34d399' : off < 140 ? '#eab308' : '#ef4444' }}
              />
            );
          })}
        </div>
      )}

      {(phase === 'idle' || phase === 'done') && (
        <button onClick={start} className="btn-gradient px-6 py-2.5">
          {phase === 'done' ? 'Go again' : 'Start'}
        </button>
      )}
    </div>
  );
}

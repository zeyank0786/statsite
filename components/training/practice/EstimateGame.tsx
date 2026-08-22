'use client';

import { useCallback, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult, useTimers } from './PracticeKit';
import { randInt, scale, scaleDown } from '@/lib/practiceKit';

/**
 * Estimation — dots flash, and you say roughly how many.
 *
 * The flash is short on purpose. Given a second and a half most people count in
 * groups and get it exactly right, which trains counting speed rather than
 * estimation. Kept under a beat, counting is simply not available and you have
 * to judge the quantity as a quantity — the thing that transfers to guessing
 * crowd sizes, portions, distances and everything else in that family.
 *
 * "Correct" is therefore a tolerance rather than an exact match, and the
 * tolerance tightens with level: 25% at the bottom, 6% at the top.
 */

export function estimateParams(level: number) {
  const low = scale(level, 8, 60);
  return {
    low,
    high: low + scale(level, 12, 90),
    flashMs: scaleDown(level, 900, 220, 0.8),
    /** Fraction of the true count you are allowed to be out by. */
    tolerance: scaleDown(level, 25, 6) / 100,
  };
}

export function estimateHint(level: number): string {
  const p = estimateParams(level);
  return `${p.low}–${p.high} dots · ${p.flashMs}ms · ±${Math.round(p.tolerance * 100)}%`;
}

interface Dot {
  x: number;
  y: number;
  r: number;
}

type Phase = 'idle' | 'flash' | 'guessing' | 'done';

export default function EstimateGame({ level, onRound }: PracticeGameProps) {
  const hex = '#a855f7';
  const { after, clear } = useTimers();

  const [phase, setPhase] = useState<Phase>('idle');
  const [dots, setDots] = useState<Dot[]>([]);
  const [guess, setGuess] = useState('');
  const [correct, setCorrect] = useState<boolean | null>(null);

  const params = estimateParams(level);
  const allowed = Math.max(1, Math.round(dots.length * params.tolerance));

  const start = useCallback(() => {
    clear();
    const p = estimateParams(level);
    const count = randInt(p.low, p.high);
    setDots(
      Array.from({ length: count }, () => ({
        // Kept off the very edge so nothing is half-clipped and uncountable
        // for the wrong reason.
        x: 4 + Math.random() * 92,
        y: 4 + Math.random() * 92,
        r: 3 + Math.random() * 2,
      }))
    );
    setGuess('');
    setCorrect(null);
    setPhase('flash');
    after(p.flashMs, () => setPhase('guessing'));
  }, [level, after, clear]);


  const submit = () => {
    const value = Number(guess);
    if (!Number.isFinite(value) || guess.trim() === '') return;
    const got = Math.abs(value - dots.length) <= allowed;
    setCorrect(got);
    setPhase('done');
    onRound?.(got);
  };

  const off = Number(guess) - dots.length;

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && `Dots flash for ${params.flashMs}ms. Do not try to count them.`}
        {phase === 'flash' && '…'}
        {phase === 'guessing' && 'How many were there?'}
        {phase === 'done' && `There were ${dots.length}.`}
      </p>

      <div
        className="relative rounded-2xl border mb-5 overflow-hidden"
        style={{
          borderColor: 'var(--surface-border)',
          background: 'rgba(255,255,255,0.03)',
          aspectRatio: '3 / 2',
        }}
      >
        {(phase === 'flash' || phase === 'done') &&
          dots.map((dot, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${dot.x}%`,
                top: `${dot.y}%`,
                width: dot.r * 2,
                height: dot.r * 2,
                marginLeft: -dot.r,
                marginTop: -dot.r,
                background: phase === 'done' ? `${hex}88` : hex,
              }}
            />
          ))}
        {phase === 'guessing' && (
          <span
            className="absolute inset-0 flex items-center justify-center text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            Gone.
          </span>
        )}
        {phase === 'idle' && (
          <span
            className="absolute inset-0 flex items-center justify-center text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            Ready
          </span>
        )}
      </div>

      {phase === 'guessing' && (
        <div className="flex gap-2 mb-4">
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="Your guess"
            className="flex-1 px-4 py-2.5 rounded-xl text-white text-center font-display text-xl tabular-nums outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)' }}
          />
          <button
            onClick={submit}
            disabled={guess.trim() === ''}
            className="px-5 rounded-xl font-semibold text-sm transition disabled:opacity-40 hover:brightness-110"
            style={{ background: `${hex}22`, color: hex, border: `1px solid ${hex}55` }}
          >
            Call it
          </button>
        </div>
      )}

      {correct !== null && (
        <div className="mb-3">
          <RoundResult
            correct={correct}
            hex={hex}
            detail={
              off === 0
                ? 'spot on'
                : `${Math.abs(off)} ${off > 0 ? 'over' : 'under'} · ±${allowed} allowed`
            }
          />
        </div>
      )}

      {(phase === 'idle' || phase === 'done') && (
        <NextButton onClick={start} hex={hex} label={phase === 'idle' ? 'Start' : 'Next flash'} />
      )}
    </div>
  );
}

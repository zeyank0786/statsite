'use client';

import { useCallback, useEffect, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult, useTimers } from './PracticeKit';
import { randInt, scale, scaleDown } from '@/lib/practiceKit';

/**
 * Digit Span — digits one at a time, typed back afterwards.
 *
 * Past halfway the drill flips to reverse span, and that is not simply "the
 * same but harder": forward span is mostly rehearsal, while reverse span makes
 * you hold the string still and walk it backwards, which is a different
 * operation and the reason clinicians test both. The flip is called out on
 * screen every round, because getting it the wrong way round is a maddening way
 * to lose one.
 */

export function digitParams(level: number) {
  return {
    length: scale(level, 3, 11),
    reverse: level >= 11,
    perDigitMs: scaleDown(level, 1100, 420, 0.9),
  };
}

export function digitHint(level: number): string {
  const p = digitParams(level);
  return `${p.length} digits · ${p.reverse ? 'reversed' : 'in order'}`;
}

type Phase = 'idle' | 'showing' | 'input' | 'done';

export default function DigitSpanGame({ level, onRound }: PracticeGameProps) {
  const hex = '#3b82f6';
  const { after, clear } = useTimers();

  const [phase, setPhase] = useState<Phase>('idle');
  const [digits, setDigits] = useState<number[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const [entry, setEntry] = useState('');
  const [correct, setCorrect] = useState<boolean | null>(null);

  const params = digitParams(level);
  const expected = params.reverse ? digits.slice().reverse().join('') : digits.join('');

  const start = useCallback(() => {
    clear();
    const { length, perDigitMs } = digitParams(level);
    // Never the same digit twice running — a repeat reads as the screen not
    // having changed, and the round is lost to the interface rather than memory.
    const next: number[] = [];
    while (next.length < length) {
      const d = randInt(0, 9);
      if (next[next.length - 1] !== d) next.push(d);
    }

    setDigits(next);
    setEntry('');
    setCorrect(null);
    setPhase('showing');

    next.forEach((d, i) => {
      after(i * perDigitMs, () => setShown(d));
      // A gap between digits, so two-in-a-row are visibly two.
      after(i * perDigitMs + perDigitMs * 0.72, () => setShown(null));
    });
    after(next.length * perDigitMs + 200, () => setPhase('input'));
  }, [level, after, clear]);


  const submit = useCallback(
    (value: string) => {
      const got = value === expected;
      setCorrect(got);
      setPhase('done');
      onRound?.(got);
    },
    [expected, onRound]
  );

  const press = useCallback(
    (key: string) => {
      if (phase !== 'input') return;
      if (key === 'back') {
        setEntry((e) => e.slice(0, -1));
        return;
      }
      setEntry((e) => {
        const next = e + key;
        if (next.length === digits.length) submit(next);
        return next.slice(0, digits.length);
      });
    },
    [phase, digits.length, submit]
  );

  // Physical keyboard as well as the on-screen pad — this is a typing drill for
  // anyone on a laptop and a tapping one on a phone.
  useEffect(() => {
    if (phase !== 'input') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        press('back');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, press]);

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' &&
          `${params.length} digits, then type them back${params.reverse ? ' in reverse' : ''}.`}
        {phase === 'showing' && 'Watch…'}
        {phase === 'input' && (
          <span className={params.reverse ? 'font-semibold text-white' : ''}>
            {params.reverse ? 'Type them BACKWARDS' : 'Type them in order'}
          </span>
        )}
        {phase === 'done' && (correct ? 'Exactly right.' : `It was ${expected}.`)}
      </p>

      {/* The digit stage */}
      <div
        className="rounded-2xl border h-32 flex items-center justify-center mb-5"
        style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.03)' }}
      >
        {phase === 'showing' ? (
          <span
            className="font-display text-7xl font-bold tabular-nums"
            style={{ color: hex, opacity: shown === null ? 0 : 1, transition: 'opacity 60ms' }}
          >
            {shown ?? 0}
          </span>
        ) : phase === 'idle' ? (
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Ready
          </span>
        ) : (
          <span className="font-display text-4xl font-bold tabular-nums tracking-[0.2em] text-white">
            {entry.padEnd(digits.length, '·')}
          </span>
        )}
      </div>

      {phase === 'input' && (
        <div className="grid grid-cols-3 gap-2 mb-4 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0'].map((key) => (
            <button
              key={key}
              onClick={() => press(key)}
              className="py-3 rounded-xl font-semibold text-lg transition hover:bg-white/10"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--surface-border)',
                color: key === 'back' ? 'var(--text-secondary)' : '#fff',
              }}
            >
              {key === 'back' ? '⌫' : key}
            </button>
          ))}
        </div>
      )}

      {correct !== null && (
        <div className="mb-3">
          <RoundResult correct={correct} hex={hex} detail={correct ? undefined : `You said ${entry}`} />
        </div>
      )}

      {(phase === 'idle' || phase === 'done') && (
        <NextButton onClick={start} hex={hex} label={phase === 'idle' ? 'Start' : 'Next span'} />
      )}
    </div>
  );
}

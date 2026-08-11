'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { scoreStroop } from '@/lib/training';

/**
 * Stroop — the word RED printed in blue ink; the answer is blue.
 *
 * The drill only works if the word and the ink disagree most of the time, so
 * matching trials are deliberately rare: an easy trial is a rest, not a test.
 */

const INKS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#34d399' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Purple', hex: '#a855f7' },
] as const;

const DURATION_MS = 45000;
const OPTION_COUNT = 4;
/** How often the word and ink agree. Low on purpose — agreement is the easy case. */
const CONGRUENT_RATE = 0.2;

interface Trial {
  word: string;
  ink: (typeof INKS)[number];
  options: (typeof INKS)[number][];
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function buildTrial(): Trial {
  const ink = pick(INKS);
  const word =
    Math.random() < CONGRUENT_RATE
      ? ink.name
      : pick(INKS.filter((c) => c.name !== ink.name)).name;

  // The right answer plus distractors, shuffled.
  const others = INKS.filter((c) => c.name !== ink.name);
  const shuffled = [...others].sort(() => Math.random() - 0.5).slice(0, OPTION_COUNT - 1);
  const options = [ink, ...shuffled].sort(() => Math.random() - 0.5);
  return { word, ink, options };
}

export default function StroopGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [remaining, setRemaining] = useState(DURATION_MS);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);

  const shownAt = useRef(0);
  const totalMs = useRef(0);

  const nextTrial = useCallback(() => {
    setTrial(buildTrial());
    shownAt.current = performance.now();
  }, []);

  const start = () => {
    setCorrect(0);
    setWrong(0);
    setRemaining(DURATION_MS);
    setDone(false);
    setFlash(null);
    totalMs.current = 0;
    setRunning(true);
    nextTrial();
  };

  useEffect(() => {
    if (!running) return;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const left = DURATION_MS - (performance.now() - startedAt);
      if (left <= 0) {
        clearInterval(timer);
        setRemaining(0);
        setRunning(false);
        setDone(true);
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [running]);

  // Score once the run is over and the tallies have settled.
  useEffect(() => {
    if (!done) return;
    const answered = correct + wrong;
    onFinish(scoreStroop(correct, wrong, answered > 0 ? totalMs.current / answered : 0));
    // onFinish is excluded deliberately — it changes identity on every parent
    // render and would re-post the same result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const answer = (choice: (typeof INKS)[number]) => {
    if (!running || !trial) return;
    totalMs.current += performance.now() - shownAt.current;
    if (choice.name === trial.ink.name) {
      setCorrect((c) => c + 1);
      setFlash('hit');
    } else {
      setWrong((w) => w + 1);
      setFlash('miss');
    }
    setTimeout(() => setFlash(null), 180);
    nextTrial();
  };

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {running
          ? 'Tap the colour of the INK, not the word.'
          : done
          ? `${correct} right · ${wrong} wrong`
          : `${DURATION_MS / 1000} seconds. Name the ink colour, ignore what it says.`}
      </p>

      {running && (
        <div className="w-full max-w-xs h-1.5 rounded-full mb-6" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${(remaining / DURATION_MS) * 100}%`, background: '#ec4899' }}
          />
        </div>
      )}

      <div
        className="h-28 flex items-center justify-center mb-6 px-6 rounded-2xl transition-colors"
        style={{
          background:
            flash === 'hit'
              ? 'rgba(52,211,153,0.12)'
              : flash === 'miss'
              ? 'rgba(239,68,68,0.12)'
              : 'transparent',
        }}
      >
        <span
          className="font-display text-5xl sm:text-6xl font-bold uppercase tracking-wide"
          style={{ color: running && trial ? trial.ink.hex : 'var(--text-secondary)' }}
        >
          {running && trial ? trial.word : done ? 'Time' : 'Ready'}
        </span>
      </div>

      {running && trial ? (
        <div className="grid grid-cols-2 gap-2.5 w-full max-w-xs">
          {trial.options.map((option) => (
            <button
              key={option.name}
              onClick={() => answer(option)}
              className="py-3 rounded-xl font-bold text-sm transition hover:brightness-125"
              style={{
                // Neutral buttons on purpose: colouring them would give the
                // answer away without reading anything.
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--surface-border)',
                color: '#fff',
              }}
            >
              {option.name}
            </button>
          ))}
        </div>
      ) : (
        <button onClick={start} className="btn-gradient px-6 py-2.5">
          {done ? 'Go again' : 'Start'}
        </button>
      )}
    </div>
  );
}

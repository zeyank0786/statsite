'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Mental Maths — as many correct sums as you can in a minute.
 *
 * The answer submits itself the moment it's right, so there's no enter key in
 * the loop: at this speed a keystroke per answer is a meaningful slice of the
 * score, and it would be measuring the wrong thing.
 */

const DURATION_MS = 60000;

interface Problem {
  text: string;
  answer: number;
}

/** Difficulty climbs with the number already solved. */
function buildProblem(solved: number): Problem {
  const tier = Math.min(4, Math.floor(solved / 5));
  const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

  const operations: (() => Problem)[] = [
    () => {
      const a = rand(2 + tier * 8, 12 + tier * 22);
      const b = rand(2 + tier * 8, 12 + tier * 22);
      return { text: `${a} + ${b}`, answer: a + b };
    },
    () => {
      const a = rand(10 + tier * 15, 30 + tier * 40);
      const b = rand(2, Math.max(3, a - 1));
      return { text: `${a} − ${b}`, answer: a - b };
    },
    () => {
      const a = rand(2, 4 + tier * 3);
      const b = rand(2, 6 + tier * 4);
      return { text: `${a} × ${b}`, answer: a * b };
    },
    () => {
      // Built from the product so it always divides cleanly.
      const b = rand(2, 4 + tier * 2);
      const answer = rand(2, 6 + tier * 3);
      return { text: `${b * answer} ÷ ${b}`, answer };
    },
  ];

  // Multiplication and division only enter once the easy tiers are past.
  const available = tier === 0 ? operations.slice(0, 2) : operations;
  return available[Math.floor(Math.random() * available.length)]();
}

export default function ArithmeticGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [entry, setEntry] = useState('');
  const [solved, setSolved] = useState(0);
  const [remaining, setRemaining] = useState(DURATION_MS);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setSolved(0);
    setEntry('');
    setRemaining(DURATION_MS);
    setDone(false);
    setProblem(buildProblem(0));
    setRunning(true);
    // Focus after the input exists, so the keyboard opens on mobile.
    setTimeout(() => inputRef.current?.focus(), 30);
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

  useEffect(() => {
    if (!done) return;
    onFinish(solved);
    // onFinish deliberately excluded — see the other games.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const check = useCallback(
    (value: string) => {
      setEntry(value);
      if (!problem || !running) return;
      // Only act on an exact match: a partial entry on the way to the answer
      // ("4" heading for "45") must not count as wrong.
      if (value.trim() !== '' && Number(value) === problem.answer) {
        const next = solved + 1;
        setSolved(next);
        setEntry('');
        setProblem(buildProblem(next));
        setFlash(true);
        setTimeout(() => setFlash(false), 140);
      }
    },
    [problem, running, solved]
  );

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {running
          ? 'It submits as soon as the answer is right.'
          : done
          ? `${solved} correct`
          : `${DURATION_MS / 1000} seconds. Type the answer — no need to press enter.`}
      </p>

      {running && (
        <div className="w-full max-w-xs h-1.5 rounded-full mb-6" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{ width: `${(remaining / DURATION_MS) * 100}%`, background: '#a855f7' }}
          />
        </div>
      )}

      <div
        className="h-24 flex items-center justify-center mb-4 px-6 rounded-2xl transition-colors w-full max-w-xs"
        style={{ background: flash ? 'rgba(52,211,153,0.14)' : 'transparent' }}
      >
        <span className="font-display text-4xl sm:text-5xl font-bold text-white tabular-nums">
          {running && problem ? problem.text : done ? `${solved}` : '?'}
        </span>
      </div>

      {running ? (
        <>
          <input
            ref={inputRef}
            value={entry}
            onChange={(e) => check(e.target.value)}
            inputMode="numeric"
            // `numeric` rather than `number`: a number input's spinners and
            // locale quirks get in the way at speed.
            pattern="[0-9-]*"
            autoComplete="off"
            className="field text-center font-display text-2xl w-40 tabular-nums"
            placeholder="…"
          />
          <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
            {solved} correct
          </p>
        </>
      ) : (
        <button onClick={start} className="btn-gradient px-6 py-2.5">
          {done ? 'Go again' : 'Start'}
        </button>
      )}
    </div>
  );
}

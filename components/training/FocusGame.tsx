'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Focus — a 2-back attention drill.
 *
 * Letters arrive one at a time; call a match when the current one is the same
 * as the one two before it. Both misses and false alarms count as mistakes, so
 * hammering the button is worse than not playing.
 *
 * The stream never ends on its own — it runs until you've made three mistakes,
 * and the score is how many letters you survived. That keeps the number open
 * ended and means a long clean run is worth more than a short one, which a
 * fixed-length accuracy percentage could never express.
 */

const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'.split('');
const N_BACK = 2;
const TRIAL_MS = 2200;
const MAX_MISTAKES = 3;
/** Roughly a third of trials are real matches — enough to stay honest. */
const MATCH_RATE = 0.3;

/** The next letter: sometimes a planted match, otherwise deliberately not one. */
function nextLetter(stream: string[]): string {
  const i = stream.length;
  if (i >= N_BACK && Math.random() < MATCH_RATE) return stream[i - N_BACK];

  let letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  // Don't accidentally create a match we didn't intend to plant.
  if (i >= N_BACK) {
    while (letter === stream[i - N_BACK]) {
      letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
  }
  return letter;
}

export default function FocusGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [stream, setStream] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [hits, setHits] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<'hit' | 'miss' | null>(null);
  const [done, setDone] = useState(false);
  const [survived, setSurvived] = useState(0);

  // Read inside the interval, where React state would be stale.
  const answered = useRef(false);
  const streamRef = useRef<string[]>([]);
  const mistakesRef = useRef(0);

  /** Whether trial `i` of `letters` repeats the letter N_BACK earlier. */
  const isMatch = useCallback(
    (letters: string[], i: number) => i >= N_BACK && letters[i] === letters[i - N_BACK],
    []
  );

  const endRun = useCallback(
    (lettersSeen: number) => {
      setRunning(false);
      setDone(true);
      setSurvived(lettersSeen);
      onFinish(lettersSeen);
    },
    [onFinish]
  );

  const start = () => {
    const first = [nextLetter([])];
    streamRef.current = first;
    setStream(first);
    setHits(0);
    setMistakes(0);
    mistakesRef.current = 0;
    setFeedback(null);
    setDone(false);
    setSurvived(0);
    answered.current = false;
    setRunning(true);
  };

  const addMistake = useCallback(() => {
    mistakesRef.current += 1;
    setMistakes(mistakesRef.current);
    setFeedback('miss');
    return mistakesRef.current;
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      // Grade the trial that just elapsed before moving on.
      const letters = streamRef.current;
      const current = letters.length - 1;
      if (isMatch(letters, current) && !answered.current) {
        if (addMistake() >= MAX_MISTAKES) {
          clearInterval(timer);
          endRun(letters.length);
          return;
        }
      }

      const grown = [...letters, nextLetter(letters)];
      streamRef.current = grown;
      setStream(grown);
      answered.current = false;
      setTimeout(() => setFeedback(null), 320);
    }, TRIAL_MS);
    return () => clearInterval(timer);
  }, [running, isMatch, addMistake, endRun]);

  const call = () => {
    if (!running || answered.current) return;
    answered.current = true;
    const letters = streamRef.current;
    if (isMatch(letters, letters.length - 1)) {
      setHits((h) => h + 1);
      setFeedback('hit');
    } else if (addMistake() >= MAX_MISTAKES) {
      endRun(letters.length);
      return;
    }
    setTimeout(() => setFeedback(null), 320);
  };

  const shown = running ? stream[stream.length - 1] : done ? '✓' : '–';

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        {running
          ? `Call it when the letter matches the one ${N_BACK} back.`
          : done
          ? `${survived} letters survived · ${hits} caught`
          : `A letter every ${(TRIAL_MS / 1000).toFixed(1)}s. Hit MATCH when it repeats from ${N_BACK} back. ${MAX_MISTAKES} mistakes and you're out.`}
      </p>

      <div
        className="w-40 h-40 rounded-3xl flex items-center justify-center mb-5 transition-colors duration-200 border-2"
        style={{
          borderColor:
            feedback === 'hit' ? 'var(--accent-green)' : feedback === 'miss' ? 'var(--accent-red)' : 'var(--surface-border)',
          background:
            feedback === 'hit'
              ? 'rgba(52,211,153,0.12)'
              : feedback === 'miss'
              ? 'rgba(239,68,68,0.12)'
              : 'rgba(255,255,255,0.02)',
        }}
      >
        <span className="font-display text-6xl font-bold text-white">{shown}</span>
      </div>

      {running ? (
        <>
          <button onClick={call} className="btn-gradient px-10 py-3 text-lg">
            MATCH
          </button>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {stream.length} letters
            </span>
            <span className="flex items-center gap-1">
              {Array.from({ length: MAX_MISTAKES }, (_, i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{ background: i < mistakes ? '#ef4444' : 'rgba(255,255,255,0.18)' }}
                />
              ))}
            </span>
          </div>
        </>
      ) : (
        <button onClick={start} className="btn-gradient px-6 py-2.5">
          {done ? 'Go again' : 'Start'}
        </button>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { scoreFocus } from '@/lib/training';

/**
 * Focus — a 2-back attention drill.
 *
 * Letters arrive one at a time; call a match when the current letter is the
 * same as the one two before it. Both misses and false alarms cost you, so
 * hammering the button is worse than not playing.
 */

const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'.split('');
const N_BACK = 2;
const TRIAL_COUNT = 26;
const TRIAL_MS = 2200;
/** Roughly a third of trials are real matches — enough to stay honest. */
const MATCH_RATE = 0.3;

/** Pre-generate the stream so the match count is known and fair every run. */
function buildStream(): string[] {
  const stream: string[] = [];
  for (let i = 0; i < TRIAL_COUNT; i++) {
    if (i >= N_BACK && Math.random() < MATCH_RATE) {
      stream.push(stream[i - N_BACK]);
    } else {
      let letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      // Don't accidentally create a match we didn't intend to plant.
      if (i >= N_BACK) {
        while (letter === stream[i - N_BACK]) {
          letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
        }
      }
      stream.push(letter);
    }
  }
  return stream;
}

export default function FocusGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [stream, setStream] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);
  const [feedback, setFeedback] = useState<'hit' | 'miss' | null>(null);
  const [done, setDone] = useState(false);

  // Whether the current trial has been answered, read inside the interval —
  // state would be stale there.
  const answered = useRef(false);
  const streamRef = useRef<string[]>([]);
  const indexRef = useRef(-1);

  /**
   * Whether trial `i` of `letters` repeats the letter N_BACK earlier.
   *
   * Takes the array rather than closing over it: the interval has to read the
   * ref (state is stale in there), while render reads the state directly —
   * reading the ref during render is exactly the kind of thing that quietly
   * stops matching what's on screen.
   */
  const isMatch = useCallback(
    (letters: string[], i: number) => i >= N_BACK && letters[i] === letters[i - N_BACK],
    []
  );
  const countTargets = useCallback(
    (letters: string[]) => letters.filter((_, i) => isMatch(letters, i)).length,
    [isMatch]
  );

  const start = () => {
    const next = buildStream();
    setStream(next);
    streamRef.current = next;
    setHits(0);
    setMisses(0);
    setFalseAlarms(0);
    setFeedback(null);
    setDone(false);
    setIndex(0);
    indexRef.current = 0;
    answered.current = false;
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      // Grade the trial that just elapsed before moving on.
      const current = indexRef.current;
      if (isMatch(streamRef.current, current) && !answered.current) {
        setMisses((m) => m + 1);
        setFeedback('miss');
      }

      const next = current + 1;
      if (next >= streamRef.current.length) {
        clearInterval(timer);
        setRunning(false);
        setDone(true);
        return;
      }
      indexRef.current = next;
      setIndex(next);
      answered.current = false;
      setTimeout(() => setFeedback(null), 320);
    }, TRIAL_MS);
    return () => clearInterval(timer);
  }, [running, isMatch]);

  // Score once, when the run ends and the tallies have settled.
  useEffect(() => {
    if (!done) return;
    onFinish(scoreFocus(hits, misses, falseAlarms, countTargets(stream)));
    // onFinish is intentionally excluded: it's recreated on every parent render
    // and re-running this would post the same result repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const call = () => {
    if (!running || answered.current) return;
    answered.current = true;
    if (isMatch(streamRef.current, indexRef.current)) {
      setHits((h) => h + 1);
      setFeedback('hit');
    } else {
      setFalseAlarms((f) => f + 1);
      setFeedback('miss');
    }
    setTimeout(() => setFeedback(null), 320);
  };

  const targets = countTargets(stream);

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        {running
          ? `Call it when the letter matches the one ${N_BACK} back.`
          : done
          ? `${hits} caught · ${misses} missed · ${falseAlarms} false calls (${targets} matches in the run)`
          : `A letter every ${(TRIAL_MS / 1000).toFixed(1)}s. Hit MATCH when it repeats from ${N_BACK} back.`}
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
        <span className="font-display text-6xl font-bold text-white">
          {running && index >= 0 ? stream[index] : done ? '✓' : '–'}
        </span>
      </div>

      {running ? (
        <>
          <button onClick={call} className="btn-gradient px-10 py-3 text-lg">
            MATCH
          </button>
          <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
            {index + 1} / {stream.length}
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

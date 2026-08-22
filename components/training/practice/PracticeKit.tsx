'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_LEVEL, MIN_LEVEL, clampLevel } from '@/lib/practiceKit';

/**
 * The bits every practice drill shares: the difficulty slider, the per-round
 * feedback line, and the session tally.
 *
 * The tally is worth being careful about. Nothing on the practice range is
 * saved, and that is the whole point — but a drill with no feedback at all is
 * unpleasant to play, because you cannot tell whether the level you picked is
 * too easy. So there is a count, it is held in React state, and it dies with
 * the modal. It is labelled as such on screen so nobody mistakes it for a
 * record they are building.
 */

export interface PracticeGameProps {
  /** 1–20, straight from the slider. Games re-read this every round. */
  level: number;
  /** Report a round's outcome so the shell can show the session tally. */
  onRound?: (correct: boolean) => void;
}

const LEVEL_STORAGE_PREFIX = '4ward:practice-level:';

/**
 * Remember the level this player last used for this drill.
 *
 * A preference, not a score: it never leaves the browser, and losing it costs
 * one drag of a slider. Everything is wrapped because storage throws outright
 * in some private-browsing modes rather than just returning null.
 */
export function useLevel(gameId: string): [number, (level: number) => void] {
  // Read once, on mount. Safe as a lazy initialiser rather than an effect
  // because a drill only ever mounts in response to a click — it is never
  // server-rendered, so there is no first render to disagree with.
  const [level, setLevelState] = useState(() => {
    if (typeof window === 'undefined') return 5;
    try {
      const stored = window.localStorage.getItem(`${LEVEL_STORAGE_PREFIX}${gameId}`);
      return stored === null ? 5 : clampLevel(Number(stored));
    } catch {
      return 5; // storage unavailable — the default is fine
    }
  });

  const setLevel = useCallback(
    (next: number) => {
      const value = clampLevel(next);
      setLevelState(value);
      try {
        window.localStorage.setItem(`${LEVEL_STORAGE_PREFIX}${gameId}`, String(value));
      } catch {
        /* nothing to do — it just won't be remembered next time */
      }
    },
    [gameId]
  );

  return [level, setLevel];
}

export function DifficultySlider({
  level,
  onChange,
  hex,
  hint,
}: {
  level: number;
  onChange: (level: number) => void;
  hex: string;
  /** What this level means in this drill's own terms — "5 cells on a 4×4 grid". */
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl border px-4 py-3 mb-5"
      style={{ borderColor: 'var(--surface-border)' }}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <label
          htmlFor="practice-level"
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}
        >
          Difficulty
        </label>
        <span className="font-display text-base font-bold tabular-nums" style={{ color: hex }}>
          {level}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          / {MAX_LEVEL}
        </span>
        {hint && (
          <span className="ml-auto text-[11px] text-right" style={{ color: 'var(--text-secondary)' }}>
            {hint}
          </span>
        )}
      </div>
      <input
        id="practice-level"
        type="range"
        min={MIN_LEVEL}
        max={MAX_LEVEL}
        step={1}
        value={level}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: hex }}
        aria-valuetext={hint ? `Level ${level}: ${hint}` : `Level ${level}`}
      />
      <div
        className="flex justify-between text-[10px] mt-0.5"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span>Gentle</span>
        <span>Brutal</span>
      </div>
    </div>
  );
}

/** The one-line verdict after a round. */
export function RoundResult({
  correct,
  detail,
  hex,
}: {
  correct: boolean | null;
  detail?: React.ReactNode;
  hex: string;
}) {
  if (correct === null) return null;
  return (
    <div
      className="rounded-xl border px-4 py-3 text-sm text-center animate-rise"
      style={{
        borderColor: correct ? `${hex}66` : 'rgba(248,113,113,0.45)',
        background: correct ? `${hex}14` : 'rgba(248,113,113,0.08)',
      }}
    >
      <span className="font-semibold" style={{ color: correct ? hex : '#f87171' }}>
        {correct ? 'Correct' : 'Not quite'}
      </span>
      {detail && (
        <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>
          {detail}
        </span>
      )}
    </div>
  );
}

/**
 * Session-only tally, shown under a drill.
 *
 * Resets whenever the drill is closed or the difficulty changes — a run of
 * eight at level 3 says nothing about level 14, so carrying the count across a
 * difficulty change would be actively misleading.
 */
export function useSessionTally(level: number) {
  const [tally, setTally] = useState({ correct: 0, total: 0 });
  const lastLevel = useRef(level);

  useEffect(() => {
    if (lastLevel.current !== level) {
      lastLevel.current = level;
      setTally({ correct: 0, total: 0 });
    }
  }, [level]);

  const record = useCallback((correct: boolean) => {
    setTally((t) => ({ correct: t.correct + (correct ? 1 : 0), total: t.total + 1 }));
  }, []);

  return { tally, record };
}

export function SessionTally({ correct, total }: { correct: number; total: number }) {
  if (total === 0) return null;
  return (
    <p className="text-[11px] text-center mt-4" style={{ color: 'var(--text-secondary)' }}>
      {correct} of {total} this session
      <span className="opacity-60"> · nothing here is saved</span>
    </p>
  );
}

/**
 * Timers that clean themselves up.
 *
 * Every one of these drills schedules something — show for 900ms, then hide —
 * and closing the modal mid-round would otherwise fire setState on an unmounted
 * component. Each drill used to hand-roll this; now it does not.
 */
export function useTimers() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => clear, [clear]);

  return { after, clear };
}

/** The "go again" button every drill ends a round with. */
export function NextButton({
  onClick,
  hex,
  label = 'Next round',
}: {
  onClick: () => void;
  hex: string;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full py-2.5 rounded-xl font-semibold text-sm transition hover:brightness-110"
      style={{ background: `${hex}22`, color: hex, border: `1px solid ${hex}55` }}
    >
      {label}
    </button>
  );
}

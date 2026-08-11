'use client';

import { useState } from 'react';

/**
 * Deduce — break a hidden four-colour code from exact/partial feedback.
 *
 * Colours can repeat, which is what stops it collapsing into simple
 * process-of-elimination and makes the partial-match count actually matter.
 *
 * Cracking one deals another, so the score is how many you broke in a row —
 * an open-ended number that keeps meaning something however good you get,
 * rather than a rating that tops out.
 */

/** Exported so the tutorial can show the exact colours the game uses. */
export const COLORS = ['#22d3ee', '#a855f7', '#34d399', '#f97316', '#ec4899', '#eab308'];
const CODE_LENGTH = 4;
const MAX_GUESSES = 8;

interface Guess {
  code: number[];
  exact: number;
  partial: number;
}

function randomCode(): number[] {
  return Array.from({ length: CODE_LENGTH }, () => Math.floor(Math.random() * COLORS.length));
}

/**
 * Standard mastermind scoring: exact matches are counted and removed first,
 * then partials are matched against what's left. Counting partials without
 * removing exacts first double-counts and makes the feedback a lie.
 */
export function judge(guess: number[], code: number[]): { exact: number; partial: number } {
  let exact = 0;
  const guessLeft: number[] = [];
  const codeLeft: number[] = [];

  for (let i = 0; i < code.length; i++) {
    if (guess[i] === code[i]) exact++;
    else {
      guessLeft.push(guess[i]);
      codeLeft.push(code[i]);
    }
  }

  let partial = 0;
  for (const colour of guessLeft) {
    const at = codeLeft.indexOf(colour);
    if (at !== -1) {
      partial++;
      codeLeft.splice(at, 1);
    }
  }
  return { exact, partial };
}

export default function DeduceGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [code, setCode] = useState<number[]>(randomCode);
  const [draft, setDraft] = useState<number[]>([0, 0, 0, 0]);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [state, setState] = useState<'playing' | 'cracked' | 'lost'>('playing');
  /** Codes broken this run — the score. */
  const [cracked, setCracked] = useState(0);

  const submit = () => {
    if (state !== 'playing') return;
    const { exact, partial } = judge(draft, code);
    const next = [...guesses, { code: [...draft], exact, partial }];
    setGuesses(next);

    if (exact === CODE_LENGTH) {
      setCracked((c) => c + 1);
      setState('cracked');
    } else if (next.length >= MAX_GUESSES) {
      // The run ends here; the score is everything broken before this one.
      setState('lost');
      onFinish(cracked);
    }
  };

  /** Deal the next code in the same run. */
  const nextCode = () => {
    setCode(randomCode());
    setDraft([0, 0, 0, 0]);
    setGuesses([]);
    setState('playing');
  };

  /** Start a fresh run from zero. */
  const restart = () => {
    setCracked(0);
    nextCode();
  };

  const cycle = (slot: number) => {
    if (state !== 'playing') return;
    setDraft((prev) => prev.map((c, i) => (i === slot ? (c + 1) % COLORS.length : c)));
  };

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        {state === 'playing' && (
          <>
            {cracked > 0 && (
              <span className="text-white font-semibold">
                {cracked} cracked ·{' '}
              </span>
            )}
            Tap a slot to cycle its colour. <strong className="text-white">●</strong> = right colour,
            right place. <span style={{ color: 'var(--text-secondary)' }}>○</span> = right colour,
            wrong place. Colours can repeat.
          </>
        )}
        {state === 'cracked' && `Cracked in ${guesses.length} — that's ${cracked}. Keep going.`}
        {state === 'lost' &&
          (cracked === 0
            ? 'Out of guesses.'
            : `Out of guesses — ${cracked} code${cracked === 1 ? '' : 's'} cracked.`)}
      </p>

      {/* Guess history */}
      <div className="w-full max-w-sm space-y-1.5 mb-4">
        {guesses.map((g, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border"
            style={{ borderColor: 'var(--surface-border)' }}
          >
            <span className="text-[10px] w-4 shrink-0" style={{ color: 'var(--text-secondary)' }}>
              {i + 1}
            </span>
            <div className="flex gap-1.5">
              {g.code.map((c, j) => (
                <span key={j} className="w-6 h-6 rounded-lg" style={{ background: COLORS[c] }} />
              ))}
            </div>
            <span className="ml-auto text-sm tracking-widest">
              <span className="text-white">{'●'.repeat(g.exact)}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{'○'.repeat(g.partial)}</span>
              {g.exact + g.partial === 0 && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  nothing
                </span>
              )}
            </span>
          </div>
        ))}
        {guesses.length === 0 && (
          <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
            {MAX_GUESSES} guesses. Make the first one count.
          </p>
        )}
      </div>

      {/* The code being built, or revealed */}
      {state === 'playing' ? (
        <>
          <div className="flex gap-2.5 mb-4">
            {draft.map((c, i) => (
              <button
                key={i}
                onClick={() => cycle(i)}
                aria-label={`Slot ${i + 1}`}
                className="w-14 h-14 rounded-2xl transition hover:scale-105"
                style={{ background: COLORS[c], boxShadow: `0 4px 18px ${COLORS[c]}55` }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {MAX_GUESSES - guesses.length} left
            </span>
            <button onClick={submit} className="btn-gradient px-6 py-2.5">
              Guess
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
            The code was
          </p>
          <div className="flex gap-2.5 mb-4">
            {code.map((c, i) => (
              <span key={i} className="w-14 h-14 rounded-2xl" style={{ background: COLORS[c] }} />
            ))}
          </div>
          {state === 'cracked' ? (
            <button onClick={nextCode} className="btn-gradient px-6 py-2.5">
              Next code →
            </button>
          ) : (
            <button onClick={restart} className="btn-gradient px-6 py-2.5">
              Go again
            </button>
          )}
        </>
      )}
    </div>
  );
}

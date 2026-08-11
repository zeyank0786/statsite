'use client';

import { useCallback, useState } from 'react';

/**
 * Sequence — work out the rule, pick what comes next.
 *
 * Puzzles are generated rather than listed so nobody can learn the answers by
 * repetition, and the rule pool widens as you get deeper: early rounds are
 * arithmetic and doubling, later ones bring in squares, Fibonacci and
 * alternating steps.
 */

const OPTION_COUNT = 4;

interface Puzzle {
  terms: number[];
  answer: number;
  options: number[];
}

type Rule = (i: number) => number;

/** Rule pool by difficulty tier — index is the earliest round it can appear. */
function rulesForRound(round: number): (() => { rule: Rule; length: number })[] {
  const easy = [
    () => {
      const start = 1 + Math.floor(Math.random() * 9);
      const step = 2 + Math.floor(Math.random() * 8);
      return { rule: (i: number) => start + step * i, length: 5 };
    },
    () => {
      const start = 1 + Math.floor(Math.random() * 4);
      const factor = 2 + Math.floor(Math.random() * 2);
      return { rule: (i: number) => start * factor ** i, length: 5 };
    },
  ];

  const medium = [
    () => {
      // Squares, optionally offset: 1,4,9,16 or 2,5,10,17
      const offset = Math.floor(Math.random() * 3);
      return { rule: (i: number) => (i + 1) ** 2 + offset, length: 5 };
    },
    () => {
      // Step grows by one each time: 1,2,4,7,11
      const start = 1 + Math.floor(Math.random() * 5);
      return { rule: (i: number) => start + (i * (i + 1)) / 2, length: 5 };
    },
    () => {
      // Two interleaved runs: 1,10,3,20,5,30
      const a = 1 + Math.floor(Math.random() * 4);
      const b = 10 * (1 + Math.floor(Math.random() * 2));
      const stepA = 2;
      return {
        rule: (i: number) => (i % 2 === 0 ? a + (i / 2) * stepA : b * ((i + 1) / 2)),
        length: 6,
      };
    },
  ];

  const hard = [
    () => {
      // Fibonacci-ish from a random pair
      const a = 1 + Math.floor(Math.random() * 3);
      const b = a + 1 + Math.floor(Math.random() * 3);
      const memo = [a, b];
      return {
        rule: (i: number) => {
          while (memo.length <= i) memo.push(memo[memo.length - 1] + memo[memo.length - 2]);
          return memo[i];
        },
        length: 6,
      };
    },
    () => {
      // Double then add: 3,7,15,31
      const start = 1 + Math.floor(Math.random() * 4);
      const add = 1 + Math.floor(Math.random() * 3);
      const memo = [start];
      return {
        rule: (i: number) => {
          while (memo.length <= i) memo.push(memo[memo.length - 1] * 2 + add);
          return memo[i];
        },
        length: 5,
      };
    },
    () => {
      // Primes
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
      const from = Math.floor(Math.random() * 3);
      return { rule: (i: number) => primes[from + i], length: 5 };
    },
  ];

  if (round < 3) return easy;
  if (round < 7) return [...easy, ...medium];
  return [...easy, ...medium, ...hard];
}

function buildPuzzle(round: number): Puzzle {
  const pool = rulesForRound(round);
  const { rule, length } = pool[Math.floor(Math.random() * pool.length)]();

  const terms: number[] = [];
  for (let i = 0; i < length; i++) terms.push(rule(i));
  const answer = rule(length);

  // Plausible wrong answers: near misses, not random numbers, or the puzzle
  // solves itself by elimination.
  const gap = Math.max(1, Math.abs(answer - terms[terms.length - 1]));
  const candidates = new Set<number>([answer]);
  const nudges = [gap, -gap, 1, -1, 2, -2, Math.round(gap / 2), gap * 2];
  for (const nudge of nudges) {
    if (candidates.size >= OPTION_COUNT) break;
    const value = answer + nudge;
    if (value !== answer && value > 0 && !terms.includes(value)) candidates.add(value);
  }
  // Backstop in case the nudges collided into too few distinct values.
  let extra = 1;
  while (candidates.size < OPTION_COUNT) {
    candidates.add(answer + gap + extra);
    extra++;
  }

  return {
    terms,
    answer,
    options: [...candidates].sort(() => Math.random() - 0.5),
  };
}

export default function SequenceGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [round, setRound] = useState(0);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [wrongPick, setWrongPick] = useState<number | null>(null);

  const start = useCallback(() => {
    setRound(0);
    setWrongPick(null);
    setPuzzle(buildPuzzle(0));
    setPhase('playing');
  }, []);

  const choose = (value: number) => {
    if (phase !== 'playing' || !puzzle) return;
    if (value !== puzzle.answer) {
      setWrongPick(value);
      setPhase('over');
      // The round you reached IS the score. Round 46 has to be worth more than
      // round 20, and no formula in between can be allowed to flatten that.
      onFinish(round);
      return;
    }
    const nextRound = round + 1;
    setRound(nextRound);
    setPuzzle(buildPuzzle(nextRound));
  };

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && 'Work out the rule, pick what comes next. One wrong answer ends it.'}
        {phase === 'playing' && `Round ${round + 1}`}
        {phase === 'over' &&
          (round === 0
            ? `The answer was ${puzzle?.answer}.`
            : `${round} round${round === 1 ? '' : 's'} cleared — the answer was ${puzzle?.answer}.`)}
      </p>

      {puzzle && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            {puzzle.terms.map((term, i) => (
              <span
                key={i}
                className="min-w-[52px] px-2 h-12 rounded-xl flex items-center justify-center font-display text-lg font-bold text-white tabular-nums"
                style={{ background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.5)' }}
              >
                {term}
              </span>
            ))}
            <span className="text-lg" style={{ color: 'var(--text-secondary)' }}>
              →
            </span>
            <span
              className="min-w-[52px] px-2 h-12 rounded-xl flex items-center justify-center font-display text-lg font-bold"
              style={{ border: '1px dashed rgba(255,255,255,0.3)', color: 'var(--text-secondary)' }}
            >
              ?
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 w-full max-w-xs">
            {puzzle.options.map((option) => {
              const isAnswer = phase === 'over' && option === puzzle.answer;
              const isWrong = phase === 'over' && option === wrongPick;
              return (
                <button
                  key={option}
                  onClick={() => choose(option)}
                  disabled={phase !== 'playing'}
                  className="py-3 rounded-xl font-display font-bold tabular-nums transition disabled:cursor-default"
                  style={{
                    background: isAnswer
                      ? 'rgba(52,211,153,0.2)'
                      : isWrong
                      ? 'rgba(239,68,68,0.2)'
                      : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${
                      isAnswer ? '#34d399' : isWrong ? '#ef4444' : 'var(--surface-border)'
                    }`,
                    color: '#fff',
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </>
      )}

      {(phase === 'idle' || phase === 'over') && (
        <button onClick={start} className="btn-gradient px-6 py-2.5 mt-5">
          {phase === 'over' ? 'Go again' : 'Start'}
        </button>
      )}
    </div>
  );
}

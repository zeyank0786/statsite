'use client';

import { useCallback, useMemo, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult } from './PracticeKit';
import { scale, shuffle } from '@/lib/practiceKit';

/**
 * Logic Grid — work out the finishing order from a handful of constraints.
 *
 * Every puzzle is generated and then *verified* rather than trusted. Clues are
 * drawn at random from ones that happen to be true of a secret order, added one
 * at a time, and the whole thing is brute-forced after each addition until
 * exactly one order survives. Redundant clues are then stripped back out. That
 * matters because a randomly assembled puzzle is almost always either
 * ambiguous — several orders fit, so a correct answer gets marked wrong — or
 * massively over-specified, which is not deduction, it is transcription.
 *
 * Six racers is 720 orders, so checking every one is instant and the guarantee
 * is exact rather than probabilistic.
 */

const NAMES = ['Ada', 'Bo', 'Cal', 'Dee', 'Eli', 'Fay'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export function logicParams(level: number) {
  return {
    racers: scale(level, 3, 6),
    /** Low levels get outright "X finished 2nd" gifts; higher ones never do. */
    allowGiveaways: level <= 7,
    /** Vaguer clue types unlock as it gets harder. */
    allowGaps: level >= 5,
  };
}

export function logicHint(level: number): string {
  const p = logicParams(level);
  return `${p.racers} racers · ${p.allowGiveaways ? 'with a giveaway' : 'no giveaways'}`;
}

type Positions = Record<string, number>;
interface Clue {
  text: string;
  test: (pos: Positions) => boolean;
}

/** Every ordering of `names`. n ≤ 6, so 720 at worst. */
export function permutations(names: string[]): string[][] {
  if (names.length <= 1) return [names];
  const out: string[][] = [];
  names.forEach((name, i) => {
    const rest = [...names.slice(0, i), ...names.slice(i + 1)];
    permutations(rest).forEach((p) => out.push([name, ...p]));
  });
  return out;
}

export const toPositions = (order: string[]): Positions =>
  Object.fromEntries(order.map((n, i) => [n, i]));

function candidateClues(order: string[], level: number): Clue[] {
  const pos = toPositions(order);
  const { allowGiveaways, allowGaps } = logicParams(level);
  const clues: Clue[] = [];

  for (const a of order) {
    if (allowGiveaways) {
      clues.push({
        text: `${a} finished ${ORDINALS[pos[a]]}.`,
        test: (p) => p[a] === pos[a],
      });
    }
    // A negative clue is only interesting if it rules out somewhere they
    // plausibly could have been.
    for (let slot = 0; slot < order.length; slot++) {
      if (slot === pos[a]) continue;
      clues.push({
        text: `${a} did not finish ${ORDINALS[slot]}.`,
        test: (p) => p[a] !== slot,
      });
    }
  }

  for (const a of order) {
    for (const b of order) {
      if (a === b) continue;
      if (pos[a] < pos[b]) {
        clues.push({
          text: `${a} finished ahead of ${b}.`,
          test: (p) => p[a] < p[b],
        });
      }
      if (pos[b] - pos[a] === 1) {
        clues.push({
          text: `${a} finished immediately ahead of ${b}.`,
          test: (p) => p[b] - p[a] === 1,
        });
      }
      if (allowGaps && pos[b] - pos[a] > 1) {
        const gap = pos[b] - pos[a] - 1;
        clues.push({
          text: `Exactly ${gap} racer${gap === 1 ? '' : 's'} finished between ${a} and ${b}, in that order.`,
          test: (p) => p[b] - p[a] - 1 === gap,
        });
      }
    }
  }

  return clues;
}

interface Puzzle {
  names: string[];
  order: string[];
  clues: Clue[];
}

export function buildPuzzle(level: number): Puzzle {
  const { racers } = logicParams(level);
  const names = NAMES.slice(0, racers);
  const order = shuffle(names);
  const all = permutations(names);

  const pool = shuffle(candidateClues(order, level));
  const chosen: Clue[] = [];
  let surviving = all;

  for (const clue of pool) {
    const next = surviving.filter((p) => clue.test(toPositions(p)));
    if (next.length === surviving.length) continue; // tells you nothing new
    chosen.push(clue);
    surviving = next;
    if (surviving.length === 1) break;
  }

  // Strip anything the rest of the set already implies.
  //
  // This has to drop clues ONE AT A TIME, re-testing against what is left each
  // time. Judging every clue against the full set independently and removing
  // all the redundant ones together is the obvious version and it is wrong: two
  // clues can each be redundant given the other, and taking both out leaves a
  // puzzle with two valid answers. That produced genuinely ambiguous rounds.
  let minimal = chosen;
  for (const clue of chosen) {
    const without = minimal.filter((c) => c !== clue);
    if (!without.length) continue;
    const stillUnique =
      all.filter((p) => without.every((c) => c.test(toPositions(p)))).length === 1;
    if (stillUnique) minimal = without;
  }

  return { names, order, clues: shuffle(minimal) };
}

export default function LogicGridGame({ level, onRound }: PracticeGameProps) {
  const hex = '#f97316';

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [guess, setGuess] = useState<Positions>({});
  const [correct, setCorrect] = useState<boolean | null>(null);

  const start = useCallback(() => {
    setPuzzle(buildPuzzle(level));
    setGuess({});
    setCorrect(null);
  }, [level]);


  const assign = (name: string, slot: number) => {
    if (correct !== null) return;
    setGuess((g) => {
      const next: Positions = { ...g };
      // A slot holds one racer: taking it evicts whoever was there.
      for (const [other, value] of Object.entries(next)) {
        if (value === slot && other !== name) delete next[other];
      }
      if (next[name] === slot) delete next[name];
      else next[name] = slot;
      return next;
    });
  };

  const complete = useMemo(
    () => puzzle !== null && Object.keys(guess).length === puzzle.names.length,
    [guess, puzzle]
  );

  const check = () => {
    if (!puzzle || !complete) return;
    const got = puzzle.order.every((name, i) => guess[name] === i);
    setCorrect(got);
    onRound?.(got);
  };

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {!puzzle
          ? 'A race, and clues about who came where. Exactly one order fits.'
          : correct === null
          ? 'Place every racer.'
          : correct
          ? 'That is the only order the clues allow.'
          : `The order was ${puzzle.order.join(', ')}.`}
      </p>

      {puzzle && (
        <>
          <ul
            className="rounded-2xl border p-4 mb-5 space-y-2 text-sm"
            style={{ borderColor: `${hex}44`, background: `${hex}0d` }}
          >
            {puzzle.clues.map((clue, i) => (
              <li key={i} className="flex gap-2.5 text-neutral-200">
                <span className="font-bold shrink-0" style={{ color: hex }}>
                  {i + 1}
                </span>
                {clue.text}
              </li>
            ))}
          </ul>

          <div className="space-y-2 mb-5">
            {puzzle.names.map((name) => (
              <div key={name} className="flex items-center gap-2">
                <span className="w-12 text-sm font-semibold text-white shrink-0">{name}</span>
                <div className="flex gap-1.5 flex-1">
                  {puzzle.names.map((_, slot) => {
                    const chosen = guess[name] === slot;
                    const reveal = correct !== null;
                    const isRight = puzzle.order[slot] === name;
                    let border = 'rgba(255,255,255,0.12)';
                    if (reveal && isRight) border = hex;
                    else if (reveal && chosen) border = '#f87171';
                    else if (chosen) border = hex;
                    return (
                      <button
                        key={slot}
                        onClick={() => assign(name, slot)}
                        disabled={reveal}
                        aria-label={`${name} finished ${ORDINALS[slot]}`}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition disabled:cursor-default"
                        style={{
                          border: `1.5px solid ${border}`,
                          background: chosen ? `${hex}22` : 'rgba(255,255,255,0.04)',
                          color: chosen || (reveal && isRight) ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        {ORDINALS[slot]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {correct === null && (
            <button
              onClick={check}
              disabled={!complete}
              className="w-full py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-40 disabled:cursor-default hover:brightness-110 mb-3"
              style={{ background: `${hex}22`, color: hex, border: `1px solid ${hex}55` }}
            >
              Check the order
            </button>
          )}
        </>
      )}

      {correct !== null && (
        <div className="mb-3">
          <RoundResult correct={correct} hex={hex} />
        </div>
      )}

      {(!puzzle || correct !== null) && (
        <NextButton onClick={start} hex={hex} label={puzzle ? 'New puzzle' : 'Start'} />
      )}
    </div>
  );
}

'use client';

import { useCallback, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult } from './PracticeKit';
import { pick, randInt, scale, shuffle } from '@/lib/practiceKit';

/**
 * Pattern Matrix — nine squares, one missing, work out the rule.
 *
 * Each visual property (shape, colour, how many, filled or hollow) is driven by
 * `(a·row + b·column + k) mod n`. That one formula covers every rule this kind
 * of puzzle uses: `a=0` means the property is fixed down a column, `b=0` fixed
 * along a row, and `a=b=1` gives the diagonal progression that makes these feel
 * clever. Because the rule is generated rather than authored, the answer is
 * always genuinely derivable — there is no round where the intended logic is
 * only obvious to whoever wrote it.
 *
 * Distractors are the correct tile with a single property nudged, so a
 * half-solved rule narrows the options without handing over the answer.
 */

const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
const COLOURS = ['#ec4899', '#22d3ee', '#eab308', '#34d399'] as const;

interface CellSpec {
  shape: number;
  colour: number;
  count: number;
  filled: number;
}

type Attribute = keyof CellSpec;
const SIZES: Record<Attribute, number> = { shape: 4, colour: 4, count: 3, filled: 2 };

export function matrixParams(level: number) {
  return {
    /** How many properties are governed by a rule rather than held constant. */
    varying: scale(level, 1, 4, 1.1),
    options: scale(level, 4, 8),
  };
}

export function matrixHint(level: number): string {
  const p = matrixParams(level);
  return `${p.varying} rule${p.varying === 1 ? '' : 's'} · ${p.options} options`;
}

interface Rule {
  a: number;
  b: number;
  k: number;
  n: number;
}

const applyRule = (rule: Rule, row: number, col: number): number =>
  (rule.a * row + rule.b * col + rule.k) % rule.n;

interface Puzzle {
  grid: CellSpec[][];
  answer: CellSpec;
  options: CellSpec[];
}

export const sameCell = (a: CellSpec, b: CellSpec) =>
  a.shape === b.shape && a.colour === b.colour && a.count === b.count && a.filled === b.filled;

export function buildPuzzle(level: number): Puzzle {
  const { varying, options: optionCount } = matrixParams(level);
  const attributes: Attribute[] = ['shape', 'colour', 'count', 'filled'];
  const active = shuffle(attributes).slice(0, varying);

  const rules = {} as Record<Attribute, Rule>;
  for (const attr of attributes) {
    const n = SIZES[attr];
    if (active.includes(attr)) {
      // (0,0) would hold the property constant, which is not a rule.
      const [a, b] = pick([
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 1],
      ]);
      rules[attr] = { a, b, k: randInt(0, n - 1), n };
    } else {
      rules[attr] = { a: 0, b: 0, k: randInt(0, n - 1), n };
    }
  }

  const cellAt = (row: number, col: number): CellSpec => ({
    shape: applyRule(rules.shape, row, col),
    colour: applyRule(rules.colour, row, col),
    count: applyRule(rules.count, row, col) + 1,
    filled: applyRule(rules.filled, row, col),
  });

  const grid = [0, 1, 2].map((row) => [0, 1, 2].map((col) => cellAt(row, col)));
  const answer = grid[2][2];

  // Distractors: the answer with one property nudged.
  const distractors: CellSpec[] = [];
  for (let attempt = 0; attempt < 200 && distractors.length < optionCount - 1; attempt++) {
    const attr = pick(attributes);
    const candidate = { ...answer };
    if (attr === 'count') {
      candidate.count = randInt(1, SIZES.count);
    } else {
      candidate[attr] = randInt(0, SIZES[attr] - 1);
    }
    if (sameCell(candidate, answer)) continue;
    if (distractors.some((d) => sameCell(d, candidate))) continue;
    distractors.push(candidate);
  }

  return { grid, answer, options: shuffle([answer, ...distractors]) };
}

function Glyph({ spec, size }: { spec: CellSpec; size: number }) {
  const colour = COLOURS[spec.colour % COLOURS.length];
  const shape = SHAPES[spec.shape % SHAPES.length];
  const solid = spec.filled === 1;
  const fill = solid ? colour : 'none';
  const stroke = colour;

  const common = { fill, stroke, strokeWidth: 6 };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {shape === 'circle' && <circle cx={50} cy={50} r={38} {...common} />}
      {shape === 'square' && <rect x={14} y={14} width={72} height={72} rx={8} {...common} />}
      {shape === 'triangle' && <polygon points="50,10 90,86 10,86" {...common} />}
      {shape === 'diamond' && <polygon points="50,8 92,50 50,92 8,50" {...common} />}
    </svg>
  );
}

function Cell({ spec, size, muted }: { spec: CellSpec | null; size: number; muted?: boolean }) {
  return (
    <div
      className="rounded-xl border flex items-center justify-center gap-0.5 flex-wrap p-1"
      style={{
        width: size,
        height: size,
        borderColor: spec ? 'var(--surface-border)' : 'rgba(236,72,153,0.5)',
        background: spec ? 'rgba(255,255,255,0.03)' : 'rgba(236,72,153,0.08)',
        opacity: muted ? 0.5 : 1,
      }}
    >
      {spec ? (
        Array.from({ length: spec.count }, (_, i) => (
          <Glyph key={i} spec={spec} size={spec.count > 1 ? size * 0.36 : size * 0.6} />
        ))
      ) : (
        <span className="font-display text-2xl font-bold" style={{ color: '#ec4899' }}>
          ?
        </span>
      )}
    </div>
  );
}

export default function MatrixGame({ level, onRound }: PracticeGameProps) {
  const hex = '#ec4899';

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);

  const start = useCallback(() => {
    setPuzzle(buildPuzzle(level));
    setChosen(null);
    setCorrect(null);
  }, [level]);


  const answer = (index: number) => {
    if (!puzzle || chosen !== null) return;
    const got = sameCell(puzzle.options[index], puzzle.answer);
    setChosen(index);
    setCorrect(got);
    onRound?.(got);
  };

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {!puzzle
          ? 'A grid with one square missing. Find the rule, then the tile.'
          : correct === null
          ? 'Which tile completes the grid?'
          : correct
          ? 'That is the one.'
          : 'The highlighted tile was the answer.'}
      </p>

      {puzzle && (
        <>
          <div className="grid grid-cols-3 gap-2 w-fit mx-auto mb-6">
            {puzzle.grid.map((row, r) =>
              row.map((spec, c) => (
                <Cell
                  key={`${r}-${c}`}
                  spec={r === 2 && c === 2 && correct === null ? null : spec}
                  size={68}
                />
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {puzzle.options.map((spec, i) => {
              const isAnswer = sameCell(spec, puzzle.answer);
              const reveal = chosen !== null;
              const border = reveal
                ? isAnswer
                  ? hex
                  : chosen === i
                  ? '#f87171'
                  : 'var(--surface-border)'
                : 'var(--surface-border)';
              return (
                <button
                  key={i}
                  onClick={() => answer(i)}
                  disabled={reveal}
                  aria-label={`Option ${i + 1}`}
                  className="rounded-xl transition hover:brightness-125 disabled:cursor-default"
                  style={{
                    border: `2px solid ${border}`,
                    opacity: reveal && !isAnswer && chosen !== i ? 0.35 : 1,
                  }}
                >
                  <Cell spec={spec} size={58} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {correct !== null && (
        <div className="mb-3">
          <RoundResult correct={correct} hex={hex} />
        </div>
      )}

      {(!puzzle || correct !== null) && (
        <NextButton onClick={start} hex={hex} label={puzzle ? 'Next grid' : 'Start'} />
      )}
    </div>
  );
}

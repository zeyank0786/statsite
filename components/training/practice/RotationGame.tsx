'use client';

import { useCallback, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult } from './PracticeKit';
import { randInt, scale } from '@/lib/practiceKit';

/**
 * Mental Rotation — is the right-hand figure the same one turned, or its mirror?
 *
 * Two details do all the work here. First, only *chiral* shapes are ever used:
 * a shape that happens to be symmetric is identical to its own mirror image, so
 * the question would have no answer, and generating one and asking anyway is
 * the classic way to make this drill quietly unfair. Second, the rotation is an
 * arbitrary angle at higher levels rather than a multiple of 90°, because an
 * upright shape can be compared edge-to-edge without rotating anything mentally
 * — which is the one thing this is supposed to train.
 */

type Cell = [number, number];

export function rotationParams(level: number) {
  return {
    cells: scale(level, 4, 9),
    /** Below this the figure is turned in clean quarter-turns. */
    awkwardAngles: level >= 8,
  };
}

export function rotationHint(level: number): string {
  const p = rotationParams(level);
  return `${p.cells} blocks · ${p.awkwardAngles ? 'any angle' : 'quarter turns'}`;
}

const normalize = (cells: Cell[]): string => {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]) => `${x - minX},${y - minY}`)
    .sort()
    .join(' ');
};

const rotate = (cells: Cell[]): Cell[] => cells.map(([x, y]) => [-y, x] as Cell);
const mirror = (cells: Cell[]): Cell[] => cells.map(([x, y]) => [-x, y] as Cell);

/** True when the shape genuinely differs from its own reflection. */
export function isChiral(cells: Cell[]): boolean {
  const reflected = normalize(mirror(cells));
  let turned = cells;
  for (let i = 0; i < 4; i++) {
    if (normalize(turned) === reflected) return false;
    turned = rotate(turned);
  }
  return true;
}

/** A connected blob of `count` cells, grown by random walk. */
export function growShape(count: number): Cell[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells: Cell[] = [[0, 0]];
    const taken = new Set(['0,0']);
    let guard = 0;
    while (cells.length < count && guard++ < 400) {
      const [px, py] = cells[randInt(0, cells.length - 1)];
      const [dx, dy] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ][randInt(0, 3)];
      const next: Cell = [px + dx, py + dy];
      const key = `${next[0]},${next[1]}`;
      if (taken.has(key)) continue;
      taken.add(key);
      cells.push(next);
    }
    if (cells.length === count && isChiral(cells)) return cells;
  }
  // Fallback: an L-tetromino is chiral, so a round can always be built.
  return [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ];
}

interface Round {
  shape: Cell[];
  mirrored: boolean;
  angle: number;
}

function buildRound(level: number): Round {
  const { cells, awkwardAngles } = rotationParams(level);
  const angle = awkwardAngles ? randInt(20, 340) : randInt(1, 3) * 90;
  return { shape: growShape(cells), mirrored: Math.random() < 0.5, angle };
}

function Figure({ cells, angle, hex }: { cells: Cell[]; angle: number; hex: string }) {
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX + 1;
  const height = Math.max(...ys) - minY + 1;
  // A square viewBox with room to spin in, so an odd angle can't clip a corner.
  const span = Math.max(width, height) * Math.SQRT2 + 1;
  const cx = span / 2;

  return (
    <svg viewBox={`0 0 ${span} ${span}`} className="w-full h-full" aria-hidden="true">
      <g transform={`rotate(${angle} ${cx} ${cx})`}>
        {cells.map(([x, y], i) => (
          <rect
            key={i}
            x={x - minX + (span - width) / 2}
            y={y - minY + (span - height) / 2}
            width={0.94}
            height={0.94}
            rx={0.16}
            fill={`${hex}44`}
            stroke={hex}
            strokeWidth={0.07}
          />
        ))}
      </g>
    </svg>
  );
}

export default function RotationGame({ level, onRound }: PracticeGameProps) {
  const hex = '#22d3ee';

  const [round, setRound] = useState<Round | null>(null);
  const [answered, setAnswered] = useState<'same' | 'mirrored' | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);

  const start = useCallback(() => {
    setRound(buildRound(level));
    setAnswered(null);
    setCorrect(null);
  }, [level]);


  const answer = (choice: 'same' | 'mirrored') => {
    if (!round || answered) return;
    const got = (choice === 'mirrored') === round.mirrored;
    setAnswered(choice);
    setCorrect(got);
    onRound?.(got);
  };

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {!round
          ? 'Two figures. Decide whether the second is the first turned, or flipped.'
          : answered
          ? round.mirrored
            ? 'It was a mirror image — no amount of turning gets you there.'
            : 'Same shape, just rotated.'
          : 'Same shape turned, or a mirror image?'}
      </p>

      {round && (
        <div className="flex items-center justify-center gap-3 mb-5">
          <div
            className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl border p-2"
            style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.03)' }}
          >
            <Figure cells={round.shape} angle={0} hex={hex} />
          </div>
          <span className="text-2xl" style={{ color: 'var(--text-secondary)' }}>
            ⟷
          </span>
          <div
            className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl border p-2"
            style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.03)' }}
          >
            <Figure
              cells={round.mirrored ? mirror(round.shape) : round.shape}
              angle={round.angle}
              hex={hex}
            />
          </div>
        </div>
      )}

      {round && (
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {(['same', 'mirrored'] as const).map((choice) => {
            const isAnswer = (choice === 'mirrored') === round.mirrored;
            const reveal = answered !== null;
            const border = reveal
              ? isAnswer
                ? hex
                : answered === choice
                ? '#f87171'
                : 'rgba(255,255,255,0.12)'
              : 'rgba(255,255,255,0.14)';
            return (
              <button
                key={choice}
                onClick={() => answer(choice)}
                disabled={reveal}
                className="py-3 rounded-xl font-semibold text-sm transition hover:bg-white/5 disabled:cursor-default"
                style={{
                  border: `1.5px solid ${border}`,
                  background: reveal && isAnswer ? `${hex}1a` : 'rgba(255,255,255,0.04)',
                  color: '#fff',
                }}
              >
                {choice === 'same' ? 'Same, rotated' : 'Mirror image'}
              </button>
            );
          })}
        </div>
      )}

      {correct !== null && (
        <div className="mb-3">
          <RoundResult correct={correct} hex={hex} />
        </div>
      )}

      {(!round || answered) && (
        <NextButton onClick={start} hex={hex} label={round ? 'Next pair' : 'Start'} />
      )}
    </div>
  );
}

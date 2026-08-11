'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Chimp Test — numbers appear scattered, then blank out the moment you tap the
 * first one. Tap the rest in order from memory.
 *
 * Score is the largest set cleared, so it reads the way people talk about it
 * ("I got to 9") rather than as an abstract points total.
 */

const START_COUNT = 4;
const COLS = 6;
const ROWS = 5;
/** You cannot place more numbers than there are cells. Also the score ceiling. */
const MAX_COUNT = COLS * ROWS;

interface Cell {
  n: number;
  col: number;
  row: number;
}

/** Place 1..count on distinct cells of the grid. */
function layout(count: number): Cell[] {
  const slots: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) slots.push(i);
  // Fisher-Yates, then take the first `count` — guarantees no two numbers
  // land on the same cell, which random-until-free does not.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots.slice(0, count).map((slot, i) => ({
    n: i + 1,
    col: slot % COLS,
    row: Math.floor(slot / COLS),
  }));
}

export default function ChimpGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [count, setCount] = useState(START_COUNT);
  const [cells, setCells] = useState<Cell[]>([]);
  const [next, setNext] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [best, setBest] = useState(0);

  const deal = useCallback((n: number) => {
    setCells(layout(n));
    setNext(1);
    setHidden(false);
    setPhase('playing');
  }, []);

  const start = () => {
    setBest(0);
    setCount(START_COUNT);
    deal(START_COUNT);
  };

  // Advance a round on a short delay so the last tap is visible before the
  // board is re-dealt.
  useEffect(() => {
    if (phase !== 'playing' || cells.length === 0 || next <= cells.length) return;
    const cleared = count;
    setBest(cleared);
    const timer = setTimeout(() => {
      // Clearing the full grid is the end of the road — dealing more numbers
      // than cells would silently drop some and score above the ceiling.
      if (cleared >= MAX_COUNT) {
        setPhase('over');
        onFinish(cleared);
        return;
      }
      setCount(cleared + 1);
      deal(cleared + 1);
    }, 420);
    return () => clearTimeout(timer);
  }, [next, cells.length, phase, count, deal, onFinish]);

  const tap = (n: number) => {
    if (phase !== 'playing') return;
    if (n !== next) {
      // The score is the last set you completed in full.
      setPhase('over');
      onFinish(best);
      return;
    }
    if (n === 1) setHidden(true); // the whole point: they vanish on the first tap
    setNext(n + 1);
  };

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-3 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && `Tap the numbers in order. They hide as soon as you start.`}
        {phase === 'playing' && (hidden ? `Tap ${next}` : `${count} numbers — start with 1`)}
        {phase === 'over' && `Best set: ${best}`}
      </p>

      <div
        className="relative w-full max-w-md mb-5"
        style={{ aspectRatio: `${COLS} / ${ROWS}` }}
      >
        {cells.map((cell) => {
          const done = cell.n < next;
          if (done) return null; // tapped numbers leave the board
          const blank = hidden && cell.n >= next;
          return (
            <button
              key={cell.n}
              onClick={() => tap(cell.n)}
              disabled={phase !== 'playing'}
              className="absolute rounded-xl flex items-center justify-center font-display font-bold text-white transition-colors"
              style={{
                left: `${(cell.col / COLS) * 100}%`,
                top: `${(cell.row / ROWS) * 100}%`,
                width: `${(1 / COLS) * 100 - 1.5}%`,
                height: `${(1 / ROWS) * 100 - 3}%`,
                fontSize: 'clamp(14px, 4vw, 22px)',
                background: blank ? 'rgba(255,255,255,0.09)' : 'rgba(234,179,8,0.22)',
                border: blank ? '1px solid rgba(255,255,255,0.12)' : '1px solid #eab308',
              }}
            >
              {blank ? '' : cell.n}
            </button>
          );
        })}
      </div>

      {(phase === 'idle' || phase === 'over') && (
        <button onClick={start} className="btn-gradient px-6 py-2.5">
          {phase === 'over' ? 'Go again' : 'Start'}
        </button>
      )}
    </div>
  );
}

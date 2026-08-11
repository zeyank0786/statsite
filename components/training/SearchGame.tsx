'use client';

import { useCallback, useState } from 'react';

/**
 * Odd One Out — find the tile that's a slightly different shade.
 *
 * Both dials turn at once as you progress: the grid gets bigger and the shade
 * difference gets smaller. Difference shrinks toward a floor rather than to
 * zero, so late rounds stay hard but never become literally impossible.
 */

const START_SIZE = 2;
const MAX_SIZE = 8;
const START_DELTA = 34;
const MIN_DELTA = 4;

interface Board {
  size: number;
  oddIndex: number;
  base: string;
  odd: string;
}

function buildBoard(round: number): Board {
  const size = Math.min(MAX_SIZE, START_SIZE + Math.floor(round / 2));
  // Shrink the difference geometrically, floored so it stays perceivable.
  const delta = Math.max(MIN_DELTA, Math.round(START_DELTA * 0.85 ** round));

  const hue = Math.floor(Math.random() * 360);
  const saturation = 65;
  const lightness = 45 + Math.floor(Math.random() * 12);

  return {
    size,
    oddIndex: Math.floor(Math.random() * size * size),
    base: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    odd: `hsl(${hue}, ${saturation}%, ${lightness + delta / 3}%)`,
  };
}

export default function SearchGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [round, setRound] = useState(0);
  const [board, setBoard] = useState<Board | null>(null);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [missed, setMissed] = useState<number | null>(null);

  const start = useCallback(() => {
    setRound(0);
    setMissed(null);
    setBoard(buildBoard(0));
    setPhase('playing');
  }, []);

  const tap = (index: number) => {
    if (phase !== 'playing' || !board) return;
    if (index !== board.oddIndex) {
      setMissed(index);
      setPhase('over');
      onFinish(round);
      return;
    }
    const next = round + 1;
    setRound(next);
    setBoard(buildBoard(next));
  };

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && 'One tile is a slightly different shade. Tap it. A wrong tap ends the run.'}
        {phase === 'playing' && `Round ${round + 1}`}
        {phase === 'over' && `${round} round${round === 1 ? '' : 's'} cleared`}
      </p>

      {board && (
        <div
          className="grid gap-1.5 w-full max-w-[320px] mb-5"
          style={{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }}
        >
          {Array.from({ length: board.size * board.size }, (_, i) => {
            const isOdd = i === board.oddIndex;
            const reveal = phase === 'over';
            return (
              <button
                key={i}
                onClick={() => tap(i)}
                disabled={phase !== 'playing'}
                aria-label={`Tile ${i + 1}`}
                className="rounded-lg transition-transform disabled:cursor-default"
                style={{
                  aspectRatio: '1 / 1',
                  background: isOdd ? board.odd : board.base,
                  // Only ever outlined after the run ends — an outline during
                  // play would give the answer away.
                  outline: reveal && isOdd ? '3px solid #34d399' : reveal && i === missed ? '3px solid #ef4444' : 'none',
                  outlineOffset: -3,
                }}
              />
            );
          })}
        </div>
      )}

      {(phase === 'idle' || phase === 'over') && (
        <button onClick={start} className="btn-gradient px-6 py-2.5">
          {phase === 'over' ? 'Go again' : 'Start'}
        </button>
      )}
    </div>
  );
}

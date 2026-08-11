'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Recall — a growing sequence of tiles you play back from memory.
 *
 * Score is the longest sequence completed, so it reads the way people already
 * talk about this kind of drill ("I got to 11") rather than as an abstract
 * points total.
 */

const TILES = [
  { hex: '#22d3ee' },
  { hex: '#a855f7' },
  { hex: '#34d399' },
  { hex: '#f97316' },
  { hex: '#ec4899' },
  { hex: '#eab308' },
  { hex: '#3b82f6' },
  { hex: '#ef4444' },
  { hex: '#14b8a6' },
];

const FLASH_MS = 460;
const GAP_MS = 180;

type Phase = 'idle' | 'showing' | 'input' | 'over';

export default function RecallGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [sequence, setSequence] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState(false);

  // Timers are cleared on unmount so a mid-sequence navigation can't fire
  // setState on a dead component.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const playSequence = useCallback((seq: number[]) => {
    setPhase('showing');
    setStep(0);
    clearTimers();
    seq.forEach((tile, i) => {
      timers.current.push(setTimeout(() => setLit(tile), i * (FLASH_MS + GAP_MS)));
      timers.current.push(
        setTimeout(() => setLit(null), i * (FLASH_MS + GAP_MS) + FLASH_MS)
      );
    });
    timers.current.push(
      setTimeout(() => setPhase('input'), seq.length * (FLASH_MS + GAP_MS))
    );
  }, []);

  const start = () => {
    const first = [Math.floor(Math.random() * TILES.length)];
    setSequence(first);
    setWrong(false);
    playSequence(first);
  };

  const press = (tile: number) => {
    if (phase !== 'input') return;

    if (tile !== sequence[step]) {
      // The score is the last sequence you got all the way through.
      setWrong(true);
      setPhase('over');
      clearTimers();
      onFinish(sequence.length - 1);
      return;
    }

    setLit(tile);
    timers.current.push(setTimeout(() => setLit(null), 140));

    if (step === sequence.length - 1) {
      const next = [...sequence, Math.floor(Math.random() * TILES.length)];
      setSequence(next);
      timers.current.push(setTimeout(() => playSequence(next), 620));
    } else {
      setStep(step + 1);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && 'Watch the sequence, then play it back.'}
        {phase === 'showing' && 'Watch…'}
        {phase === 'input' && `Your turn — ${sequence.length} to repeat`}
        {phase === 'over' && `Dropped it at ${sequence.length}. Best run: ${sequence.length - 1}.`}
      </p>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {TILES.map((tile, i) => {
          const active = lit === i;
          return (
            <button
              key={i}
              onClick={() => press(i)}
              disabled={phase !== 'input'}
              aria-label={`Tile ${i + 1}`}
              className="w-[68px] h-[68px] sm:w-20 sm:h-20 rounded-2xl transition-all duration-100 disabled:cursor-default"
              style={{
                background: active ? tile.hex : `${tile.hex}22`,
                boxShadow: active ? `0 0 28px ${tile.hex}` : 'none',
                transform: active ? 'scale(0.95)' : 'scale(1)',
                border: `1px solid ${tile.hex}55`,
              }}
            />
          );
        })}
      </div>

      {(phase === 'idle' || phase === 'over') && (
        <button onClick={start} className="btn-gradient px-6 py-2.5">
          {phase === 'over' ? 'Go again' : 'Start'}
        </button>
      )}
      {wrong && phase === 'over' && (
        <p className="text-xs mt-3" style={{ color: 'var(--accent-red)' }}>
          Wrong tile — run over.
        </p>
      )}
    </div>
  );
}

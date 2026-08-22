'use client';

import { useCallback, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult, useTimers } from './PracticeKit';
import { sampleIndices, scale, scaleDown } from '@/lib/practiceKit';

/**
 * Spatial Memory — cells flash all at once, then you tap them back.
 *
 * The simultaneous flash is the point, and what makes this different from the
 * ranked Recall drill: there is no order to lean on, so you cannot rehearse it
 * as a sequence. You either take a snapshot of the shape the lit cells make or
 * you lose it, which is precisely the thing worth practising.
 */

export function spatialParams(level: number) {
  const dim = scale(level, 3, 6);
  return {
    dim,
    // Capped against the grid so a high level can never ask for more cells
    // than exist — the ramp reaches 12 on a 6×6, which is already brutal.
    cells: Math.min(scale(level, 3, 12, 1.15), dim * dim - 1),
    showMs: scaleDown(level, 2200, 550, 0.85),
  };
}

export function spatialHint(level: number): string {
  const p = spatialParams(level);
  return `${p.cells} cells · ${p.dim}×${p.dim} · ${(p.showMs / 1000).toFixed(1)}s`;
}

type Phase = 'idle' | 'showing' | 'input' | 'done';

export default function SpatialGame({ level, onRound }: PracticeGameProps) {
  const hex = '#a855f7';
  const { after, clear } = useTimers();

  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState<number[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [correct, setCorrect] = useState<boolean | null>(null);

  const params = spatialParams(level);

  const start = useCallback(() => {
    clear();
    const { dim, cells, showMs } = spatialParams(level);
    const next = sampleIndices(dim * dim, cells);
    setTarget(next);
    setPicked([]);
    setCorrect(null);
    setPhase('showing');
    after(showMs, () => setPhase('input'));
  }, [level, after, clear]);


  const tap = (index: number) => {
    if (phase !== 'input' || picked.includes(index)) return;
    const next = [...picked, index];
    setPicked(next);

    if (next.length === target.length) {
      const got = next.every((i) => target.includes(i));
      setCorrect(got);
      setPhase('done');
      onRound?.(got);
    }
  };

  const cellState = (index: number): 'lit' | 'hit' | 'miss' | 'missed' | 'idle' => {
    if (phase === 'showing') return target.includes(index) ? 'lit' : 'idle';
    if (phase === 'done') {
      if (picked.includes(index)) return target.includes(index) ? 'hit' : 'miss';
      return target.includes(index) ? 'missed' : 'idle';
    }
    return picked.includes(index) ? 'hit' : 'idle';
  };

  const STYLES: Record<string, { background: string; border: string; shadow?: string }> = {
    lit: { background: hex, border: hex, shadow: `0 0 22px ${hex}` },
    hit: { background: `${hex}cc`, border: hex },
    miss: { background: 'rgba(248,113,113,0.55)', border: '#f87171' },
    missed: { background: 'transparent', border: hex },
    idle: { background: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)' },
  };

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && `Tap start, then remember where the ${params.cells} lights were.`}
        {phase === 'showing' && 'Take it in…'}
        {phase === 'input' && `Tap the lit cells — ${target.length - picked.length} to go`}
        {phase === 'done' &&
          (correct ? 'All of them.' : 'Outlined cells are the ones you missed.')}
      </p>

      <div
        className="grid gap-2 mx-auto mb-5 w-fit"
        style={{ gridTemplateColumns: `repeat(${params.dim}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: params.dim * params.dim }, (_, i) => {
          const s = STYLES[cellState(i)];
          const size = params.dim >= 6 ? 46 : params.dim === 5 ? 54 : 62;
          return (
            <button
              key={i}
              onClick={() => tap(i)}
              disabled={phase !== 'input'}
              aria-label={`Cell ${i + 1}`}
              className="rounded-xl transition-all duration-150 disabled:cursor-default"
              style={{
                width: size,
                height: size,
                background: s.background,
                border: `1.5px solid ${s.border}`,
                boxShadow: s.shadow || 'none',
              }}
            />
          );
        })}
      </div>

      {correct !== null && (
        <div className="mb-3">
          <RoundResult
            correct={correct}
            hex={hex}
            detail={
              correct
                ? undefined
                : `${picked.filter((i) => target.includes(i)).length} of ${target.length} right`
            }
          />
        </div>
      )}

      {phase !== 'showing' && phase !== 'input' && (
        <NextButton onClick={start} hex={hex} label={phase === 'idle' ? 'Start' : 'Next round'} />
      )}
    </div>
  );
}

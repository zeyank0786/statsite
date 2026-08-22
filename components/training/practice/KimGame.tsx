'use client';

import { useCallback, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult, useTimers } from './PracticeKit';
import { sample, scale, scaleDown, shuffle } from '@/lib/practiceKit';

/**
 * Kim's Game — study the tray, then say what was taken off it.
 *
 * The trap in every digital version of this is that it becomes a spot-the-
 * difference: if you are offered the missing items alongside items still on the
 * tray, you can just scan the tray and pick the one that isn't there, having
 * remembered nothing. So the candidates here are the removed items mixed with
 * objects that were **never on the tray at all**. Both are absent from what you
 * can see, and the only way to tell them apart is to actually remember what you
 * studied — which is the drill.
 */

const OBJECTS = [
  '🔑', '🪙', '🧷', '🔩', '🪃', '🧵', '📎', '🔦', '🕯️', '🧭',
  '⌚', '💍', '🔔', '🪞', '🧴', '🪥', '🧽', '🍬', '🥄', '🍴',
  '✂️', '🖊️', '📕', '🎧', '🔌', '🪛', '🔨', '🧲', '💊', '🎲',
  '🃏', '🪶', '🐚', '🌰', '🍀', '🪨', '🧩', '🎈', '🪝', '🧯',
];

export function kimParams(level: number) {
  return {
    items: scale(level, 5, 16),
    removed: scale(level, 1, 4, 1.4),
    studyMs: scaleDown(level, 7000, 2600, 0.9),
  };
}

export function kimHint(level: number): string {
  const p = kimParams(level);
  return `${p.items} objects · ${p.removed} taken · ${(p.studyMs / 1000).toFixed(1)}s`;
}

type Phase = 'idle' | 'studying' | 'covered' | 'answering' | 'done';

interface Round {
  items: string[];
  removed: string[];
  remaining: string[];
  candidates: string[];
}

export function buildRound(level: number): Round {
  const { items: count, removed: removeCount } = kimParams(level);
  const items = sample(OBJECTS, count);
  const removed = sample(items, Math.min(removeCount, items.length - 1));
  const remaining = items.filter((o) => !removed.includes(o));
  // Decoys were never on the tray, so "it isn't there now" is true of them too.
  const decoys = sample(
    OBJECTS.filter((o) => !items.includes(o)),
    removed.length
  );
  return { items, removed, remaining, candidates: shuffle([...removed, ...decoys]) };
}

export default function KimGame({ level, onRound }: PracticeGameProps) {
  const hex = '#eab308';
  const { after, clear } = useTimers();

  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [correct, setCorrect] = useState<boolean | null>(null);

  const params = kimParams(level);

  const start = useCallback(() => {
    clear();
    const next = buildRound(level);
    setRound(next);
    setPicked([]);
    setCorrect(null);
    setPhase('studying');
    after(kimParams(level).studyMs, () => {
      setPhase('covered');
      // A beat under the cloth: without it the tray appears to just lose an
      // item, and the switch reads as a glitch rather than as a round.
      after(900, () => setPhase('answering'));
    });
  }, [level, after, clear]);


  const toggle = (object: string) => {
    if (phase !== 'answering' || !round) return;
    const next = picked.includes(object)
      ? picked.filter((o) => o !== object)
      : [...picked, object];
    setPicked(next);

    if (next.length === round.removed.length) {
      const got = next.every((o) => round.removed.includes(o));
      setCorrect(got);
      setPhase('done');
      onRound?.(got);
    }
  };

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && `Study the tray, then say which ${params.removed === 1 ? 'object goes' : 'objects go'} missing.`}
        {phase === 'studying' && 'Study the tray…'}
        {phase === 'covered' && 'Covering the tray…'}
        {phase === 'answering' &&
          `Which ${round!.removed.length === 1 ? 'one was' : `${round!.removed.length} were`} taken? Some of these were never there.`}
        {phase === 'done' && (correct ? 'That is exactly what went.' : 'Not what was taken.')}
      </p>

      {/* The tray */}
      <div
        className="rounded-2xl border p-4 mb-5 min-h-[120px] flex flex-wrap gap-3 justify-center items-center"
        style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.03)' }}
      >
        {phase === 'idle' && (
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Tray is empty
          </span>
        )}
        {phase === 'covered' && <span className="text-4xl">🫥</span>}
        {(phase === 'studying' || phase === 'answering' || phase === 'done') &&
          round &&
          (phase === 'studying' ? round.items : round.remaining).map((object, i) => (
            <span key={`${object}-${i}`} className="text-3xl">
              {object}
            </span>
          ))}
      </div>

      {/* Candidates */}
      {round && (phase === 'answering' || phase === 'done') && (
        <div className="flex flex-wrap gap-2.5 justify-center mb-5">
          {round.candidates.map((object) => {
            const chosen = picked.includes(object);
            const wasRemoved = round.removed.includes(object);
            const reveal = phase === 'done';
            const border = reveal
              ? wasRemoved
                ? hex
                : chosen
                ? '#f87171'
                : 'rgba(255,255,255,0.12)'
              : chosen
              ? hex
              : 'rgba(255,255,255,0.12)';
            return (
              <button
                key={object}
                onClick={() => toggle(object)}
                disabled={phase !== 'answering'}
                className="text-3xl w-16 h-16 rounded-xl transition disabled:cursor-default"
                style={{
                  border: `1.5px solid ${border}`,
                  background: chosen ? `${hex}1f` : 'rgba(255,255,255,0.04)',
                  opacity: reveal && !wasRemoved && !chosen ? 0.4 : 1,
                }}
              >
                {object}
              </button>
            );
          })}
        </div>
      )}

      {correct !== null && (
        <div className="mb-3">
          <RoundResult
            correct={correct}
            hex={hex}
            detail={correct ? undefined : `Gone: ${round?.removed.join(' ')}`}
          />
        </div>
      )}

      {(phase === 'idle' || phase === 'done') && (
        <NextButton onClick={start} hex={hex} label={phase === 'idle' ? 'Start' : 'Next tray'} />
      )}
    </div>
  );
}

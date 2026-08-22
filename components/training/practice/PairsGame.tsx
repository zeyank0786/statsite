'use client';

import { useCallback, useState } from 'react';
import { PracticeGameProps, NextButton, useTimers } from './PracticeKit';
import { sample, scale, scaleDown, shuffle } from '@/lib/practiceKit';

/**
 * Card Pairs — the matching game, played properly.
 *
 * Played badly it is luck: turn two at random and hope. Played properly it is a
 * memory drill, because every failed turn hands you two facts you are supposed
 * to keep. So the board reports turns used against the perfect number — the gap
 * between them is exactly how much of what you saw you actually kept, and it is
 * the only number here worth paying attention to.
 *
 * No round is ever "wrong", so this drill deliberately reports nothing to the
 * session tally; clearing a board is not a right-or-wrong outcome.
 */

const FACES = [
  '🍎', '🍋', '🍇', '🍒', '🥑', '🌶️', '🥕', '🍄',
  '🐙', '🦋', '🐝', '🦎', '🐳', '🦔', '🦩', '🐌',
  '⚓', '🚀', '🎸', '🪁', '🎺', '🧿', '💎', '🔮',
];

export function pairsParams(level: number) {
  return {
    pairs: scale(level, 3, 12),
    /** How long a mismatched pair stays visible before flipping back. */
    flipBackMs: scaleDown(level, 1400, 550),
  };
}

export function pairsHint(level: number): string {
  const p = pairsParams(level);
  return `${p.pairs} pairs · ${(p.flipBackMs / 1000).toFixed(1)}s look`;
}

interface Card {
  key: number;
  face: string;
  matched: boolean;
}

function buildDeck(level: number): Card[] {
  const faces = sample(FACES, pairsParams(level).pairs);
  return shuffle([...faces, ...faces]).map((face, key) => ({ key, face, matched: false }));
}

export default function PairsGame({ level }: PracticeGameProps) {
  const hex = '#ec4899';
  const { after, clear } = useTimers();

  const [deck, setDeck] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);
  const [started, setStarted] = useState(false);

  const params = pairsParams(level);
  const cleared = started && deck.length > 0 && deck.every((c) => c.matched);

  const start = useCallback(() => {
    clear();
    setDeck(buildDeck(level));
    setFlipped([]);
    setTurns(0);
    setStarted(true);
  }, [level, clear]);


  const flip = (key: number) => {
    if (!started || cleared) return;
    if (flipped.length >= 2) return; // a turn is already resolving
    const card = deck.find((c) => c.key === key);
    if (!card || card.matched || flipped.includes(key)) return;

    const next = [...flipped, key];
    setFlipped(next);
    if (next.length < 2) return;

    setTurns((t) => t + 1);
    const [a, b] = next.map((k) => deck.find((c) => c.key === k)!);
    if (a.face === b.face) {
      // Matched pairs stay up; no need to make anyone wait for that.
      setDeck((d) => d.map((c) => (next.includes(c.key) ? { ...c, matched: true } : c)));
      setFlipped([]);
    } else {
      after(params.flipBackMs, () => setFlipped([]));
    }
  };

  // Wide boards need more columns or the cards end up postage stamps.
  const columns = params.pairs <= 6 ? 4 : params.pairs <= 10 ? 5 : 6;

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {!started
          ? `${params.pairs} pairs. Remember what you turn over — that is the whole game.`
          : cleared
          ? `Cleared in ${turns} turns. Perfect is ${params.pairs}.`
          : `${deck.filter((c) => c.matched).length / 2} of ${params.pairs} found · ${turns} turns`}
      </p>

      {started && (
        <div
          className="grid gap-2 mx-auto mb-5 w-fit"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {deck.map((card) => {
            const faceUp = card.matched || flipped.includes(card.key);
            const size = columns >= 6 ? 46 : columns === 5 ? 54 : 62;
            return (
              <button
                key={card.key}
                onClick={() => flip(card.key)}
                disabled={faceUp || cleared}
                aria-label={faceUp ? card.face : 'Face-down card'}
                className="rounded-xl flex items-center justify-center transition-all duration-150 disabled:cursor-default"
                style={{
                  width: size,
                  height: size,
                  fontSize: size * 0.5,
                  background: faceUp ? `${hex}1f` : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${card.matched ? hex : 'rgba(255,255,255,0.12)'}`,
                  opacity: card.matched ? 0.55 : 1,
                }}
              >
                {faceUp ? card.face : ''}
              </button>
            );
          })}
        </div>
      )}

      {cleared && (
        <div
          className="rounded-xl border px-4 py-3 text-sm text-center mb-3"
          style={{ borderColor: `${hex}66`, background: `${hex}14` }}
        >
          <span className="font-semibold" style={{ color: hex }}>
            Board cleared
          </span>
          <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>
            {turns === params.pairs
              ? 'perfect — you missed nothing'
              : `${turns - params.pairs} turns over perfect`}
          </span>
        </div>
      )}

      {(!started || cleared) && (
        <NextButton onClick={start} hex={hex} label={started ? 'New board' : 'Deal'} />
      )}
    </div>
  );
}

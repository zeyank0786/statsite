'use client';

import { useEffect, useRef, useState } from 'react';
import { netWpm } from '@/lib/training';

/**
 * Typing Sprint — type the passage, scored on words per minute scaled by
 * accuracy.
 *
 * The clock starts on the first keystroke, not on the Start button: otherwise
 * reading the passage first would cost you, and everyone would just spam Start
 * until they'd memorised it.
 */

const PASSAGES = [
  'One crew, one direction. Nobody gets carried and nobody gets left behind.',
  'The evidence board only works if the evidence is real, so post the proof.',
  'Every stat moves the same way here: someone proposes it and the crew votes.',
  'Discipline is doing the thing on the day you least want to do the thing.',
  'Show up, log it, back it up. The numbers take care of themselves after that.',
];

export default function TypingGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [passage, setPassage] = useState('');
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'typing' | 'done'>('idle');
  const [result, setResult] = useState({ wpm: 0, accuracy: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  // Every keystroke that was wrong when it landed, including ones later fixed —
  // backspacing away a mistake shouldn't erase it from the accuracy figure.
  const mistakes = useRef(0);

  const start = () => {
    setPassage(PASSAGES[Math.floor(Math.random() * PASSAGES.length)]);
    setTyped('');
    setStartedAt(null);
    mistakes.current = 0;
    setPhase('typing');
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const onChange = (value: string) => {
    if (phase !== 'typing') return;
    // Never let them run past the end of the passage.
    const next = value.slice(0, passage.length);
    const began = startedAt ?? performance.now();
    if (startedAt === null) setStartedAt(began);

    // Count a new mistake only when adding a character that's already wrong.
    if (next.length > typed.length) {
      const added = next.length - 1;
      if (next[added] !== passage[added]) mistakes.current += 1;
    }
    setTyped(next);

    if (next.length === passage.length) {
      const elapsed = performance.now() - began;
      const correctChars = [...next].filter((ch, i) => ch === passage[i]).length;
      const totalTyped = passage.length + mistakes.current;
      const score = netWpm(correctChars, totalTyped, elapsed);
      setResult({
        wpm: Math.round(correctChars / 5 / (elapsed / 60000)),
        accuracy: Math.round((correctChars / Math.max(1, totalTyped)) * 100),
      });
      setPhase('done');
      onFinish(score);
    }
  };

  // Keep focus on the hidden input — clicking the passage should resume typing.
  useEffect(() => {
    if (phase === 'typing') inputRef.current?.focus();
  }, [phase]);

  return (
    <div className="flex flex-col items-center w-full">
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && 'Type the passage. The clock starts on your first keystroke.'}
        {phase === 'typing' && (startedAt === null ? 'Start typing whenever you like…' : 'Go')}
        {phase === 'done' && `${result.wpm} wpm · ${result.accuracy}% accurate`}
      </p>

      {phase !== 'idle' && (
        <div
          onClick={() => inputRef.current?.focus()}
          className="w-full max-w-md rounded-2xl border p-4 mb-4 font-mono text-[15px] leading-relaxed cursor-text"
          style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
        >
          {[...passage].map((char, i) => {
            const done = i < typed.length;
            const right = done && typed[i] === char;
            const current = i === typed.length && phase === 'typing';
            return (
              <span
                key={i}
                className="rounded-sm"
                style={{
                  color: done ? (right ? '#34d399' : '#fff') : 'var(--text-secondary)',
                  background: done && !right
                    ? 'rgba(239,68,68,0.35)'
                    : current
                    ? 'rgba(34,211,238,0.35)'
                    : 'transparent',
                  // Spaces need a visible box when they're the error or cursor.
                  paddingLeft: char === ' ' ? 1 : 0,
                  paddingRight: char === ' ' ? 1 : 0,
                }}
              >
                {char}
              </span>
            );
          })}
        </div>
      )}

      {phase === 'typing' && (
        <input
          ref={inputRef}
          value={typed}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          // Visually hidden rather than display:none — a hidden input can't
          // hold focus, and mobile keyboards won't open for it.
          className="opacity-0 absolute w-px h-px"
          aria-label="Type the passage here"
        />
      )}

      {phase !== 'typing' && (
        <button onClick={start} className="btn-gradient px-6 py-2.5">
          {phase === 'done' ? 'Go again' : 'Start'}
        </button>
      )}
    </div>
  );
}

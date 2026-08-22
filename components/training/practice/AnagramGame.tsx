'use client';

import { useCallback, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult } from './PracticeKit';
import { pick, scale, shuffle } from '@/lib/practiceKit';

/**
 * Anagrams — one scrambled word at a time.
 *
 * The hint deliberately gives up letters one at a time from the front rather
 * than showing the answer, because the useful part of this drill is the stretch
 * before you crack it. A single letter is usually enough to unstick someone
 * without doing the work for them.
 */

const WORDS: Record<number, string[]> = {
  4: ['bake', 'calm', 'dusk', 'fern', 'gaze', 'hush', 'jolt', 'kelp', 'lure', 'mint', 'nook', 'opal', 'raft', 'silt', 'tide', 'veil', 'wisp', 'yarn'],
  5: ['amber', 'blaze', 'crisp', 'drift', 'ember', 'flint', 'grasp', 'hover', 'ivory', 'joust', 'knack', 'lodge', 'mirth', 'nudge', 'ocean', 'plumb', 'quilt', 'raven', 'shard', 'tulip'],
  6: ['anchor', 'bridge', 'canopy', 'dazzle', 'effort', 'fabric', 'gadget', 'hollow', 'indigo', 'jungle', 'kettle', 'ladder', 'marrow', 'nectar', 'orchid', 'pebble', 'quiver', 'ribbon', 'saddle', 'timber'],
  7: ['balance', 'cabinet', 'declare', 'eclipse', 'fashion', 'gallery', 'harvest', 'justice', 'kingdom', 'lantern', 'mineral', 'nostril', 'orchard', 'pelican', 'quarrel', 'respect', 'stadium', 'texture'],
  8: ['absolute', 'backpack', 'calendar', 'daylight', 'envelope', 'festival', 'gradient', 'hospital', 'jubilant', 'keyboard', 'landmark', 'magnetic', 'notebook', 'obstacle', 'pancakes', 'quantity', 'reminder', 'sandwich'],
  9: ['adventure', 'blueprint', 'chocolate', 'discovery', 'evergreen', 'framework', 'gathering', 'hurricane', 'invisible', 'jellyfish', 'knowledge', 'landscape', 'magnitude', 'newspaper', 'orchestra', 'porcupine', 'quicksand', 'rectangle'],
};

export function anagramParams(level: number) {
  return { length: scale(level, 4, 9) };
}

export function anagramHint(level: number): string {
  return `${anagramParams(level).length}-letter words`;
}

/** Scramble, guaranteed not to hand back the word itself. */
function scramble(word: string): string {
  const letters = word.split('');
  for (let i = 0; i < 40; i++) {
    const attempt = shuffle(letters).join('');
    if (attempt !== word) return attempt;
  }
  // Every letter is identical — impossible for these words, but never loop.
  return letters.reverse().join('');
}

export default function AnagramGame({ level, onRound }: PracticeGameProps) {
  const hex = '#eab308';

  const [word, setWord] = useState('');
  const [jumble, setJumble] = useState('');
  const [entry, setEntry] = useState('');
  const [revealed, setRevealed] = useState(0);
  const [correct, setCorrect] = useState<boolean | null>(null);

  const start = useCallback(() => {
    const next = pick(WORDS[anagramParams(level).length]);
    setWord(next);
    setJumble(scramble(next));
    setEntry('');
    setRevealed(0);
    setCorrect(null);
  }, [level]);


  const submit = () => {
    if (!word || correct !== null) return;
    const got = entry.trim().toLowerCase() === word;
    setCorrect(got);
    onRound?.(got);
  };

  const giveUp = () => {
    if (!word || correct !== null) return;
    setCorrect(false);
    onRound?.(false);
  };

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {!word
          ? `Unscramble ${anagramParams(level).length}-letter words. Take a hint if you stall.`
          : correct === null
          ? 'Rearrange the letters into a word.'
          : correct
          ? 'Got it.'
          : `It was “${word}”.`}
      </p>

      {word && (
        <>
          <div className="flex flex-wrap gap-2 justify-center mb-5">
            {jumble.split('').map((letter, i) => (
              <span
                key={i}
                className="w-11 h-12 rounded-xl flex items-center justify-center font-display text-xl font-bold uppercase"
                style={{
                  background: `${hex}1a`,
                  border: `1.5px solid ${hex}55`,
                  color: correct === null ? '#fff' : `${hex}`,
                }}
              >
                {letter}
              </span>
            ))}
          </div>

          {revealed > 0 && correct === null && (
            <p className="text-center text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Starts with{' '}
              <span className="font-display font-bold uppercase tracking-widest" style={{ color: hex }}>
                {word.slice(0, revealed)}
              </span>
            </p>
          )}

          {correct === null && (
            <>
              <input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={word.length}
                placeholder="Your answer"
                className="w-full px-4 py-2.5 rounded-xl text-white text-center text-lg tracking-widest outline-none mb-3"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)' }}
              />
              <div className="flex gap-2 mb-3">
                <button
                  onClick={submit}
                  disabled={entry.trim().length !== word.length}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-40 hover:brightness-110"
                  style={{ background: `${hex}22`, color: hex, border: `1px solid ${hex}55` }}
                >
                  Submit
                </button>
                <button
                  onClick={() => setRevealed((r) => Math.min(r + 1, word.length - 1))}
                  className="btn-ghost px-4 text-sm"
                >
                  Hint
                </button>
                <button onClick={giveUp} className="btn-ghost px-4 text-sm">
                  Give up
                </button>
              </div>
            </>
          )}
        </>
      )}

      {correct !== null && (
        <div className="mb-3">
          <RoundResult
            correct={correct}
            hex={hex}
            detail={correct && revealed > 0 ? `with ${revealed} letter${revealed === 1 ? '' : 's'} given` : undefined}
          />
        </div>
      )}

      {(!word || correct !== null) && (
        <NextButton onClick={start} hex={hex} label={word ? 'Next word' : 'Start'} />
      )}
    </div>
  );
}

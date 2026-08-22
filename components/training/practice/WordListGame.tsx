'use client';

import { useCallback, useState } from 'react';
import { PracticeGameProps, NextButton, RoundResult, useTimers } from './PracticeKit';
import { sample, scale, scaleDown, shuffle } from '@/lib/practiceKit';

/**
 * Word List — memorise a list, then find it inside a bigger one.
 *
 * A recognition test is only as hard as its decoys. Words plucked at random
 * from anywhere are rejected on vibe alone: you never studied "hammer" in a
 * list about weather, so you do not need to remember anything to rule it out.
 * Past the midpoint the decoys therefore come from the *same themes* as the
 * words you studied, which removes that shortcut entirely and turns the drill
 * into what it is meant to be — recall under interference.
 */

const THEMES: Record<string, string[]> = {
  fruit: ['apple', 'cherry', 'mango', 'peach', 'plum', 'lemon', 'grape', 'melon'],
  tools: ['hammer', 'chisel', 'wrench', 'pliers', 'ladder', 'spanner', 'mallet', 'anvil'],
  weather: ['thunder', 'drizzle', 'breeze', 'frost', 'hail', 'monsoon', 'cyclone', 'mist'],
  travel: ['harbour', 'tunnel', 'runway', 'compass', 'cabin', 'ferry', 'station', 'voyage'],
  music: ['fiddle', 'chorus', 'tempo', 'ballad', 'drummer', 'encore', 'lyric', 'octave'],
  animals: ['otter', 'falcon', 'badger', 'walrus', 'gecko', 'magpie', 'panther', 'ferret'],
  house: ['kettle', 'mantel', 'pantry', 'curtain', 'cellar', 'attic', 'hinge', 'carpet'],
  abstract: ['motive', 'candour', 'tumult', 'verdict', 'quarrel', 'hazard', 'notion', 'tribute'],
};

const THEME_NAMES = Object.keys(THEMES);

export function wordParams(level: number) {
  return {
    words: scale(level, 5, 14),
    /** Decoys per studied word. */
    decoyRatio: level >= 14 ? 2 : level >= 7 ? 1.5 : 1,
    /** Above this, decoys share the studied words' themes — no free eliminations. */
    interference: level >= 11,
    studyMs: scaleDown(level, 14000, 5000, 0.9),
  };
}

export function wordHint(level: number): string {
  const p = wordParams(level);
  return `${p.words} words · ${(p.studyMs / 1000).toFixed(0)}s${p.interference ? ' · themed decoys' : ''}`;
}

type Phase = 'idle' | 'studying' | 'answering' | 'done';

interface Round {
  targets: string[];
  options: string[];
}

export function buildRound(level: number): Round {
  const { words, decoyRatio, interference } = wordParams(level);
  const themes = shuffle(THEME_NAMES);
  const usedThemes = themes.slice(0, Math.max(2, Math.ceil(words / 4)));

  // Draw the studied words from a couple of themes so there is something for
  // the interference setting to actually interfere with.
  const fromUsed = shuffle(usedThemes.flatMap((t) => THEMES[t]));
  const targets = fromUsed.slice(0, words);

  const decoyCount = Math.round(words * decoyRatio);
  const pool = interference
    ? // Same themes, so "was that word in this list?" is a real question.
      fromUsed.filter((w) => !targets.includes(w))
    : themes.slice(usedThemes.length).flatMap((t) => THEMES[t]);

  let decoys = sample(pool, decoyCount);
  // Themed pools run dry at the top levels; top up from anywhere rather than
  // quietly shrinking the option list, which would make the round easier.
  if (decoys.length < decoyCount) {
    const rest = Object.values(THEMES)
      .flat()
      .filter((w) => !targets.includes(w) && !decoys.includes(w));
    decoys = [...decoys, ...sample(rest, decoyCount - decoys.length)];
  }

  return { targets, options: shuffle([...targets, ...decoys]) };
}

export default function WordListGame({ level, onRound }: PracticeGameProps) {
  const hex = '#34d399';
  const { after, clear } = useTimers();

  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState(0);

  const params = wordParams(level);

  const start = useCallback(() => {
    clear();
    const next = buildRound(level);
    const { studyMs } = wordParams(level);
    setRound(next);
    setPicked([]);
    setCorrect(null);
    setPhase('studying');
    setRemaining(Math.ceil(studyMs / 1000));

    // A visible countdown, because "study this" with no clock makes people
    // linger on the first three words and lose the rest.
    for (let s = 1; s <= Math.ceil(studyMs / 1000); s++) {
      after(s * 1000, () => setRemaining(Math.ceil(studyMs / 1000) - s));
    }
    after(studyMs, () => setPhase('answering'));
  }, [level, after, clear]);


  const toggle = (word: string) => {
    if (phase !== 'answering') return;
    setPicked((p) => (p.includes(word) ? p.filter((w) => w !== word) : [...p, word]));
  };

  const check = () => {
    if (!round) return;
    const got = picked.length === round.targets.length && picked.every((w) => round.targets.includes(w));
    setCorrect(got);
    setPhase('done');
    onRound?.(got);
  };

  const hits = round ? picked.filter((w) => round.targets.includes(w)).length : 0;

  return (
    <div>
      <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
        {phase === 'idle' && `${params.words} words to memorise, then find them among decoys.`}
        {phase === 'studying' && `Memorise these — ${remaining}s`}
        {phase === 'answering' && 'Tap every word that was on the list.'}
        {phase === 'done' &&
          (correct ? 'Every one, and nothing extra.' : `${hits} of ${round!.targets.length} found.`)}
      </p>

      {phase === 'studying' && round && (
        <div
          className="rounded-2xl border p-4 mb-5 flex flex-wrap gap-2 justify-center"
          style={{ borderColor: `${hex}55`, background: `${hex}0d` }}
        >
          {round.targets.map((word) => (
            <span
              key={word}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              {word}
            </span>
          ))}
        </div>
      )}

      {round && (phase === 'answering' || phase === 'done') && (
        <div className="flex flex-wrap gap-2 justify-center mb-5">
          {round.options.map((word) => {
            const chosen = picked.includes(word);
            const isTarget = round.targets.includes(word);
            const reveal = phase === 'done';
            let color = 'rgba(255,255,255,0.12)';
            if (reveal) color = isTarget ? hex : chosen ? '#f87171' : 'rgba(255,255,255,0.1)';
            else if (chosen) color = hex;
            return (
              <button
                key={word}
                onClick={() => toggle(word)}
                disabled={phase !== 'answering'}
                className="px-3 py-1.5 rounded-lg text-sm transition disabled:cursor-default"
                style={{
                  border: `1.5px solid ${color}`,
                  background: chosen ? `${hex}1f` : 'rgba(255,255,255,0.04)',
                  color: reveal && !isTarget && !chosen ? 'var(--text-secondary)' : '#fff',
                  opacity: reveal && !isTarget && !chosen ? 0.45 : 1,
                }}
              >
                {word}
              </button>
            );
          })}
        </div>
      )}

      {phase === 'answering' && round && (
        <button
          onClick={check}
          disabled={picked.length !== round.targets.length}
          className="w-full py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-40 disabled:cursor-default hover:brightness-110 mb-3"
          style={{ background: `${hex}22`, color: hex, border: `1px solid ${hex}55` }}
        >
          Check — {picked.length} of {round.targets.length} chosen
        </button>
      )}

      {correct !== null && (
        <div className="mb-3">
          <RoundResult
            correct={correct}
            hex={hex}
            detail={correct ? undefined : `${hits} right, ${picked.length - hits} wrong`}
          />
        </div>
      )}

      {(phase === 'idle' || phase === 'done') && (
        <NextButton onClick={start} hex={hex} label={phase === 'idle' ? 'Start' : 'New list'} />
      )}
    </div>
  );
}

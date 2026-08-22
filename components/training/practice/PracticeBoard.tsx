'use client';

import { useState } from 'react';
import GameTutorial, { hasSeenTutorial } from '../GameTutorial';
import { PRACTICE_TUTORIALS } from './practiceTutorials';
import {
  DifficultySlider,
  PracticeGameProps,
  SessionTally,
  useLevel,
  useSessionTally,
} from './PracticeKit';
import { useScrollLock } from '@/lib/useScrollLock';
import { InfoIcon, XIcon } from '@/components/icons';
import {
  PRACTICE_CATEGORY_LABELS,
  PRACTICE_GAMES,
  type PracticeGame,
} from '@/lib/practiceGames';

import SpatialGame, { spatialHint } from './SpatialGame';
import KimGame, { kimHint } from './KimGame';
import DigitSpanGame, { digitHint } from './DigitSpanGame';
import PairsGame, { pairsHint } from './PairsGame';
import WordListGame, { wordHint } from './WordListGame';
import RotationGame, { rotationHint } from './RotationGame';
import LogicGridGame, { logicHint } from './LogicGridGame';
import EstimateGame, { estimateHint } from './EstimateGame';
import AnagramGame, { anagramHint } from './AnagramGame';
import MatrixGame, { matrixHint } from './MatrixGame';

/**
 * The practice range.
 *
 * Everything on this tab is client-side and disposable. There is no fetch, no
 * POST, no row written anywhere — which is why a locked-out player can still
 * use it, and why it costs the database nothing no matter how much anyone
 * plays. The only thing that outlives a session is the difficulty you last
 * chose, kept in your own browser.
 */

/** Board and difficulty caption for each drill, keyed by id. */
export const GAMES: Record<
  string,
  { Board: (props: PracticeGameProps) => React.ReactNode; hint: (level: number) => string }
> = {
  spatial: { Board: SpatialGame, hint: spatialHint },
  kim: { Board: KimGame, hint: kimHint },
  digits: { Board: DigitSpanGame, hint: digitHint },
  pairs: { Board: PairsGame, hint: pairsHint },
  words: { Board: WordListGame, hint: wordHint },
  rotation: { Board: RotationGame, hint: rotationHint },
  logic: { Board: LogicGridGame, hint: logicHint },
  estimate: { Board: EstimateGame, hint: estimateHint },
  anagram: { Board: AnagramGame, hint: anagramHint },
  matrix: { Board: MatrixGame, hint: matrixHint },
};

export default function PracticeBoard() {
  const [playing, setPlaying] = useState<PracticeGame | null>(null);
  const [forceTutorial, setForceTutorial] = useState(false);

  useScrollLock(playing !== null);

  const open = (game: PracticeGame, tutorial: boolean) => {
    setPlaying(game);
    setForceTutorial(tutorial);
  };

  return (
    <>
      <div
        className="rounded-xl px-4 py-3 text-xs mb-6 border flex items-start gap-2.5"
        style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
      >
        <InfoIcon size={15} className="shrink-0 mt-0.5" />
        <p>
          Nothing on this tab is recorded. No scores, no boards, no records — not even a personal
          best. Set the difficulty where you want it and drill it as long as you like; when you close
          the tab the only thing kept is where you left the slider.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {PRACTICE_GAMES.map((game) => (
          <section key={game.id} className="glass card-shadow p-5 animate-rise">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl shrink-0">{game.emoji}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-bold text-white">{game.name}</h2>
                <p className="text-xs" style={{ color: game.hex }}>
                  {game.tagline}
                </p>
              </div>
              <button
                onClick={() => open(game, !hasSeenTutorial(game.id))}
                className="btn-gradient text-sm px-4 py-2 shrink-0"
              >
                Practise
              </button>
            </div>

            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              {game.description}
            </p>

            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: `${game.hex}1f`, color: game.hex }}
              >
                {PRACTICE_CATEGORY_LABELS[game.category]}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                20 difficulty levels
              </span>
              <button
                onClick={() => open(game, true)}
                className="text-[11px] font-semibold hover:underline flex items-center gap-1 ml-auto"
                style={{ color: 'var(--text-secondary)' }}
              >
                <InfoIcon size={12} />
                How it works
              </button>
            </div>
          </section>
        ))}
      </div>

      {playing && (
        <PracticeModal
          game={playing}
          startWithTutorial={forceTutorial}
          onClose={() => setPlaying(null)}
        />
      )}
    </>
  );
}

/**
 * One drill, open.
 *
 * Mounted only while a game is being played, which is what lets `useLevel` and
 * the session tally be plain hooks keyed to this game rather than a map of
 * state for all ten.
 */
function PracticeModal({
  game,
  startWithTutorial,
  onClose,
}: {
  game: PracticeGame;
  startWithTutorial: boolean;
  onClose: () => void;
}) {
  const [level, setLevel] = useLevel(game.id);
  const [showTutorial, setShowTutorial] = useState(startWithTutorial);
  const { tally, record } = useSessionTally(level);

  const entry = GAMES[game.id];
  const Board = entry?.Board;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border p-6 animate-rise"
        style={{ background: 'var(--overlay)', borderColor: `${game.hex}55` }}
      >
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">{game.emoji}</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold text-white">{game.name}</h2>
            <p className="text-xs" style={{ color: game.hex }}>
              {game.tagline}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition shrink-0"
            aria-label="Close"
          >
            <XIcon size={18} />
          </button>
        </div>

        {showTutorial ? (
          <GameTutorial
            gameId={game.id}
            steps={PRACTICE_TUTORIALS[game.id] || []}
            hex={game.hex}
            onDone={() => setShowTutorial(false)}
          />
        ) : !Board ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
            This drill isn&apos;t available.
          </p>
        ) : (
          <>
            <DifficultySlider
              level={level}
              onChange={setLevel}
              hex={game.hex}
              hint={entry.hint(level)}
            />
            {/*
              Keyed on level so moving the slider remounts the drill. A round
              already in flight was built for the old difficulty — a 3×3 answer
              waiting on a 5×5 grid — so it has to be abandoned, and a remount
              does that without every game hand-rolling a reset.
            */}
            <Board key={level} level={level} onRound={record} />
            <SessionTally correct={tally.correct} total={tally.total} />
            <button
              onClick={() => setShowTutorial(true)}
              className="text-[11px] mx-auto mt-3 flex items-center gap-1 hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              <InfoIcon size={12} />
              How it works
            </button>
          </>
        )}
      </div>
    </div>
  );
}

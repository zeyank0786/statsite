'use client';

import { useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';

/**
 * The tap-through explainer that runs before someone's first go at a drill.
 *
 * Every game gets one, in the same shape, because the rules here are the kind
 * that are obvious once seen and impossible to parse from a sentence — 2-back
 * being the worst offender. Each step carries a *visual* rather than more
 * prose: the picture is the explanation and the text is the caption.
 *
 * Shown automatically until it's been completed once per game (remembered in
 * localStorage), and always reachable again from "How it works", because the
 * one you need is the one you've forgotten.
 */

export interface TutorialStep {
  /** Short heading — the single idea this step teaches. */
  title: string;
  /** The picture that does the actual explaining. */
  visual: React.ReactNode;
  /** One or two sentences of caption. */
  body: React.ReactNode;
}

const STORAGE_PREFIX = '4ward:tutorial-seen:';

/** Whether this player has already been through a game's tutorial. */
export function hasSeenTutorial(gameId: string): boolean {
  if (typeof window === 'undefined') return true; // never auto-open during SSR
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${gameId}`) === '1';
  } catch {
    // Private mode / storage disabled: treat as seen so a blocked write can't
    // trap someone in the tutorial every single time.
    return true;
  }
}

export function markTutorialSeen(gameId: string): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${gameId}`, '1');
  } catch {
    /* nothing to do — worst case it opens again next time */
  }
}

export default function GameTutorial({
  gameId,
  steps,
  hex,
  onDone,
}: {
  gameId: string;
  steps: TutorialStep[];
  hex: string;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);

  // Arrow keys work too — the buttons are small on a phone and this is a
  // read-through, not a game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(steps.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length]);

  const finish = () => {
    markTutorialSeen(gameId);
    onDone();
  };

  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: hex }}>
          How it works
        </p>
        <div className="flex items-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === index ? 18 : 6,
                background: i === index ? hex : 'rgba(255,255,255,0.18)',
              }}
            />
          ))}
        </div>
      </div>

      {/* The picture carries the explanation */}
      <div
        className="rounded-2xl border p-4 mb-4 min-h-[188px] flex items-center justify-center"
        style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
      >
        {step.visual}
      </div>

      <h3 className="font-display font-bold text-white mb-1">{step.title}</h3>
      <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {step.body}
      </p>

      <div className="flex items-center gap-2">
        {index > 0 && (
          <button onClick={() => setIndex(index - 1)} className="btn-ghost px-3 py-2.5" aria-label="Back">
            <ChevronLeftIcon size={16} />
          </button>
        )}
        <button
          onClick={() => (last ? finish() : setIndex(index + 1))}
          className="btn-gradient flex-1 py-2.5"
        >
          {last ? "Got it — let's go" : 'Next'}
          {!last && <ChevronRightIcon size={15} />}
        </button>
      </div>
      {!last && (
        <button
          onClick={finish}
          className="text-xs mt-3 mx-auto hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Skip
        </button>
      )}
    </div>
  );
}

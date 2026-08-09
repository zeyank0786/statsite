'use client';

import { useEffect } from 'react';

export const EFFECTS_STORAGE_KEY = '4ward-effects';

/**
 * Drives the pointer-reactive surface effects for the whole app.
 *
 * One delegated pointermove listener on the document rather than per-card React
 * state: with ~40 glass cards on the leaderboard, per-card handlers plus state
 * updates would re-render the tree on every mouse movement. Here nothing
 * re-renders — we write CSS custom properties straight onto the hovered node
 * and let the compositor do the work.
 *
 * Reads:  .tilt  -> --tilt-x, --tilt-y  (3D tilt)
 *         .holo  -> --fx, --fy          (holographic foil glare)
 *
 * The two lookups are independent rather than one closest() call: a holo card
 * can itself be the tilting element, and a shared lookup would make whichever
 * selector matched first suppress the other.
 *
 * There used to be a third: a cursor-tracking spotlight on every .glass surface.
 * It was removed — a flashlight following the pointer across every card on the
 * page read as aggressive rather than tactile.
 */
export default function Effects() {
  useEffect(() => {
    // Touch devices have no hover; the listener would only fire on tap and
    // leave a highlight stuck where the user last touched.
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let pending: PointerEvent | null = null;
    // Tracked so we can clear vars when the pointer leaves a card — otherwise
    // the effect freezes in place instead of settling back.
    let lastTilt: HTMLElement | null = null;
    let lastFoil: HTMLElement | null = null;

    const clearTilt = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--tilt-x');
      el.style.removeProperty('--tilt-y');
    };

    const clearFoil = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--fx');
      el.style.removeProperty('--fy');
    };

    const apply = () => {
      frame = 0;
      const e = pending;
      pending = null;
      if (!e) return;

      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;

      const tilt = target.closest<HTMLElement>('.tilt');
      if (tilt !== lastTilt) {
        clearTilt(lastTilt);
        lastTilt = tilt;
      }
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        // -0.5..0.5 from the card's centre, scaled to a restrained 5° throw.
        // rotateX is negated so the edge nearest the cursor lifts toward you.
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty('--tilt-x', `${-py * 5}deg`);
        tilt.style.setProperty('--tilt-y', `${px * 5}deg`);
      }

      const foil = target.closest<HTMLElement>('.holo');
      if (foil !== lastFoil) {
        clearFoil(lastFoil);
        lastFoil = foil;
      }
      if (foil) {
        // Percentages, not pixels: these drive background-position on a
        // deliberately oversized gradient, so the pattern slides with the
        // cursor across cards of any width.
        const r = foil.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * 100;
        const py = ((e.clientY - r.top) / r.height) * 100;
        foil.style.setProperty('--fx', `${px.toFixed(1)}%`);
        foil.style.setProperty('--fy', `${py.toFixed(1)}%`);
      }
    };

    const onMove = (e: PointerEvent) => {
      pending = e;
      // Coalesce to one write per frame; pointermove can fire far faster.
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      clearTilt(lastTilt);
      clearFoil(lastFoil);
      lastTilt = null;
      lastFoil = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    // Scrolling moves cards out from under a stationary cursor, leaving them
    // tilted at an angle that no longer corresponds to where the pointer is.
    window.addEventListener('scroll', onLeave, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onLeave);
      onLeave();
    };
  }, []);

  return null;
}

/** Read the persisted preference. Safe during SSR. */
export function getEffectsReduced(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(EFFECTS_STORAGE_KEY) === 'reduced';
  } catch {
    return false;
  }
}

/** Persist and apply immediately — the CSS keys off <html data-effects>. */
export function setEffectsReduced(reduced: boolean) {
  try {
    window.localStorage.setItem(EFFECTS_STORAGE_KEY, reduced ? 'reduced' : 'full');
  } catch {
    /* private mode — the toggle still applies for this session */
  }
  document.documentElement.dataset.effects = reduced ? 'reduced' : 'full';
}

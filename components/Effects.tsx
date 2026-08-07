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
 * Reads:  .glass / .glass-strong  -> --mx, --my  (cursor spotlight)
 *         .tilt                   -> --tilt-x, --tilt-y  (3D tilt)
 */
export default function Effects() {
  useEffect(() => {
    // Touch devices have no hover; the listener would only fire on tap and
    // leave a highlight stuck where the user last touched.
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let pending: PointerEvent | null = null;
    // Tracked so we can clear vars when the pointer leaves a card — otherwise
    // the highlight freezes in place instead of fading out.
    let lastSurface: HTMLElement | null = null;
    let lastTilt: HTMLElement | null = null;

    const clearTilt = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--tilt-x');
      el.style.removeProperty('--tilt-y');
    };

    const clearSurface = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    };

    const apply = () => {
      frame = 0;
      const e = pending;
      pending = null;
      if (!e) return;

      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;

      const surface = target.closest<HTMLElement>('.glass, .glass-strong');
      if (surface !== lastSurface) {
        clearSurface(lastSurface);
        lastSurface = surface;
      }
      if (surface) {
        const r = surface.getBoundingClientRect();
        surface.style.setProperty('--mx', `${e.clientX - r.left}px`);
        surface.style.setProperty('--my', `${e.clientY - r.top}px`);
      }

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
    };

    const onMove = (e: PointerEvent) => {
      pending = e;
      // Coalesce to one write per frame; pointermove can fire far faster.
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      clearSurface(lastSurface);
      clearTilt(lastTilt);
      lastSurface = null;
      lastTilt = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    // Scrolling moves cards out from under a stationary cursor, stranding the
    // highlight at coordinates that no longer correspond to anything.
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

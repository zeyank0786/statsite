'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * One-shot "has this scrolled into view yet" for entrance animations.
 *
 * One module-level IntersectionObserver serves every caller. The profile page
 * renders a bar per stat — 70 observers, each with its own callback closure,
 * would be 70 objects doing identical work against the same root.
 *
 * Fires at threshold 0 with a bottom margin rather than a ratio: an element
 * taller than the viewport can never reach 25% visible, so a ratio threshold
 * silently never fires on the long category sections.
 *
 * The margin is a fixed 56px rather than a percentage for the same reason.
 * Anything sitting entirely inside that band never fires, and on a page too
 * short to scroll it would never get the chance to — a percentage makes that
 * band grow with the viewport, and the failure mode here is an invisible
 * chart, not a missed flourish.
 */

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

function sharedObserver(): IntersectionObserver {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries, io) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const fire = callbacks.get(entry.target);
        // One-shot: stop watching before firing, so a callback that triggers
        // layout can't re-enter for the same element.
        io.unobserve(entry.target);
        callbacks.delete(entry.target);
        fire?.();
      }
    },
    { threshold: 0, rootMargin: '0px 0px -56px 0px' },
  );
  return observer;
}

/** Motion is unwelcome — OS preference, or the per-device Reduce effects toggle. */
function prefersCalm(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.dataset.effects === 'reduced') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Returns a ref to attach and whether the element has been seen.
 *
 * Under calm mode the flag flips inside a layout effect, so the revealed state
 * is what first paints — there's no hidden frame to transition out of, and
 * nothing animates even though the transitions are still declared.
 */
export function useReveal<T extends Element = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersCalm() || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const io = sharedObserver();
    callbacks.set(el, () => setRevealed(true));
    io.observe(el);

    return () => {
      callbacks.delete(el);
      io.unobserve(el);
    };
  }, []);

  return { ref, revealed };
}

type RevealProps = React.ComponentPropsWithoutRef<'div'>;

/**
 * Marks a group as revealed via `data-reveal`, for effects that are cheaper to
 * express as one CSS rule over many children than as per-child React state —
 * see `.bar-grow` in globals.css.
 *
 * Renders a plain div, so it can replace an existing wrapper and keep its
 * classes rather than adding a layer that grid and flex parents would see.
 */
export default function Reveal({ children, ...rest }: RevealProps) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-reveal={revealed ? 'in' : 'out'} {...rest}>
      {children}
    </div>
  );
}

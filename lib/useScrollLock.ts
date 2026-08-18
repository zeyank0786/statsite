'use client';

import { useEffect } from 'react';

/**
 * Freeze page scrolling while `locked` is true.
 *
 * Training drills are played with rapid taps and key presses inside a modal.
 * A stray swipe, a space bar, or an arrow key would scroll the page underneath
 * mid-run — which on a timed drill costs the run. The modal keeps its own
 * `overflow-y-auto`, so only the page behind it is frozen.
 *
 * `overflow: hidden` on <body> is enough on desktop but iOS Safari ignores it
 * for touch scrolling, so the body is pinned with `position: fixed` at the
 * current offset and restored afterwards. Without capturing the offset the
 * page would jump to the top on lock and stay there on release.
 *
 * The cleanup runs on unmount as well as on unlock, so a crash or a route
 * change can never strand the page unscrollable.
 */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    const { body } = document;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    // Stops a scroll that reaches the end of the modal from chaining out to
    // the page, and suppresses pull-to-refresh during a run.
    body.style.overscrollBehavior = 'contain';

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      body.style.overscrollBehavior = previous.overscrollBehavior;
      // Restoring styles alone leaves the viewport at the top; put the reader
      // back where they were. 'instant' so it doesn't animate on close.
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
    };
  }, [locked]);
}

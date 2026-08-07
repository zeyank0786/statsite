'use client';

import { useEffect, useRef } from 'react';

/**
 * Polling that stops when nobody is looking.
 *
 * Every timer in the app used to be a bare `setInterval`, which keeps firing in
 * a background tab, on a locked phone, and on the dozen stale tabs people leave
 * open — all of it hitting the database for a screen nobody can see.
 *
 * This hook pauses while the document is hidden and fires once immediately on
 * return, so coming back to a tab shows fresh data rather than waiting out the
 * remainder of an interval.
 *
 * The callback is held in a ref, so passing an inline arrow function does not
 * restart the timer on every render.
 */
export function usePoll(
  fn: () => void | Promise<void>,
  intervalMs: number,
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;
  const saved = useRef(fn);

  // Updated in an effect rather than during render (refs must not be mutated
  // while rendering). This effect is declared first, so it has always run by
  // the time the polling effect below fires its initial call.
  useEffect(() => {
    saved.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      void saved.current();
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run(); // catch up on whatever was missed while hidden
        start();
      } else {
        stop();
      }
    };

    run();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}

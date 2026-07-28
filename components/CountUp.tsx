'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animated number that counts up to `value` on mount (from 0) and re-animates
 * from the previous value whenever `value` changes. Pure rAF, no deps.
 * Honours prefers-reduced-motion by snapping straight to the target.
 */
export default function CountUp({
  value,
  decimals = 0,
  duration = 1100,
  prefix = '',
  suffix = '',
  className,
  from = 0,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Starting point for the very first animation (default 0). */
  from?: number;
}) {
  const [display, setDisplay] = useState(from);
  const fromRef = useRef(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const target = Number(value);
    if (!Number.isFinite(target)) {
      setDisplay(target);
      return;
    }

    const start = fromRef.current;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || start === target || duration <= 0) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(start + (target - start) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

'use client';

import { useEffect, useState } from 'react';

/** Full 0–9 cycles the track spins through before settling on mount. */
const SPIN_CYCLES = 2;
const DIGITS = Array.from({ length: (SPIN_CYCLES + 1) * 10 }, (_, i) => i % 10);

/**
 * Split-flap style number. Each digit is its own strip of 0–9 that rolls
 * vertically into place, rather than the whole number interpolating.
 *
 * Drop-in for CountUp — same props — but reserved for hero figures. On a dense
 * table of numbers the rolling reads as noise; on one big score it's the point.
 */
export default function Odometer({
  value,
  decimals = 0,
  duration = 1100,
  prefix = '',
  suffix = '',
  className = '',
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  // Render parked at the start of the strip, then flip to the real value on the
  // next frame so the CSS transition has two states to animate between. Without
  // the deferral React commits the final position and nothing moves.
  const [rolled, setRolled] = useState(false);

  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const text = safe.toFixed(decimals);

  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const reduce =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.effects === 'reduced';
    if (reduce) {
      setReduced(true);
      setRolled(true);
      return;
    }
    const id = requestAnimationFrame(() => setRolled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const chars = `${prefix}${text}${suffix}`.split('');

  return (
    <span className={`odometer ${className}`}>
      {/* The strip contains 30 glyphs per digit — announce the real number instead. */}
      <span className="sr-only">{`${prefix}${text}${suffix}`}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {chars.map((char, i) => {
          if (!/\d/.test(char)) {
            return <span key={i}>{char}</span>;
          }
          const digit = Number(char);
          // Land on the last cycle so mount spins forward through the strip;
          // later value changes are a short hop within that final cycle.
          const target = SPIN_CYCLES * 10 + digit;
          return (
            <span key={i} className="odometer-digit">
              <span
                className="odometer-digit-track"
                style={{
                  '--roll': `-${rolled ? target : 0}em`,
                  // Stagger left-to-right so the number settles like a counter
                  // coming to rest instead of every column stopping at once.
                  transitionDelay: reduced ? '0ms' : `${i * 55}ms`,
                  '--roll-duration': reduced ? '0ms' : `${duration}ms`,
                } as React.CSSProperties}
              >
                {DIGITS.map((d, j) => (
                  <span key={j}>{d}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

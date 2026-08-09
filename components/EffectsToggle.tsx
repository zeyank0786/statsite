'use client';

import { useEffect, useState } from 'react';
import { getEffectsReduced, setEffectsReduced } from './Effects';
import { SparklesIcon } from './icons';

/**
 * Per-device visual-effects switch. Deliberately not stored server-side: the
 * right answer depends on the screen you're on, not on who you are — a phone
 * on battery and a desktop can reasonably disagree.
 */
export default function EffectsToggle() {
  const [reduced, setReduced] = useState(false);
  // localStorage isn't available during SSR, so the first paint would always
  // render "on" and then correct itself. Gate the control until mounted.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReduced(getEffectsReduced());
    setReady(true);
  }, []);

  const toggle = () => {
    const next = !reduced;
    setReduced(next);
    setEffectsReduced(next);
  };

  return (
    <div className="glass card-shadow p-5 max-w-2xl mt-5 flex items-center gap-4">
      <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
        <SparklesIcon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">Reduce effects</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Turns off card tilt, the drifting background and grain on this device.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={reduced}
        aria-label="Reduce effects"
        onClick={toggle}
        disabled={!ready}
        className="relative w-12 h-7 rounded-full shrink-0 transition disabled:opacity-50"
        style={{
          background: reduced ? 'var(--accent-purple)' : 'rgba(255,255,255,0.12)',
        }}
      >
        <span
          className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all"
          style={{ left: reduced ? '1.5rem' : '0.25rem' }}
        />
      </button>
    </div>
  );
}

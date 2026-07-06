'use client';

import { useState } from 'react';
import { XIcon } from './icons';
import { getCategoryMeta } from '@/lib/categories';

interface StatDescriptionModalProps {
  statCode: string;
  statLabel: string;
  description: string;
}

export default function StatDescriptionModal({
  statCode,
  statLabel,
  description,
}: StatDescriptionModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const meta = getCategoryMeta(statCode?.split('-')[0]);

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold transition hover:bg-white/10 shrink-0"
        style={{ color: meta.hex }}
        title={`Learn more about ${statLabel}`}
      >
        ?
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="card-shadow-lg border rounded-t-3xl sm:rounded-3xl p-6 md:p-7 max-w-md w-full animate-rise"
            style={{ background: '#13131b', borderColor: 'var(--surface-border)' }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: meta.hex }}>
                  {statCode.toUpperCase()} · {meta.label}
                </p>
                <h2 className="font-display text-xl font-bold text-white">{statLabel}</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition shrink-0"
              >
                <XIcon size={18} />
              </button>
            </div>
            <p className="text-neutral-300 text-sm leading-relaxed">{description}</p>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-6 w-full py-2.5 rounded-xl font-semibold text-white transition hover:brightness-110"
              style={{ background: `linear-gradient(120deg, ${meta.hex}, ${meta.hex}bb)` }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';

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

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold hover:bg-neutral-700/50 transition"
        style={{ color: 'var(--accent-cyan)' }}
        title={`Learn more about ${statLabel}`}
      >
        ?
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-8 max-w-md w-full card-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--accent-cyan)' }}>
                  {statCode.toUpperCase()}
                </p>
                <h2 className="text-2xl font-bold text-white">{statLabel}</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-neutral-300 transition text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-neutral-300 leading-relaxed">{description}</p>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-6 w-full py-2 rounded-lg font-semibold text-white transition"
              style={{ backgroundColor: 'var(--accent-cyan)' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

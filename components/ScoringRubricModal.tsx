'use client';

import { useState } from 'react';
import { XIcon, InfoIcon } from './icons';

const BANDS = [
  {
    range: '1-4',
    title: 'Below Average',
    color: '#ef4444',
    text: 'Below the average human on the planet. Significant room for improvement. These areas would benefit from focused development and practice.',
  },
  {
    range: '5',
    title: 'Average',
    color: '#fbbf24',
    text: 'At the level of an average human globally. Demonstrates baseline competence in this area. Matches typical human capability without standout strength or weakness.',
  },
  {
    range: '6-7',
    title: 'Above Average',
    color: '#f97316',
    text: 'Above the average human. Shows notable skill and capability beyond baseline. This person has developed expertise or natural aptitude in this area.',
  },
  {
    range: '8-10',
    title: 'Exceptional',
    color: '#34d399',
    text: 'Exceptional performance well above the average human. Demonstrates mastery, exceptional skill, or rare talent. A clear strength that sets this person apart.',
  },
];

export default function ScoringRubricModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-300 border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 transition flex items-center gap-1.5"
        title="Scoring rubric"
      >
        <InfoIcon size={13} />
        Rubric
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-[70] sm:p-4">
          <div
            className="card-shadow-lg border rounded-t-3xl sm:rounded-3xl p-6 md:p-8 max-w-2xl w-full max-h-[85vh] overflow-y-auto animate-rise"
            style={{ background: '#13131b', borderColor: 'var(--surface-border)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold text-white">Scoring Rubric</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
              >
                <XIcon size={19} />
              </button>
            </div>

            <div className="space-y-4">
              {BANDS.map((band) => (
                <div
                  key={band.range}
                  className="rounded-2xl p-4 border-l-4 border"
                  style={{
                    borderLeftColor: band.color,
                    borderColor: 'var(--surface-border)',
                    borderLeftWidth: 4,
                    background: `color-mix(in srgb, ${band.color} 6%, transparent)`,
                  }}
                >
                  <h3 className="font-display text-base font-bold mb-1" style={{ color: band.color }}>
                    {band.range}: {band.title}
                  </h3>
                  <p className="text-neutral-300 text-sm leading-relaxed">{band.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--surface-border)' }}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
                Calibration tips
              </h3>
              <ul className="text-sm text-neutral-300 space-y-1.5 list-disc list-inside marker:text-neutral-600">
                <li>Use 5/10 as your anchor — baseline human capability globally</li>
                <li>Be specific when possible — reference concrete examples</li>
                <li>Focus on observable capabilities, not innate traits</li>
                <li>Consider relative to peer group, not just absolute skill</li>
                <li>Add notes to provide context and justification for ratings</li>
              </ul>
            </div>

            <button onClick={() => setIsOpen(false)} className="btn-gradient w-full mt-6">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

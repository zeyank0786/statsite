'use client';

import { useState } from 'react';

export default function ScoringRubricModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-2 rounded-lg text-sm font-medium text-white transition"
        style={{ backgroundColor: 'var(--accent-purple)' }}
        title="Scoring rubric"
      >
        📋 Rubric
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Scoring Rubric</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-white text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div className="border-l-4 border-red-500 pl-4">
                <h3 className="text-lg font-bold text-red-400 mb-2">1-4: Below Average</h3>
                <p className="text-neutral-300 text-sm">
                  Below the average human on the planet. Significant room for improvement. These areas would benefit from focused development and practice.
                </p>
              </div>

              <div className="border-l-4 border-yellow-500 pl-4">
                <h3 className="text-lg font-bold text-yellow-300 mb-2">5: Average</h3>
                <p className="text-neutral-300 text-sm">
                  At the level of an average human globally. Demonstrates baseline competence in this area. Matches typical human capability without standout strength or weakness.
                </p>
              </div>

              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="text-lg font-bold text-orange-400 mb-2">6-7: Above Average</h3>
                <p className="text-neutral-300 text-sm">
                  Above the average human. Shows notable skill and capability beyond baseline. This person has developed expertise or natural aptitude in this area.
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="text-lg font-bold text-green-400 mb-2">8-10: Exceptional</h3>
                <p className="text-neutral-300 text-sm">
                  Exceptional performance well above the average human. Demonstrates mastery, exceptional skill, or rare talent. A clear strength that sets this person apart.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-400 mb-3">Calibration tips:</h3>
              <ul className="text-sm text-neutral-300 space-y-2">
                <li>• Use 5/10 as your anchor - baseline human capability globally</li>
                <li>• Be specific when possible - reference concrete examples</li>
                <li>• Focus on observable capabilities, not innate traits</li>
                <li>• Consider relative to peer group, not just absolute skill</li>
                <li>• Add notes to provide context and justification for ratings</li>
              </ul>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="mt-6 w-full px-4 py-2 rounded-lg font-semibold text-white transition"
              style={{ backgroundColor: 'var(--accent-cyan)' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

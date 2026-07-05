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
                <h3 className="text-lg font-bold text-red-400 mb-2">1-3: Weak</h3>
                <p className="text-neutral-300 text-sm">
                  Significant improvement needed. The person struggles in this area and should prioritize development. Performance is below expectations.
                </p>
              </div>

              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="text-lg font-bold text-orange-400 mb-2">4-7: Medium</h3>
                <p className="text-neutral-300 text-sm">
                  Solid foundation with room for growth. The person demonstrates competence but isn't exceptional. Continued development would be beneficial.
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="text-lg font-bold text-green-400 mb-2">8-10: Strong</h3>
                <p className="text-neutral-300 text-sm">
                  Excellent performance. The person demonstrates mastery or near-mastery in this area. Exceeds expectations and serves as a strength to leverage.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-400 mb-3">Tips for reviewing:</h3>
              <ul className="text-sm text-neutral-300 space-y-2">
                <li>• Be specific when possible - reference examples</li>
                <li>• Focus on observable behaviors, not personal traits</li>
                <li>• Consider both current state and growth potential</li>
                <li>• Add notes to provide context for your ratings</li>
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

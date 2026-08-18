'use client';

import { useState } from 'react';
import { orderCategories, orderStats } from '@/lib/categories';
import StatPicker, { type PickableStat } from '@/components/StatPicker';
import { PlusIcon, XIcon } from '@/components/icons';

const DELTAS = [-2, -1, 1, 2];

/**
 * "Add a stat the proposer missed" — lets an eligible voter tack more stats
 * onto someone else's suggestion. The added stats share the suggestion's
 * evidence and reason and are voted on independently (server-side), so this is
 * just the picker.
 *
 * Several stats at a time, each with its own value: one moment usually
 * demonstrates more than one thing, and forcing a separate trip through this
 * panel per stat meant people added the obvious one and gave up on the rest.
 * A shared value would be the wrong compromise — the whole point of adding
 * three stats is that they didn't all move by the same amount.
 */
export default function AddStatToSuggestion({
  anchorId,
  subjectId,
  subjectName,
  existingStatIds,
  onAdded,
}: {
  anchorId: string;
  subjectId: string;
  subjectName: string;
  existingStatIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<PickableStat[] | null>(null);
  const [loading, setLoading] = useState(false);
  /** statId → delta. Insertion order is the order they were picked. */
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openPicker = async () => {
    setOpen(true);
    setError('');
    if (stats) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/players/${subjectId}`);
      if (res.ok) {
        const data = await res.json();
        type ApiCategory = { code: string; label: string; stats: PickableStat[] };
        const flat: PickableStat[] = [];
        for (const cat of orderCategories<ApiCategory>(data.categories || [])) {
          for (const s of orderStats<PickableStat>(cat.stats || [])) {
            flat.push({ ...s, categoryCode: cat.code, categoryLabel: cat.label });
          }
        }
        setStats(flat);
      } else {
        setError('Could not load their stats');
      }
    } catch {
      setError('Could not load their stats');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (statId: string) => {
    setPicks((current) => {
      if (statId in current) {
        const next = { ...current };
        delete next[statId];
        return next;
      }
      return { ...current, [statId]: 1 }; // +1 is the default, as everywhere
    });
  };

  const setDelta = (statId: string, delta: number) =>
    setPicks((current) => ({ ...current, [statId]: delta }));

  const chosen = Object.entries(picks);

  const submit = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/suggestions/${anchorId}/add-stat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats: chosen.map(([statId, delta]) => ({ statId, delta })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOpen(false);
        setPicks({});
        onAdded();
      } else {
        setError(data.error || 'Failed to add the stats');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={openPicker}
        className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border text-purple-300 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition"
      >
        <PlusIcon size={14} /> Add stats they missed
      </button>
    );
  }

  const available = (stats || []).filter((s) => !existingStatIds.includes(s.id));

  return (
    <div
      className="mt-3 rounded-2xl border p-4"
      style={{ borderColor: 'rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.05)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-white">
          Add stats to {subjectName}&apos;s suggestion
        </p>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded-lg text-neutral-500 hover:text-white transition"
        >
          <XIcon size={15} />
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        They share the same evidence and reason, and the crew votes on each one on its own.
      </p>

      {loading ? (
        <div className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
      ) : available.length === 0 ? (
        <p className="text-sm py-2" style={{ color: 'var(--text-secondary)' }}>
          Every tracked stat is already in this suggestion.
        </p>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto mb-3 pr-1">
            <StatPicker
              stats={available}
              selectedIds={Object.keys(picks)}
              onToggle={toggle}
              placeholder="Search their stats…"
              /* Each chosen stat carries its own value, revealed once picked. */
              trailing={(stat) => (
                <div className="grid grid-cols-4 gap-1.5">
                  {DELTAS.map((d) => {
                    const on = picks[stat.id] === d;
                    const color = d > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDelta(stat.id, d)}
                        aria-label={`${d > 0 ? '+' : ''}${d} ${stat.label}`}
                        className={`py-1.5 rounded-lg border font-bold text-sm transition ${
                          on ? 'text-white' : 'text-neutral-400 hover:text-white'
                        }`}
                        style={{
                          borderColor: on ? color : 'var(--surface-border)',
                          background: on
                            ? `color-mix(in srgb, ${color} 20%, transparent)`
                            : 'transparent',
                        }}
                      >
                        {d > 0 ? '+' : ''}
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          <button
            onClick={submit}
            disabled={busy || chosen.length === 0}
            className="btn-gradient text-sm py-2 disabled:opacity-50"
          >
            {busy
              ? 'Adding…'
              : chosen.length === 0
              ? 'Pick a stat'
              : `Add ${chosen.length} stat${chosen.length > 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </div>
  );
}

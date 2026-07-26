'use client';

import { useState } from 'react';
import { getCategoryMeta, orderCategories, orderStats } from '@/lib/categories';
import LockBadge from '@/components/LockBadge';
import { PlusIcon, CheckIcon, XIcon } from '@/components/icons';

interface SubjectStat {
  id: string;
  code: string;
  label: string;
  value: number;
  locked: boolean;
  lockSource: 'override' | 'rules' | null;
  lockReasons: any[];
  categoryCode: string;
  categoryLabel: string;
}

const DELTAS = [-2, -1, 1, 2];

/**
 * "Add a stat the proposer missed" — lets an eligible voter tack another stat
 * onto someone else's suggestion. The added stat shares the suggestion's
 * evidence/reason and is voted on independently (server-side), so this is just
 * the picker.
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
  const [stats, setStats] = useState<SubjectStat[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [delta, setDelta] = useState(1);
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
        const flat: SubjectStat[] = [];
        for (const cat of orderCategories<any>(data.categories || [])) {
          for (const s of orderStats<any>(cat.stats || [])) {
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

  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/suggestions/${anchorId}/add-stat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statId: pick, delta }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOpen(false);
        setPick(null);
        setDelta(1);
        onAdded();
      } else {
        setError(data.error || 'Failed to add the stat');
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
        <PlusIcon size={14} /> Add a stat they missed
      </button>
    );
  }

  const available = (stats || []).filter((s) => !existingStatIds.includes(s.id));
  const categories = [...new Set(available.map((s) => s.categoryCode))];
  const selected = available.find((s) => s.id === pick);

  return (
    <div
      className="mt-3 rounded-2xl border p-4"
      style={{ borderColor: 'rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.05)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-white">Add a stat to {subjectName}&apos;s suggestion</p>
        <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-neutral-500 hover:text-white transition">
          <XIcon size={15} />
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        It shares the same evidence and reason, and the crew votes on it on its own.
      </p>

      {loading ? (
        <div className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
      ) : (
        <>
          <div className="space-y-3 max-h-64 overflow-y-auto mb-3 pr-1">
            {categories.map((code) => {
              const catStats = available.filter((s) => s.categoryCode === code);
              const meta = getCategoryMeta(code, catStats[0]?.categoryLabel);
              return (
                <div key={code}>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: meta.hex }}>
                    {catStats[0]?.categoryLabel || code}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {catStats.map((s) => {
                      const active = pick === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => !s.locked && setPick(s.id)}
                          disabled={s.locked}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition ${
                            s.locked ? 'opacity-50 cursor-not-allowed' : active ? 'text-white' : 'text-neutral-300 hover:text-white'
                          }`}
                          style={{
                            borderColor: active ? meta.hex : 'var(--surface-border)',
                            background: active ? `${meta.hex}18` : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          <span className="text-sm truncate">{s.label}</span>
                          {s.locked ? (
                            <LockBadge reasons={s.lockReasons} source={s.lockSource} statLabel={s.label} />
                          ) : active ? (
                            <CheckIcon size={14} />
                          ) : (
                            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                              {s.value}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {available.length === 0 && (
              <p className="text-sm py-2" style={{ color: 'var(--text-secondary)' }}>
                Every tracked stat is already in this suggestion.
              </p>
            )}
          </div>

          {selected && (
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {DELTAS.map((d) => {
                const on = delta === d;
                const color = d > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                return (
                  <button
                    key={d}
                    onClick={() => setDelta(d)}
                    className={`py-1.5 rounded-lg border font-bold text-sm transition ${
                      on ? 'text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                    style={{
                      borderColor: on ? color : 'var(--surface-border)',
                      background: on ? `color-mix(in srgb, ${color} 20%, transparent)` : 'transparent',
                    }}
                  >
                    {d > 0 ? '+' : ''}
                    {d}
                  </button>
                );
              })}
            </div>
          )}

          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          <button
            onClick={submit}
            disabled={busy || !pick}
            className="btn-gradient text-sm py-2 disabled:opacity-50"
          >
            {busy ? 'Adding…' : selected ? `Add ${delta > 0 ? '+' : ''}${delta} ${selected.label}` : 'Pick a stat'}
          </button>
        </>
      )}
    </div>
  );
}

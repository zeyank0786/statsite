'use client';

import { useMemo, useState } from 'react';
import { PlusIcon, TrashIcon } from '@/components/icons';

export const ALLOWED_DELTAS = [-2, -1, 1, 2];

export interface StatOption {
  id: string;
  label: string;
  categoryLabel: string;
}

export interface Draft {
  name: string;
  description: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'interval';
  intervalDays: number;
  dayOfWeek: number;
  dayOfMonth: number;
  startDate: string;
  endDate: string;
  startImmediately: boolean;
  stats: { statId: string; delta: number }[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function emptyDraft(): Draft {
  return {
    name: '',
    description: '',
    cadence: 'weekly',
    intervalDays: 7,
    dayOfWeek: 1,
    dayOfMonth: 1,
    // Defaults to today so a rule created now is immediately schedulable.
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    startImmediately: false,
    stats: [],
  };
}

/** Strip the UI-only fields the API doesn't want for the chosen cadence. */
export function toPayload(draft: Draft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    cadence: draft.cadence,
    intervalDays: draft.cadence === 'interval' ? Number(draft.intervalDays) : null,
    dayOfWeek: draft.cadence === 'weekly' ? Number(draft.dayOfWeek) : null,
    dayOfMonth: draft.cadence === 'monthly' ? Number(draft.dayOfMonth) : null,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    startImmediately: draft.startImmediately,
    stats: draft.stats,
  };
}

/**
 * Create/edit form for an automatic stat rule, shared by the admin builder and
 * the crew's "propose a rule" flow — the shape is identical, only what happens
 * on submit differs.
 */
export default function RuleForm({
  draft,
  setDraft,
  statOptions,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  statOptions: StatOption[];
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [statToAdd, setStatToAdd] = useState('');

  const chosen = new Set(draft.stats.map((s) => s.statId));
  const available = statOptions.filter((o) => !chosen.has(o.id));
  const groups = useMemo(
    () => Array.from(new Set(available.map((o) => o.categoryLabel))),
    [available]
  );
  const labelFor = (id: string) => statOptions.find((o) => o.id === id)?.label ?? 'Unknown stat';

  const addStat = () => {
    if (!statToAdd) return;
    setDraft({ ...draft, stats: [...draft.stats, { statId: statToAdd, delta: 1 }] });
    setStatToAdd('');
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Name
        </label>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })}
          placeholder="Gym 3x a week"
          className="field"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          What it's for <span className="font-normal">(optional)</span>
        </label>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value.slice(0, 400) })}
          placeholder="Who this is for and what they have to keep doing to stay qualified."
          rows={3}
          className="field resize-y"
        />
      </div>

      {/* ---- Stats and their deltas ---- */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Stats this changes
        </label>

        {draft.stats.length > 0 && (
          <div className="space-y-2 mb-2">
            {draft.stats.map((s, i) => (
              <div key={s.statId} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-sm text-white truncate">{labelFor(s.statId)}</span>
                <select
                  value={s.delta}
                  onChange={(e) => {
                    const next = [...draft.stats];
                    next[i] = { ...s, delta: Number(e.target.value) };
                    setDraft({ ...draft, stats: next });
                  }}
                  className="field w-24 py-2 shrink-0"
                >
                  {ALLOWED_DELTAS.map((d) => (
                    <option key={d} value={d}>
                      {d > 0 ? `+${d}` : d}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, stats: draft.stats.filter((x) => x.statId !== s.statId) })}
                  className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
                  aria-label={`Remove ${labelFor(s.statId)}`}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <select value={statToAdd} onChange={(e) => setStatToAdd(e.target.value)} className="field py-2">
            <option value="">Add a stat…</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {available
                  .filter((o) => o.categoryLabel === g)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <button type="button" onClick={addStat} disabled={!statToAdd} className="btn-ghost py-2 shrink-0">
            <PlusIcon size={14} /> Add
          </button>
        </div>
      </div>

      {/* ---- Cadence ---- */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            How often
          </label>
          <select
            value={draft.cadence}
            onChange={(e) => setDraft({ ...draft, cadence: e.target.value as Draft['cadence'] })}
            className="field"
          >
            <option value="daily">Every day</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="interval">Every N days</option>
          </select>
        </div>

        {draft.cadence === 'weekly' && (
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              On
            </label>
            <select
              value={draft.dayOfWeek}
              onChange={(e) => setDraft({ ...draft, dayOfWeek: Number(e.target.value) })}
              className="field"
            >
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {draft.cadence === 'monthly' && (
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Day of month
            </label>
            <select
              value={draft.dayOfMonth}
              onChange={(e) => setDraft({ ...draft, dayOfMonth: Number(e.target.value) })}
              className="field"
            >
              {/* Capped at 28 so every month has the day — no skipped Februaries. */}
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {draft.cadence === 'interval' && (
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Every how many days
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={draft.intervalDays}
              onChange={(e) => setDraft({ ...draft, intervalDays: Number(e.target.value) })}
              className="field"
            />
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Starts
          </label>
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            className="field"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Ends <span className="font-normal">(optional)</span>
          </label>
          <input
            type="date"
            value={draft.endDate}
            onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
            className="field"
          />
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.startImmediately}
          onChange={(e) => setDraft({ ...draft, startImmediately: e.target.checked })}
          className="mt-0.5 w-4 h-4 shrink-0 accent-cyan-400"
        />
        <span className="text-sm text-white">
          Apply the first change straight away
          <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Otherwise qualifying starts the clock and the first change lands one full interval later.
          </span>
        </span>
      </label>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSubmit} disabled={busy} className="btn-gradient">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

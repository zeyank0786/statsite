'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { getCategoryMeta, orderCategories, orderStats } from '@/lib/categories';
import { fuzzyRank } from '@/lib/fuzzy';
import LockBadge from '@/components/LockBadge';
import { CheckIcon, SearchIcon } from '@/components/icons';

/**
 * One searchable stat picker, used everywhere a stat is chosen.
 *
 * There were three separate implementations of this — the suggest flow, "add a
 * stat they missed", and the stat reference sheet — each re-deriving the
 * category grouping and none of them searchable. With 70 stats across 7
 * categories, hunting for "Discipline" meant scrolling past sixty things you
 * didn't want.
 *
 * Search is subsequence matching over label, code and category name, so "disc"
 * finds Discipline, "mtl" narrows to Mentality, and "phyc" jumps straight to
 * that one stat. With an empty query the canonical category grouping is shown
 * intact, because browsing by category is how people who already know the
 * sheet navigate it.
 */

export interface PickableStat {
  id: string;
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
  /** Current value, shown as context when known. */
  value?: number;
  locked?: boolean;
  lockSource?: 'override' | 'rules' | null;
  lockReasons?: unknown[];
}

export default function StatPicker({
  stats,
  selectedIds,
  onToggle,
  disabledIds,
  trailing,
  autoFocus = false,
  placeholder = 'Search stats…',
  emptyLabel = 'No stats match that.',
}: {
  stats: PickableStat[];
  /** Currently chosen stat ids. Single-select callers pass 0 or 1. */
  selectedIds: string[];
  onToggle: (statId: string) => void;
  /** Stats that may not be chosen (already on the suggestion, say). */
  disabledIds?: string[];
  /** Optional control rendered under a selected stat — e.g. delta buttons. */
  trailing?: (stat: PickableStat) => ReactNode;
  autoFocus?: boolean;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const disabled = useMemo(() => new Set(disabledIds || []), [disabledIds]);

  /**
   * Searching flattens the list into one ranked run — grouping while filtering
   * would leave a column of near-empty category headings. With no query the
   * canonical order is preserved.
   */
  const searching = query.trim().length > 0;

  const ranked = useMemo(() => {
    if (!searching) return [];
    return fuzzyRank(stats, query, (s) => `${s.label} ${s.code} ${s.categoryLabel}`)
      .slice(0, 40)
      .map((r) => r.item);
  }, [stats, query, searching]);

  const grouped = useMemo(() => {
    if (searching) return [];
    const byCat = new Map<string, PickableStat[]>();
    for (const s of stats) {
      if (!byCat.has(s.categoryCode)) byCat.set(s.categoryCode, []);
      byCat.get(s.categoryCode)!.push(s);
    }
    return orderCategories(
      [...byCat.entries()].map(([code, items]) => ({ code, items }))
    ).map((c) => ({ ...c, items: orderStats(c.items) }));
  }, [stats, searching]);

  const Row = ({ stat }: { stat: PickableStat }) => {
    const meta = getCategoryMeta(stat.categoryCode, stat.categoryLabel);
    const isSelected = selected.has(stat.id);
    const isDisabled = Boolean(stat.locked) || disabled.has(stat.id);

    return (
      <div>
        <button
          type="button"
          onClick={() => !isDisabled && onToggle(stat.id)}
          disabled={isDisabled}
          aria-pressed={isSelected}
          className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left transition ${
            isDisabled
              ? 'opacity-50 cursor-not-allowed'
              : isSelected
              ? 'text-white'
              : 'text-neutral-300 hover:text-white'
          }`}
          style={{
            borderColor: isSelected ? meta.hex : 'var(--surface-border)',
            background: isSelected ? `${meta.hex}18` : 'rgba(255,255,255,0.02)',
          }}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium truncate">{stat.label}</span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: meta.hex }}
            >
              {/* When searching, the category is no longer implied by a heading. */}
              {searching ? `${meta.short} · ` : ''}
              {stat.code}
              {stat.value !== undefined ? ` · now ${stat.value}` : ''}
            </span>
          </span>
          <span className="shrink-0 flex items-center gap-1.5">
            {stat.locked ? (
              <LockBadge
                reasons={stat.lockReasons as never}
                source={stat.lockSource as never}
                statLabel={stat.label}
              />
            ) : isSelected ? (
              <span style={{ color: meta.hex }}>
                <CheckIcon size={16} />
              </span>
            ) : null}
          </span>
        </button>
        {isSelected && trailing ? <div className="mt-2">{trailing(stat)}</div> : null}
      </div>
    );
  };

  return (
    <div>
      <div className="relative mb-3">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-secondary)' }}
        >
          <SearchIcon size={15} />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation(); // don't also close the surrounding modal
              setQuery('');
            }
          }}
          placeholder={placeholder}
          aria-label="Search stats"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none focus:border-neutral-500 transition"
          style={{ borderColor: 'var(--surface-border)' }}
        />
      </div>

      {searching ? (
        ranked.length === 0 ? (
          <p className="text-sm py-3" style={{ color: 'var(--text-secondary)' }}>
            {emptyLabel}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ranked.map((stat) => (
              <Row key={stat.id} stat={stat} />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {grouped.map((cat) => {
            const meta = getCategoryMeta(cat.code, cat.items[0]?.categoryLabel);
            return (
              <div key={cat.code}>
                <p
                  className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                  style={{ color: meta.hex }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.hex }} />
                  {cat.items[0]?.categoryLabel || cat.code}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cat.items.map((stat) => (
                    <Row key={stat.id} stat={stat} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

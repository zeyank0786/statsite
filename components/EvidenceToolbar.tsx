'use client';

import { useState } from 'react';
import Avatar from './Avatar';
import { getCategoryMeta } from '@/lib/categories';
import { EvidencePrefs, EvidenceView, EvidenceSort, MediaFilter, activeFilterCount, DEFAULT_PREFS } from '@/lib/evidencePrefs';
import { CategoryOption, EvidencePlayer } from '@/lib/evidenceTypes';
import { ListIcon, GridIcon, ColumnsIcon, FilterIcon, SearchIcon, XIcon, CheckIcon } from './icons';

/**
 * View switcher + collapsible filter panel for the evidence board.
 * Every control writes straight through to persisted prefs, so the board
 * looks the way each person left it.
 */
export default function EvidenceToolbar({
  prefs,
  update,
  players,
  categories,
  shown,
  total,
}: {
  prefs: EvidencePrefs;
  update: (patch: Partial<EvidencePrefs>) => void;
  players: EvidencePlayer[];
  categories: CategoryOption[];
  shown: number;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const filterCount = activeFilterCount(prefs);

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const views: { key: EvidenceView; label: string; Icon: any }[] = [
    { key: 'feed', label: 'Feed', Icon: ListIcon },
    { key: 'grid', label: 'Grid', Icon: GridIcon },
    { key: 'columns', label: 'Columns', Icon: ColumnsIcon },
  ];

  return (
    <div className="mb-5">
      {/* Primary row: view switcher + filter/sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl border" style={{ borderColor: 'var(--surface-border)' }}>
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => update({ view: v.key })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                prefs.view === v.key ? 'text-white' : 'text-neutral-400 hover:text-white'
              }`}
              style={prefs.view === v.key ? { background: 'rgba(249,115,22,0.25)' } : {}}
              title={`${v.label} view`}
            >
              <v.Icon size={15} />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setOpen(!open)}
          className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition ${
            filterCount > 0 || open ? 'text-white' : 'text-neutral-300 hover:text-white'
          }`}
          style={{
            borderColor: filterCount > 0 ? 'rgba(249,115,22,0.6)' : 'var(--surface-border)',
            background: filterCount > 0 ? 'rgba(249,115,22,0.12)' : 'transparent',
          }}
        >
          <FilterIcon size={15} />
          Filter
          {filterCount > 0 && (
            <span
              className="min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={{ background: 'var(--accent-orange)', color: '#1a1005' }}
            >
              {filterCount}
            </span>
          )}
        </button>

        <select
          value={prefs.sort}
          onChange={(e) => update({ sort: e.target.value as EvidenceSort })}
          className="field w-auto py-2 text-sm"
          title="Sort order"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="cited">Most cited</option>
        </select>

        <button
          onClick={() => update({ compact: !prefs.compact })}
          className={`px-3 py-2 rounded-xl text-sm font-semibold border transition ${
            prefs.compact ? 'text-white' : 'text-neutral-400 hover:text-white'
          }`}
          style={{
            borderColor: prefs.compact ? 'rgba(249,115,22,0.6)' : 'var(--surface-border)',
            background: prefs.compact ? 'rgba(249,115,22,0.12)' : 'transparent',
          }}
          title="Smaller media, trimmed captions"
        >
          Compact
        </button>

        <span className="text-xs ml-auto shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {shown === total ? `${total} post${total !== 1 ? 's' : ''}` : `${shown} of ${total}`}
        </span>
      </div>

      {/* Filter panel */}
      {open && (
        <div className="glass card-shadow p-4 mt-3 animate-rise space-y-4">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">
              <SearchIcon size={15} />
            </span>
            <input
              value={prefs.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder="Search captions…"
              className="field pl-9 text-sm"
            />
            {prefs.search && (
              <button
                onClick={() => update({ search: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          {/* Players */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              Who posted
            </p>
            <div className="flex flex-wrap gap-1.5">
              {players.map((p) => {
                const on = prefs.playerIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => update({ playerIds: toggleIn(prefs.playerIds, p.id) })}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                      on ? 'text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                    style={{
                      borderColor: on ? 'rgba(249,115,22,0.6)' : 'var(--surface-border)',
                      background: on ? 'rgba(249,115,22,0.12)' : 'transparent',
                    }}
                  >
                    <Avatar id={p.id} name={p.username} size={18} />
                    {p.username}
                    {on && <CheckIcon size={12} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categories */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              Category
            </p>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const meta = getCategoryMeta(cat.code, cat.label);
                const on = prefs.categoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => update({ categoryIds: toggleIn(prefs.categoryIds, cat.id) })}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border transition ${
                      on ? 'text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                    style={
                      on
                        ? { background: `${meta.hex}30`, borderColor: `${meta.hex}90` }
                        : { borderColor: 'var(--surface-border)' }
                    }
                  >
                    {meta.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media type + cited */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                Type
              </p>
              <div className="flex gap-1 p-1 rounded-xl border w-fit" style={{ borderColor: 'var(--surface-border)' }}>
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'photo', label: 'Photos' },
                    { key: 'video', label: 'Videos' },
                    { key: 'text', label: 'Text only' },
                  ] as { key: MediaFilter; label: string }[]
                ).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => update({ media: m.key })}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      prefs.media === m.key ? 'text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                    style={prefs.media === m.key ? { background: 'rgba(249,115,22,0.25)' } : {}}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => update({ citedOnly: !prefs.citedOnly })}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                prefs.citedOnly ? 'text-white' : 'text-neutral-400 hover:text-white'
              }`}
              style={{
                borderColor: prefs.citedOnly ? 'rgba(168,85,247,0.6)' : 'var(--surface-border)',
                background: prefs.citedOnly ? 'rgba(168,85,247,0.15)' : 'transparent',
              }}
            >
              Cited by a suggestion
            </button>

            {filterCount > 0 && (
              <button
                onClick={() =>
                  update({
                    playerIds: [],
                    categoryIds: [],
                    media: DEFAULT_PREFS.media,
                    citedOnly: false,
                    search: '',
                  })
                }
                className="btn-ghost text-xs py-2 ml-auto"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

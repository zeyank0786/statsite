'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { getCategoryMeta, categoryCodeOfStat } from '@/lib/categories';
import { TrendUpIcon, TrendDownIcon } from '@/components/icons';

interface HistoryEntry {
  id: string;
  playerName: string;
  statLabel: string;
  statCode: string;
  oldValue: number;
  newValue: number;
  reason: string;
  source: string;
  changedAt: string;
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  admin_edit: { label: 'Admin edit', color: 'var(--accent-cyan)' },
  suggestion: { label: 'Suggestion', color: 'var(--accent-purple)' },
  review_cycle: { label: 'Review', color: 'var(--accent-orange)' },
};

export default function HistoryPage() {
  const { status } = useSession();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerFilter, setPlayerFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadHistory();
    }
  }, [status, router]);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const results = await res.json();
      setHistory(Array.isArray(results) ? results : []);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell width="narrow">
        <PageHeader title="Stat History" eyebrow="Timeline" eyebrowColor="var(--accent-orange)" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  const players = Array.from(new Set(history.map((h) => h.playerName)));
  const filtered = history.filter(
    (h) =>
      (!playerFilter || h.playerName === playerFilter) &&
      (!sourceFilter || h.source === sourceFilter)
  );

  return (
    <AppShell width="narrow">
      <PageHeader
        title="Stat History"
        subtitle="Every change, who made it, and why."
        eyebrow="Timeline"
        eyebrowColor="var(--accent-orange)"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <FilterPill active={!playerFilter} onClick={() => setPlayerFilter(null)}>
          All players
        </FilterPill>
        {players.map((p) => (
          <FilterPill key={p} active={playerFilter === p} onClick={() => setPlayerFilter(p)}>
            {p}
          </FilterPill>
        ))}
        <span className="w-px self-stretch mx-1" style={{ background: 'var(--surface-border)' }} />
        <FilterPill active={!sourceFilter} onClick={() => setSourceFilter(null)}>
          All sources
        </FilterPill>
        {Object.entries(SOURCE_META).map(([key, meta]) => (
          <FilterPill key={key} active={sourceFilter === key} onClick={() => setSourceFilter(key)} color={meta.color}>
            {meta.label}
          </FilterPill>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass text-center py-16">
          <p style={{ color: 'var(--text-secondary)' }}>
            {history.length === 0 ? 'No stat changes yet.' : 'Nothing matches those filters.'}
          </p>
        </div>
      ) : (
        <div className="relative pl-5">
          {/* timeline spine */}
          <div className="absolute left-[5px] top-2 bottom-2 w-px" style={{ background: 'var(--surface-border)' }} />
          <div className="space-y-3">
            {filtered.map((entry) => {
              const source = SOURCE_META[entry.source] || { label: entry.source, color: 'var(--accent-cyan)' };
              const isIncrease = entry.newValue > entry.oldValue;
              const catMeta = getCategoryMeta(categoryCodeOfStat(entry.statCode));

              return (
                <div key={entry.id} className="relative">
                  <span
                    className="absolute -left-[19px] top-5 w-2.5 h-2.5 rounded-full border-2"
                    style={{ background: 'var(--background)', borderColor: source.color }}
                  />
                  <div className="glass glass-hover card-shadow p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-white font-semibold text-sm">{entry.playerName}</h3>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{ background: `color-mix(in srgb, ${source.color} 15%, transparent)`, color: source.color }}
                          >
                            {source.label}
                          </span>
                          <span className="text-[10px] ml-auto sm:hidden" style={{ color: 'var(--text-secondary)' }}>
                            {new Date(entry.changedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-white">{entry.statLabel}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wider mt-0.5" style={{ color: catMeta.hex }}>
                          {entry.statCode}
                        </p>
                        {entry.reason && (
                          <p className="text-xs italic mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                            "{entry.reason}"
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div
                          className="flex items-center gap-2.5 rounded-xl px-4 py-2 border"
                          style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
                        >
                          <span className="text-lg font-bold text-neutral-400">{entry.oldValue}</span>
                          <span style={{ color: isIncrease ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {isIncrease ? <TrendUpIcon size={16} /> : <TrendDownIcon size={16} />}
                          </span>
                          <span
                            className="text-lg font-bold"
                            style={{ color: isIncrease ? 'var(--accent-green)' : 'var(--accent-red)' }}
                          >
                            {entry.newValue}
                          </span>
                        </div>
                        <span className="text-xs hidden sm:block w-20 text-right" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(entry.changedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function FilterPill({
  children,
  active,
  onClick,
  color = 'var(--accent-cyan)',
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
        active ? 'text-white' : 'text-neutral-400 hover:text-white'
      }`}
      style={
        active
          ? { background: `color-mix(in srgb, ${color} 20%, transparent)`, borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }
          : { borderColor: 'var(--surface-border)' }
      }
    >
      {children}
    </button>
  );
}

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { getCategoryMeta } from '@/lib/categories';
import { PlusIcon, TrendUpIcon, TrendDownIcon, CheckIcon, XIcon } from '@/components/icons';

interface Suggestion {
  id: string;
  playerId: string;
  playerName: string;
  statCode: string;
  statLabel: string;
  reason: string;
  suggestedNewValue: number;
  currentValue: number;
  yesVotes: number;
  noVotes: number;
  status: string;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  approved: { label: 'Approved', color: 'var(--accent-green)' },
  rejected: { label: 'Rejected', color: 'var(--accent-red)' },
  pending: { label: 'Pending', color: 'var(--accent-orange)' },
};

export default function SuggestionsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadSuggestions();
    }
  }, [status, router]);

  const loadSuggestions = async () => {
    try {
      const res = await fetch('/api/suggestions');
      const results = await res.json();
      setSuggestions(Array.isArray(results) ? results : []);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (suggestionId: string, vote: 'yes' | 'no') => {
    try {
      const res = await fetch(`/api/suggestions/${suggestionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }),
      });
      if (res.ok) loadSuggestions();
    } catch (error) {
      console.error('Failed to vote:', error);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell width="narrow">
        <PageHeader title="Suggestions" eyebrow="Crew Votes" eyebrowColor="var(--accent-purple)" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <PageHeader
        title="Suggestions"
        subtitle="Propose stat changes — the crew votes."
        eyebrow="Crew Votes"
        eyebrowColor="var(--accent-purple)"
        actions={
          <Link href="/suggestions/new" className="btn-gradient text-sm">
            <PlusIcon size={16} />
            New suggestion
          </Link>
        }
      />

      {suggestions.length === 0 ? (
        <div className="glass card-shadow text-center py-16 px-6">
          <p className="text-lg mb-5" style={{ color: 'var(--text-secondary)' }}>
            No suggestions yet. Be the first to propose a change.
          </p>
          <Link href="/suggestions/new" className="btn-gradient inline-flex">
            <PlusIcon size={16} />
            Create suggestion
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => {
            const statusMeta = STATUS_META[suggestion.status] || STATUS_META.pending;
            const diff = suggestion.suggestedNewValue - suggestion.currentValue;
            const isIncrease = diff > 0;
            const catMeta = getCategoryMeta(suggestion.statCode?.split('-')[0]);

            return (
              <article key={suggestion.id} className="glass glass-hover card-shadow p-5">
                <div className="flex flex-col md:flex-row gap-5 md:items-center">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-display text-lg font-bold text-white">{suggestion.playerName}</h3>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          background: `color-mix(in srgb, ${statusMeta.color} 15%, transparent)`,
                          color: statusMeta.color,
                        }}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <p className="text-sm text-white font-medium">{suggestion.statLabel}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider mt-0.5" style={{ color: catMeta.hex }}>
                      {suggestion.statCode}
                    </p>
                    <p className="text-sm italic mt-2" style={{ color: 'var(--text-secondary)' }}>
                      "{suggestion.reason}"
                    </p>
                  </div>

                  {/* Change */}
                  <div
                    className="flex items-center justify-center gap-3 rounded-xl px-5 py-3 border shrink-0"
                    style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
                  >
                    <span className="text-2xl font-bold text-neutral-400">{suggestion.currentValue}</span>
                    <span style={{ color: isIncrease ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {isIncrease ? <TrendUpIcon size={18} /> : <TrendDownIcon size={18} />}
                    </span>
                    <span
                      className="text-2xl font-bold"
                      style={{ color: isIncrease ? 'var(--accent-green)' : 'var(--accent-red)' }}
                    >
                      {suggestion.suggestedNewValue}
                    </span>
                  </div>

                  {/* Votes */}
                  {suggestion.status === 'pending' && (
                    <div className="flex md:flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleVote(suggestion.id, 'yes')}
                        className="flex-1 md:flex-none px-4 py-2 rounded-xl text-sm font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition flex items-center justify-center gap-1.5"
                      >
                        <CheckIcon size={14} /> Yes · {suggestion.yesVotes}
                      </button>
                      <button
                        onClick={() => handleVote(suggestion.id, 'no')}
                        className="flex-1 md:flex-none px-4 py-2 rounded-xl text-sm font-semibold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition flex items-center justify-center gap-1.5"
                      >
                        <XIcon size={14} /> No · {suggestion.noVotes}
                      </button>
                    </div>
                  )}
                  {suggestion.status !== 'pending' && (
                    <div className="text-xs text-right shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      {suggestion.yesVotes} yes · {suggestion.noVotes} no
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { ChevronLeftIcon, MinusIcon, PlusIcon, CheckIcon } from '@/components/icons';

interface Player {
  id: string;
  username: string;
}

interface Stat {
  id: string;
  code: string;
  label: string;
}

export default function NewSuggestionPage() {
  const { status } = useSession();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selectedStat, setSelectedStat] = useState('');
  const [change, setChange] = useState<'increase' | 'decrease'>('increase');
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadPlayers();
    }
  }, [status, router]);

  const loadPlayers = async () => {
    try {
      const res = await fetch('/api/players');
      const result = await res.json();
      setPlayers(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error('Failed to load players:', error);
    }
  };

  const loadStats = async (playerId: string) => {
    try {
      const res = await fetch(`/api/players/${playerId}`);
      if (res.ok) {
        const data = await res.json();
        const allStats: Stat[] = [];
        data.categories.forEach((cat: any) => {
          cat.stats.forEach((stat: any) => {
            allStats.push({ id: stat.id, code: stat.code, label: stat.label });
          });
        });
        setStats(allStats);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handlePlayerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const playerId = e.target.value;
    setSelectedPlayer(playerId);
    setSelectedStat('');
    if (playerId) loadStats(playerId);
    else setStats([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!selectedPlayer || !selectedStat || !reason.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const stat = stats.find((s) => s.code === selectedStat);
      if (!stat) {
        setError('Stat not found');
        return;
      }

      const playerRes = await fetch(`/api/players/${selectedPlayer}`);
      const playerData = await playerRes.json();
      let currentValue = 5;
      playerData.categories.forEach((cat: any) => {
        const foundStat = cat.stats.find((s: any) => s.code === selectedStat);
        if (foundStat) currentValue = foundStat.value;
      });

      const suggestedValue = change === 'increase' ? currentValue + amount : currentValue - amount;
      if (suggestedValue < 0 || suggestedValue > 10) {
        setError('Suggested value must be between 0 and 10');
        return;
      }

      const res = await fetch('/api/suggestions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: selectedPlayer,
          statCode: selectedStat,
          suggestedNewValue: suggestedValue,
          reason: reason.trim(),
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setSelectedPlayer('');
        setSelectedStat('');
        setReason('');
        setAmount(1);
        setTimeout(() => router.push('/suggestions'), 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create suggestion');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell width="narrow">
      <Link
        href="/suggestions"
        className="inline-flex items-center gap-1 text-sm font-medium mb-5 hover:underline"
        style={{ color: 'var(--accent-cyan)' }}
      >
        <ChevronLeftIcon size={15} />
        All suggestions
      </Link>

      <PageHeader
        title="New Suggestion"
        subtitle="Propose a stat change for a teammate — the crew decides."
        eyebrow="Crew Votes"
        eyebrowColor="var(--accent-purple)"
      />

      <div className="glass card-shadow p-6 md:p-8 animate-rise">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Player</label>
            <select value={selectedPlayer} onChange={handlePlayerChange} className="field" required>
              <option value="">Choose a player...</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">Stat</label>
            <select
              value={selectedStat}
              onChange={(e) => setSelectedStat(e.target.value)}
              className="field"
              required
              disabled={!selectedPlayer}
            >
              <option value="">Choose a stat...</option>
              {stats.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.label} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">Proposed change</label>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setChange('decrease')}
                className={`flex-1 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-1.5 border ${
                  change === 'decrease'
                    ? 'text-red-300 border-red-500/60 bg-red-500/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
                style={change !== 'decrease' ? { borderColor: 'var(--surface-border)' } : {}}
              >
                <MinusIcon size={16} /> Decrease
              </button>
              <select
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="field flex-1 text-center"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    By {n}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setChange('increase')}
                className={`flex-1 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-1.5 border ${
                  change === 'increase'
                    ? 'text-emerald-300 border-emerald-500/60 bg-emerald-500/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
                style={change !== 'increase' ? { borderColor: 'var(--surface-border)' } : {}}
              >
                <PlusIcon size={16} /> Increase
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="field resize-none"
              rows={4}
              placeholder="Why is this change warranted? Bring receipts."
              required
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 flex items-center gap-2">
              <CheckIcon size={15} /> Suggestion created! Redirecting...
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-gradient flex-1">
              {loading ? 'Submitting...' : 'Submit suggestion'}
            </button>
            <Link href="/suggestions" className="btn-ghost">
              Cancel
            </Link>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--surface-border)' }}>
          <h3 className="text-sm font-semibold text-white mb-3">How it works</h3>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {[
              'Submit a suggestion with a reason',
              'Minimum 3 valid votes required to pass',
              'Vote period: 30 seconds',
              'The target player and the suggester cannot vote',
              'More yes than no votes = approved',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span style={{ color: 'var(--accent-cyan)' }} className="mt-0.5 shrink-0">
                  <CheckIcon size={14} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

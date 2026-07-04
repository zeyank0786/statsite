'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

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
      setPlayers(result);
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
    if (playerId) {
      loadStats(playerId);
    } else {
      setStats([]);
    }
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
      const stat = stats.find(s => s.code === selectedStat);
      if (!stat) {
        setError('Stat not found');
        return;
      }

      // Get current value
      const playerRes = await fetch(`/api/players/${selectedPlayer}`);
      const playerData = await playerRes.json();
      let currentValue = 5;
      playerData.categories.forEach((cat: any) => {
        const foundStat = cat.stats.find((s: any) => s.code === selectedStat);
        if (foundStat) {
          currentValue = foundStat.value;
        }
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
          reason: reason.trim()
        })
      });

      if (res.ok) {
        setSuccess(true);
        setSelectedPlayer('');
        setSelectedStat('');
        setReason('');
        setAmount(1);
        setTimeout(() => {
          router.push('/suggestions');
        }, 2000);
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
    <div className="min-h-screen">
      {/* Header with gradient accent */}
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur sticky top-0 z-40">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-pink))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/suggestions" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Suggestions
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold" style={{ color: 'var(--foreground)' }}>💡 New Suggestion</h1>
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-orange-900/30 border border-orange-800" style={{ color: 'var(--accent-orange)' }}>
              WIP
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Propose a stat change for a teammate</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Select Player
              </label>
              <select
                value={selectedPlayer}
                onChange={handlePlayerChange}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 hover:border-neutral-600 rounded-xl text-white focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition"
                required
              >
                <option value="">Choose a player...</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.username}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Select Stat
              </label>
              <select
                value={selectedStat}
                onChange={(e) => setSelectedStat(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 hover:border-neutral-600 rounded-xl text-white focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition"
                required
                disabled={!selectedPlayer}
              >
                <option value="">Choose a stat...</option>
                {stats.map(s => (
                  <option key={s.id} value={s.code}>{s.label} ({s.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Proposed Change
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setChange('decrease')}
                  className="px-6 py-3 text-white rounded-xl font-semibold transition flex-1"
                  style={{
                    backgroundColor: change === 'decrease' ? 'var(--accent-red)' : 'var(--accent-red)',
                    opacity: change === 'decrease' ? 1 : 0.5
                  }}
                >
                  − Decrease
                </button>
                <select
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-neutral-600 transition"
                >
                  <option value={1}>By 1</option>
                  <option value={2}>By 2</option>
                  <option value={3}>By 3</option>
                  <option value={4}>By 4</option>
                  <option value={5}>By 5</option>
                </select>
                <button
                  type="button"
                  onClick={() => setChange('increase')}
                  className="px-6 py-3 text-white rounded-xl font-semibold transition flex-1"
                  style={{
                    backgroundColor: change === 'increase' ? 'var(--accent-green)' : 'var(--accent-green)',
                    opacity: change === 'increase' ? 1 : 0.5
                  }}
                >
                  + Increase
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Reason (required)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 hover:border-neutral-600 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 resize-none transition"
                rows={4}
                placeholder="Why do you think this change is warranted?"
                required
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-900/30 border border-green-800 text-green-400 px-4 py-3 rounded-xl text-sm">
                ✓ Suggestion created successfully! Redirecting...
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 text-white font-semibold py-3 px-6 rounded-xl transition disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-purple)' }}
              >
                {loading ? 'Submitting...' : 'Submit Suggestion'}
              </button>
              <Link
                href="/suggestions"
                className="px-6 py-3 bg-neutral-800 border border-neutral-700 hover:border-neutral-600 text-white font-semibold rounded-xl transition"
              >
                Cancel
              </Link>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t border-neutral-700">
            <h3 className="text-sm font-semibold text-white mb-4">📝 How Suggestions Work</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span style={{ color: 'var(--accent-cyan)' }} className="font-bold flex-shrink-0">✓</span>
                <span style={{ color: 'var(--text-secondary)' }}>Submit a suggestion with a reason</span>
              </li>
              <li className="flex items-start gap-3">
                <span style={{ color: 'var(--accent-cyan)' }} className="font-bold flex-shrink-0">✓</span>
                <span style={{ color: 'var(--text-secondary)' }}>Minimum 3 valid votes required to pass</span>
              </li>
              <li className="flex items-start gap-3">
                <span style={{ color: 'var(--accent-cyan)' }} className="font-bold flex-shrink-0">✓</span>
                <span style={{ color: 'var(--text-secondary)' }}>Vote period: 30 seconds</span>
              </li>
              <li className="flex items-start gap-3">
                <span style={{ color: 'var(--accent-cyan)' }} className="font-bold flex-shrink-0">✓</span>
                <span style={{ color: 'var(--text-secondary)' }}>Excluded voters: target player, suggester</span>
              </li>
              <li className="flex items-start gap-3">
                <span style={{ color: 'var(--accent-cyan)' }} className="font-bold flex-shrink-0">✓</span>
                <span style={{ color: 'var(--text-secondary)' }}>More yes votes than no votes = approved</span>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

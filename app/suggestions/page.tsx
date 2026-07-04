'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function SuggestionsPage() {
  const { data: session, status } = useSession();
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
      setSuggestions(results);
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
        body: JSON.stringify({ vote })
      });

      if (res.ok) {
        loadSuggestions();
      } else {
        const data = await res.json();
        console.error('Failed to vote:', data.error);
      }
    } catch (error) {
      console.error('Failed to vote:', error);
    }
  };

  const getStatusAccent = (status: string) => {
    switch (status) {
      case 'approved':
        return 'var(--accent-green)';
      case 'rejected':
        return 'var(--accent-red)';
      default:
        return 'var(--accent-orange)';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return '✅ Approved';
      case 'rejected':
        return '❌ Rejected';
      default:
        return '⏳ Pending';
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header with gradient accent */}
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur sticky top-0 z-40">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-cyan), var(--accent-pink))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Dashboard
          </Link>
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold" style={{ color: 'var(--foreground)' }}>💡 Suggestions</h1>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-orange-900/30 border border-orange-800" style={{ color: 'var(--accent-orange)' }}>
                  WIP
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)' }}>Community-driven stat changes</p>
            </div>
            <Link
              href="/suggestions/new"
              className="text-white font-semibold py-3 px-8 rounded-xl transition flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-purple)' }}
            >
              + New Suggestion
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {suggestions.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">💭</div>
            <p className="text-lg mb-6" style={{ color: 'var(--text-secondary)' }}>No suggestions yet. Be the first to propose a change!</p>
            <Link
              href="/suggestions/new"
              className="text-white font-semibold py-3 px-8 rounded-xl inline-block transition"
              style={{ backgroundColor: 'var(--accent-purple)' }}
            >
              Create Suggestion
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {suggestions.map((suggestion) => {
              const statusColor = getStatusAccent(suggestion.status);
              const diff = suggestion.suggestedNewValue - suggestion.currentValue;
              const isIncrease = diff > 0;

              return (
                <div
                  key={suggestion.id}
                  className="group bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 transition card-shadow"
                >
                  <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                    {/* Left: Player & Stat Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusColor }} />
                        <h3 className="text-xl font-bold text-white">
                          {suggestion.playerName}
                        </h3>
                      </div>
                      <p className="text-sm text-white font-medium mb-1">
                        {suggestion.statLabel}
                      </p>
                      <p className="text-xs font-mono mb-3" style={{ color: 'var(--text-secondary)' }}>
                        {suggestion.statCode}
                      </p>
                      <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>
                        "{suggestion.reason}"
                      </p>
                    </div>

                    {/* Center: Stat Change */}
                    <div className="bg-neutral-800/50 rounded-xl p-5 text-center min-w-max">
                      <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Change</p>
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Current</p>
                          <p className="text-2xl font-bold text-white">
                            {suggestion.currentValue}
                          </p>
                        </div>
                        <div className="text-xl" style={{ color: isIncrease ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {isIncrease ? '↑' : '↓'}
                        </div>
                        <div>
                          <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Proposed</p>
                          <p className="text-2xl font-bold" style={{ color: statusColor }}>
                            {suggestion.suggestedNewValue}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Right: Votes & Status */}
                    <div className="flex flex-col items-start md:items-end gap-3 min-w-max w-full md:w-auto">
                      <div className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ backgroundColor: statusColor }}>
                        {getStatusLabel(suggestion.status)}
                      </div>

                      {suggestion.status === 'pending' && (
                        <div className="space-y-3 w-full md:w-auto">
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleVote(suggestion.id, 'yes')}
                              className="flex-1 md:flex-none px-4 py-2 bg-green-900/30 border border-green-800 hover:border-green-700 text-green-400 font-semibold rounded-lg transition text-sm"
                            >
                              ✓ Yes
                            </button>
                            <button
                              onClick={() => handleVote(suggestion.id, 'no')}
                              className="flex-1 md:flex-none px-4 py-2 bg-red-900/30 border border-red-800 hover:border-red-700 text-red-400 font-semibold rounded-lg transition text-sm"
                            >
                              ✗ No
                            </button>
                          </div>
                          <div className="flex gap-6 justify-center md:justify-start">
                            <div className="text-center">
                              <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--accent-green)' }}>Yes</p>
                              <p className="text-2xl font-bold text-white">{suggestion.yesVotes}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--accent-red)' }}>No</p>
                              <p className="text-2xl font-bold text-white">{suggestion.noVotes}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

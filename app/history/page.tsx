'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function HistoryPage() {
  const { status } = useSession();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
      setHistory(results);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'admin_edit':
        return '⚙️ Admin Edit';
      case 'suggestion':
        return '💡 Suggestion';
      case 'review_cycle':
        return '📋 Review';
      default:
        return '📝 ' + source;
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'admin_edit':
        return 'var(--accent-cyan)';
      case 'suggestion':
        return 'var(--accent-purple)';
      case 'review_cycle':
        return 'var(--accent-orange)';
      default:
        return 'var(--accent-cyan)';
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
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-orange), var(--accent-green))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>📈 Stat History</h1>
          <p style={{ color: 'var(--text-secondary)' }}>All stat changes and updates</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {history.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>No stat changes yet. Start tracking changes to see them here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((entry) => {
              const sourceColor = getSourceColor(entry.source);
              const isIncrease = entry.newValue > entry.oldValue;

              return (
                <div
                  key={entry.id}
                  className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-5 transition card-shadow"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
                    {/* Left: Player & Stat */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sourceColor }} />
                        <h3 className="text-white font-bold">{entry.playerName}</h3>
                      </div>
                      <p className="text-sm text-white font-medium mb-1">
                        {entry.statLabel}
                      </p>
                      <p className="text-xs font-mono mb-2" style={{ color: 'var(--text-secondary)' }}>
                        {entry.statCode}
                      </p>
                      {entry.reason && (
                        <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>
                          "{entry.reason}"
                        </p>
                      )}
                    </div>

                    {/* Center: Value Change */}
                    <div className="flex items-center gap-4 bg-neutral-800/50 px-5 py-3 rounded-lg">
                      <div className="text-center">
                        <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Before</p>
                        <p className="text-2xl font-bold text-white">{entry.oldValue}</p>
                      </div>
                      <div className="text-lg" style={{ color: isIncrease ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {isIncrease ? '↑' : '↓'}
                      </div>
                      <div className="text-center">
                        <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>After</p>
                        <p className="text-2xl font-bold" style={{ color: sourceColor }}>
                          {entry.newValue}
                        </p>
                      </div>
                    </div>

                    {/* Right: Source & Date */}
                    <div className="text-right text-sm">
                      <div className="px-3 py-1 rounded-lg font-semibold mb-2 text-white text-xs" style={{ backgroundColor: sourceColor }}>
                        {getSourceLabel(entry.source)}
                      </div>
                      <p style={{ color: 'var(--text-secondary)' }}>
                        {new Date(entry.changedAt).toLocaleDateString()}
                      </p>
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

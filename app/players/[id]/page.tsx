'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StatDescriptionModal from '@/components/StatDescriptionModal';
import { STAT_DESCRIPTIONS } from '@/lib/statDescriptions';

interface Stat {
  id: string;
  code: string;
  label: string;
  value: number;
}

interface Category {
  code: string;
  label: string;
  stats: Stat[];
}

interface HistoryEntry {
  oldValue: number;
  newValue: number;
  code: string;
  label: string;
  createdAt: string;
  changedBy: string;
}

interface ReviewSession {
  id: string;
  createdAt: string;
  participantCount: number;
}

interface ComparisonPlayer {
  id: string;
  username: string;
}

export default function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = use(params);
  const { status, data: sessionData } = useSession();
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [email, setEmail] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallScore, setOverallScore] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [recentReviews, setRecentReviews] = useState<ReviewSession[]>([]);
  const [otherPlayers, setOtherPlayers] = useState<ComparisonPlayer[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [selectedComparison, setSelectedComparison] = useState<string>('');
  const [changes, setChanges] = useState<Record<string, any>>({});
  const [colorCodeEnabled, setColorCodeEnabled] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'total'>('default');
  const [sortAscending, setSortAscending] = useState(true);

  const categoryOrder = ['mtl', 'phy', 'kno', 'strs', 'stra', 'ski', 'enr'];

  const getOrderedCategories = () => {
    return [...categories].sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.code);
      const bIndex = categoryOrder.indexOf(b.code);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      return 0;
    });
  };

  const getSortedStats = (stats: any[]) => {
    if (sortBy === 'default') return stats;

    const sorted = [...stats];
    if (sortBy === 'name') {
      const nameSorted = sorted.sort((a, b) => a.label.localeCompare(b.label));
      return sortAscending ? nameSorted : nameSorted.reverse();
    } else if (sortBy === 'total') {
      return sorted.sort((a, b) => b.value - a.value);
    }
    return sorted;
  };

  const currentPlayerId = (sessionData?.user as any)?.playerId;
  const isOwnProfile = currentPlayerId === playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      loadPlayerData();
    }
  }, [status, router, playerId]);

  const loadPlayerData = async () => {
    try {
      const [profileRes, changesRes] = await Promise.all([
        fetch(`/api/players/${playerId}`),
        fetch(`/api/players/${playerId}/changes`),
      ]);

      if (!profileRes.ok) {
        router.push('/players');
        return;
      }

      const data = await profileRes.json();
      setPlayerName(data.player.username);
      setEmail(data.player.email || 'No email set');
      setCreatedAt(data.player.createdAt);
      setCategories(data.categories);
      setOverallScore(data.overallScore);
      setHistory(data.history || []);
      setRecentReviews(data.recentReviews || []);
      setOtherPlayers(data.otherPlayers || []);
      setNewName(data.player.username);

      if (changesRes.ok) {
        const changesData = await changesRes.json();
        const changesMap: Record<string, any> = {};
        changesData.forEach((change: any) => {
          changesMap[change.code] = change;
        });
        setChanges(changesMap);
      }
    } catch (error) {
      console.error('Failed to load player data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getValueColor = (value: number) => {
    if (value <= 3) return 'var(--accent-red)';
    if (value <= 7) return 'var(--accent-orange)';
    return 'var(--accent-green)';
  };

  const handleSaveName = async () => {
    if (!newName.trim() || newName === playerName) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const res = await fetch(`/api/players/${playerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newName }),
      });

      if (res.ok) {
        setPlayerName(newName);
        setEditingName(false);
      }
    } catch (error) {
      console.error('Failed to save name:', error);
    } finally {
      setSavingName(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-800 sticky top-0 z-40 bg-black/80 backdrop-blur">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple), var(--accent-pink))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/players" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Players
          </Link>

          {/* Player Info Section */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <div>
                  {editingName ? (
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={savingName}
                        className="px-4 py-2 rounded-lg font-semibold text-white transition"
                        style={{ backgroundColor: 'var(--accent-cyan)', opacity: savingName ? 0.5 : 1 }}
                      >
                        {savingName ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingName(false);
                          setNewName(playerName);
                        }}
                        className="px-4 py-2 rounded-lg font-semibold text-white bg-neutral-700 hover:bg-neutral-600 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <h1 className="text-4xl font-bold" style={{ color: 'var(--foreground)' }}>
                        {playerName}
                      </h1>
                      {isOwnProfile && (
                        <button
                          onClick={() => setEditingName(true)}
                          className="text-sm px-3 py-1 rounded-lg text-white transition"
                          style={{ backgroundColor: 'var(--accent-purple)', opacity: 0.8 }}
                        >
                          ✏️ Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <p>📧 {email}</p>
                <p>📅 Joined {new Date(createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Overall Score Card */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow flex-shrink-0">
              <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                Overall Score
              </p>
              <p className="text-5xl font-bold" style={{ color: 'var(--accent-purple)' }}>
                {overallScore}
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>pts</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-12">
          {/* Stats Section */}
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>Stats</h2>
              <div className="flex gap-2 items-center">
                <div className="flex gap-1">
                  <button
                    onClick={() => setSortBy('default')}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition ${
                      sortBy === 'default'
                        ? 'text-white'
                        : 'text-neutral-400 hover:text-neutral-300'
                    }`}
                    style={{
                      backgroundColor: sortBy === 'default' ? 'var(--accent-cyan)' : 'transparent',
                    }}
                  >
                    Default
                  </button>
                  <div className="flex gap-1 items-center">
                    <button
                      onClick={() => setSortBy('name')}
                      className={`px-3 py-2 rounded-lg font-medium text-sm transition ${
                        sortBy === 'name'
                          ? 'text-white'
                          : 'text-neutral-400 hover:text-neutral-300'
                      }`}
                      style={{
                        backgroundColor: sortBy === 'name' ? 'var(--accent-cyan)' : 'transparent',
                      }}
                    >
                      Name
                    </button>
                    {sortBy === 'name' && (
                      <button
                        onClick={() => setSortAscending(!sortAscending)}
                        className="px-2 py-2 rounded-lg font-medium text-sm text-white transition"
                        style={{ backgroundColor: 'var(--accent-cyan)' }}
                      >
                        {sortAscending ? '↑ A-Z' : '↓ Z-A'}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setSortBy('total')}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition ${
                      sortBy === 'total'
                        ? 'text-white'
                        : 'text-neutral-400 hover:text-neutral-300'
                    }`}
                    style={{
                      backgroundColor: sortBy === 'total' ? 'var(--accent-cyan)' : 'transparent',
                    }}
                  >
                    Total
                  </button>
                </div>
                <button
                  onClick={() => setColorCodeEnabled(!colorCodeEnabled)}
                  className="px-4 py-2 rounded-lg font-semibold text-white transition text-sm"
                  style={{
                    backgroundColor: colorCodeEnabled ? 'var(--accent-cyan)' : 'var(--accent-purple)',
                  }}
                >
                  {colorCodeEnabled ? '🎨' : '⚫'}
                </button>
              </div>
            </div>
            <div className="space-y-8">
              {getOrderedCategories().map((category) => {
                const colors: Record<string, string> = {
                  'mtl': 'var(--accent-cyan)',
                  'phy': 'var(--accent-pink)',
                  'kno': 'var(--accent-purple)',
                  'strs': 'var(--accent-orange)',
                  'stra': 'var(--accent-green)',
                  'ski': 'var(--accent-blue)',
                  'enr': 'var(--accent-red)',
                };
                const catColor = colors[category.code] || colors['mtl'];

                return (
                  <div key={category.code} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-8 rounded-full" style={{ backgroundColor: catColor }} />
                        <h3 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                          {category.label}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                          Category Total
                        </p>
                        <p className="text-2xl font-bold" style={{ color: catColor }}>
                          {category.stats.reduce((sum: number, s: any) => sum + s.value, 0)}/{category.stats.length * 10}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      {getSortedStats(category.stats).map((stat) => {
                        const change = changes[stat.code];
                        const diff = change && change.lastReviewValue !== undefined && change.lastReviewValue !== null
                          ? stat.value - change.lastReviewValue
                          : null;
                        const statValueColor = colorCodeEnabled ? getValueColor(stat.value) : catColor;

                        return (
                          <div key={stat.id} className={`rounded-xl p-4 border transition ${colorCodeEnabled ? 'bg-neutral-800/30' : 'bg-neutral-800/30'} border-neutral-700`} style={colorCodeEnabled ? { borderColor: statValueColor, borderWidth: '2px' } : {}}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                {stat.code}
                              </p>
                              <StatDescriptionModal
                                statCode={stat.code}
                                statLabel={stat.label}
                                description={STAT_DESCRIPTIONS[stat.code] || 'No description available'}
                              />
                            </div>
                            <p className="text-xs font-medium mb-4 line-clamp-2 h-8 text-white">
                              {stat.label}
                            </p>
                            <div className="mb-4">
                              <p className="text-3xl font-bold mb-2" style={{ color: statValueColor }}>
                                {stat.value}
                              </p>
                              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>/ 10</p>
                              {diff !== null && (
                                <p className="text-xs mt-2 font-medium" style={{ color: diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                                  {diff > 0 ? '+' : ''}{diff} (was {change.lastReviewValue})
                                </p>
                              )}
                            </div>
                            <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${(stat.value / 10) * 100}%`,
                                  backgroundColor: colorCodeEnabled ? statValueColor : catColor
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* History Section */}
          {history.length > 0 && (
            <section>
              <h2 className="text-3xl font-bold mb-8" style={{ color: 'var(--foreground)' }}>Recent Changes</h2>
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
                <div className="space-y-4">
                  {history.map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between pb-4 border-b border-neutral-800 last:border-0">
                      <div className="flex-1">
                        <p className="font-semibold text-white">{entry.label}</p>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {entry.code} changed by <span className="font-medium">{entry.changedBy}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {entry.oldValue} → <span style={{ color: 'var(--accent-green)' }} className="font-bold">{entry.newValue}</span>
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Recent Reviews Section */}
          {recentReviews.length > 0 && (
            <section>
              <h2 className="text-3xl font-bold mb-8" style={{ color: 'var(--foreground)' }}>Recent Reviews</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentReviews.map((review) => (
                  <Link
                    key={review.id}
                    href={`/reviews/sessions/${review.id}`}
                    className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow hover:border-neutral-700 transition"
                  >
                    <p className="text-sm font-semibold mb-2" style={{ color: 'var(--accent-cyan)' }}>
                      Review Session
                    </p>
                    <p className="text-white font-medium mb-3">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      👥 {review.participantCount} participant{review.participantCount !== 1 ? 's' : ''}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Comparison Section */}
          {otherPlayers.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-8">
                <h2 className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>Compare with Others</h2>
                <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: 'var(--accent-orange)' }}>
                  WIP
                </span>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {otherPlayers.map((player) => (
                    <Link
                      key={player.id}
                      href={`/players/${player.id}`}
                      className="p-4 rounded-lg border border-neutral-800 hover:border-neutral-700 transition text-white hover:bg-neutral-800/50"
                    >
                      <p className="font-semibold">{player.username}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>View Profile →</p>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

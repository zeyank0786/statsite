'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StatDescriptionModal from '@/components/StatDescriptionModal';
import { STAT_DESCRIPTIONS } from '@/lib/statDescriptions';

interface PlayerStat {
  id: string;
  statId: string;
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
  value: number;
}

interface GroupedStats {
  [categoryCode: string]: {
    label: string;
    code: string;
    stats: PlayerStat[];
  };
}

const OFFICIAL_CATEGORY_ORDER = ['mtl', 'phy', 'kno', 'strs', 'stra', 'ski', 'enr'];

export default function ReviewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [groupedStats, setGroupedStats] = useState<GroupedStats>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [joiningRole, setJoiningRole] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, any>>({});
  const [targetPlayerId, setTargetPlayerId] = useState<string>('');
  const [colorCodeEnabled, setColorCodeEnabled] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'total'>('default');

  const currentPlayerId = (session?.user as any)?.playerId;

  const getValueColor = (value: number) => {
    if (value <= 3) return 'var(--accent-red)';
    if (value <= 7) return 'var(--accent-orange)';
    return 'var(--accent-green)';
  };

  const getOrderedCategories = () => {
    const ordered: GroupedStats = {};
    OFFICIAL_CATEGORY_ORDER.forEach((catCode) => {
      if (groupedStats[catCode]) {
        ordered[catCode] = groupedStats[catCode];
      }
    });
    return ordered;
  };

  const getSortedStats = (categoryStats: PlayerStat[]) => {
    const sorted = [...categoryStats];
    switch (sortBy) {
      case 'name':
        return sorted.sort((a, b) => a.label.localeCompare(b.label));
      case 'total':
        return sorted.sort((a, b) => b.value - a.value);
      case 'default':
      default:
        return sorted.sort((a, b) => a.code.localeCompare(b.code));
    }
  };

  useEffect(() => {
    if (params) {
      params.then((p) => setSessionId(p.id));
    }
  }, [params]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated' && sessionId) {
      loadStats();
      const eventSource = connectToStream();

      // Poll for participant changes (in case user joined from reviews list)
      const pollInterval = setInterval(() => {
        loadStats();
      }, 2000);

      return () => {
        eventSource.close();
        clearInterval(pollInterval);
      };
    }
  }, [status, router, sessionId]);

  const connectToStream = () => {
    const eventSource = new EventSource(`/api/reviews/sessions/${sessionId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'stat_updated') {
          // Update the stat in local state
          setStats((prevStats) =>
            prevStats.map((s) =>
              s.statId === data.statId ? { ...s, value: data.value } : s
            )
          );

          // Update grouped stats too
          setGroupedStats((prevGrouped) => {
            const updated = { ...prevGrouped };
            Object.keys(updated).forEach((catCode) => {
              updated[catCode].stats = updated[catCode].stats.map((s) =>
                s.statId === data.statId ? { ...s, value: data.value } : s
              );
            });
            return updated;
          });
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return eventSource;
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/stats`);
      if (res.ok) {
        const data = await res.json();

        // Prevent the subject player from viewing/participating in their own review
        if (data.isSubject) {
          setForbidden(true);
          return;
        }

        setStats(data.stats || []);
        setPlayerName(data.playerName || '');
        setIsEditor(data.isEditor || false);
        setTargetPlayerId(data.targetPlayerId || '');

        // Create snapshot of pre-review state (only once per session)
        const snapshotRes = await fetch(`/api/reviews/sessions/${sessionId}/snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stats: data.stats || [] }),
        });
        if (!snapshotRes.ok) {
          console.error('Failed to create snapshot:', await snapshotRes.text());
        }

        // Group by category
        const grouped: GroupedStats = {};
        (data.stats || []).forEach((stat: PlayerStat) => {
          if (!grouped[stat.categoryCode]) {
            grouped[stat.categoryCode] = {
              label: stat.categoryLabel,
              code: stat.categoryCode,
              stats: [],
            };
          }
          grouped[stat.categoryCode].stats.push(stat);
        });
        setGroupedStats(grouped);

        // Load changes from last review
        if (data.targetPlayerId) {
          const changesRes = await fetch(`/api/players/${data.targetPlayerId}/changes`);
          if (changesRes.ok) {
            const changesData = await changesRes.json();
            const changesMap: Record<string, any> = {};
            changesData.forEach((change: any) => {
              changesMap[change.code] = change;
            });
            setChanges(changesMap);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinAs = async (role: 'editor' | 'reviewer') => {
    setJoiningRole(role);
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      if (res.ok) {
        // Reload stats to update editor status
        loadStats();
      } else {
        const data = await res.json();
        console.error('Failed to join:', data.error);
      }
    } catch (error) {
      console.error('Failed to join session:', error);
    } finally {
      setJoiningRole(null);
    }
  };

  const handleEditStat = async (statId: string, newValue: number) => {
    if (!isEditor) return;
    if (newValue < 0 || newValue > 10) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/sessions/${sessionId}/stats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statId, value: newValue }),
      });

      if (res.ok) {
        // Update local state
        setStats(stats.map(s => s.statId === statId ? { ...s, value: newValue } : s));

        // Update grouped stats too
        setGroupedStats((prevGrouped) => {
          const updated = { ...prevGrouped };
          Object.keys(updated).forEach((catCode) => {
            updated[catCode].stats = updated[catCode].stats.map((s) =>
              s.statId === statId ? { ...s, value: newValue } : s
            );
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to save stat:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    setClosing(true);
    try {
      // Close the session (stats are already saved in real-time)
      const res = await fetch(`/api/reviews/sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });

      if (res.ok) {
        // Redirect back to reviews
        router.push('/reviews');
      }
    } catch (error) {
      console.error('Failed to close session:', error);
    } finally {
      setClosing(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
          <p style={{ color: 'var(--text-secondary)' }} className="mb-6">
            You cannot participate in a review session for your own stats.
          </p>
          <Link
            href="/reviews"
            className="inline-block px-6 py-3 rounded-lg font-semibold text-white"
            style={{ backgroundColor: 'var(--accent-cyan)' }}
          >
            Back to Reviews
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur sticky top-0 z-40">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-pink))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/reviews" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Reviews
          </Link>
          <div className="flex items-center justify-between gap-6">
            <div>
              <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                Reviewing {playerName}
              </h1>
              <p style={{ color: 'var(--text-secondary)' }}>
                {isEditor ? '📝 You are the editor' : '👁️ You are viewing (read-only)'}
              </p>
            </div>
            <div className="flex gap-3">
              {!isEditor && (
                <>
                  <button
                    onClick={() => handleJoinAs('editor')}
                    disabled={joiningRole !== null}
                    className="px-4 py-2 rounded-lg font-semibold text-white transition bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800 disabled:opacity-50"
                  >
                    {joiningRole === 'editor' ? '⏳' : '✏️ Editor'}
                  </button>
                  <button
                    onClick={() => handleJoinAs('reviewer')}
                    disabled={joiningRole !== null}
                    className="px-4 py-2 rounded-lg font-semibold text-white transition bg-green-900/30 hover:bg-green-900/50 border border-green-800 disabled:opacity-50"
                  >
                    {joiningRole === 'reviewer' ? '⏳' : '👁️ Reviewer'}
                  </button>
                </>
              )}
              {isEditor && (
                <div className="px-4 py-2 rounded-lg" style={{ backgroundColor: 'rgba(0, 255, 255, 0.1)', borderColor: 'var(--accent-cyan)', borderWidth: '1px' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--accent-cyan)' }}>
                    Editor
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8 flex justify-between items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('default')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                sortBy === 'default'
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              style={sortBy === 'default' ? { backgroundColor: 'var(--accent-cyan)' } : {}}
            >
              Default
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                sortBy === 'name'
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              style={sortBy === 'name' ? { backgroundColor: 'var(--accent-cyan)' } : {}}
            >
              Name
            </button>
            <button
              onClick={() => setSortBy('total')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                sortBy === 'total'
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              style={sortBy === 'total' ? { backgroundColor: 'var(--accent-cyan)' } : {}}
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
            {colorCodeEnabled ? '🎨 Color Coding: On' : '⚫ Color Coding: Off'}
          </button>
        </div>
        <div className="space-y-10">
          {Object.values(getOrderedCategories()).map((category) => {
            const categoryTotal = category.stats.reduce((sum: number, s: any) => sum + s.value, 0);
            const categoryColor = 'var(--accent-cyan)';

            return (
            <div key={category.code} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 card-shadow">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">{category.label}</h3>
                <div className="text-right">
                  <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Category Total
                  </p>
                  <p className="text-2xl font-bold" style={{ color: categoryColor }}>
                    {categoryTotal}/{category.stats.length * 10}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {getSortedStats(category.stats).map((stat) => {
                  const change = changes[stat.code];
                  const diff = change && change.lastReviewValue !== undefined && change.lastReviewValue !== null
                    ? stat.value - change.lastReviewValue
                    : null;

                  const statValueColor = colorCodeEnabled ? getValueColor(stat.value) : 'var(--accent-cyan)';

                  return (
                    <div
                      key={stat.statId}
                      className={`rounded-xl p-4 border transition ${
                        isEditor
                          ? 'bg-neutral-800/50 hover:border-neutral-600'
                          : 'bg-neutral-800/30'
                      } ${colorCodeEnabled ? 'border-2' : 'border'}`}
                      style={colorCodeEnabled ? { borderColor: statValueColor } : { borderColor: 'var(--neutral-700)' }}
                    >
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

                      {/* Value Display */}
                      <div className="mb-4">
                        <p className="text-3xl font-bold mb-2" style={{ color: statValueColor }}>
                          {stat.value}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          / 10
                        </p>
                        {diff !== null && (
                          <p className="text-xs mt-2 font-medium" style={{ color: diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                            {diff > 0 ? '+' : ''}{diff} (was {change.lastReviewValue})
                          </p>
                        )}
                      </div>

                    {/* Edit Controls - Only for Editor */}
                    {isEditor && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditStat(stat.statId, Math.max(0, stat.value - 1))}
                            disabled={saving || closing || stat.value === 0}
                            className="flex-1 py-1 px-2 rounded text-xs font-bold transition bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-50"
                          >
                            −
                          </button>
                          <button
                            onClick={() => handleEditStat(stat.statId, Math.min(10, stat.value + 1))}
                            disabled={saving || closing || stat.value === 10}
                            className="flex-1 py-1 px-2 rounded text-xs font-bold transition bg-green-900/30 text-green-400 hover:bg-green-900/50 disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={stat.value}
                          onChange={(e) => handleEditStat(stat.statId, parseInt(e.target.value))}
                          disabled={saving || closing}
                          className="w-full h-1 rounded cursor-pointer"
                          style={{ accentColor: 'var(--accent-cyan)' }}
                        />
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}

          {/* Save and Close Button - Only for Editor */}
          {isEditor && (
            <div className="flex justify-end pt-8 border-t border-neutral-800">
              <button
                onClick={handleSaveAndClose}
                disabled={closing}
                className="px-8 py-3 rounded-lg font-semibold text-white transition text-lg"
                style={{
                  backgroundColor: 'var(--accent-cyan)',
                  opacity: closing ? 0.5 : 1,
                  cursor: closing ? 'not-allowed' : 'pointer'
                }}
              >
                {closing ? '⏳ Saving...' : '✓ Save Changes & Close'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

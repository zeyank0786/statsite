'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STAT_DESCRIPTIONS } from '@/lib/statDescriptions';
import StatDescriptionModal from '@/components/StatDescriptionModal';

interface Target {
  id: string;
  playerId: string;
  statCode: string;
  statLabel: string;
  username: string;
}

interface PlayerStat {
  id: string;
  code: string;
  label: string;
  value: number;
}

interface Stat {
  code: string;
  label: string;
}

const ALL_STATS = [
  { code: 'mtl-a', label: 'Unwavering Self-Confidence' },
  { code: 'mtl-b', label: 'Pressure Performance' },
  { code: 'mtl-c', label: 'Creative Problem-Solving' },
  { code: 'mtl-d', label: 'Maximum Potential Drive' },
  { code: 'mtl-e', label: 'Growth Mindset' },
  { code: 'mtl-f', label: 'Emotional Resilience' },
  { code: 'mtl-g', label: 'Mental Clarity & Focus' },
  { code: 'mtl-h', label: 'Positive Self-Talk' },
  { code: 'mtl-i', label: 'Long-Term Vision Alignment' },
  { code: 'mtl-j', label: 'Adaptability to Uncertainty' },
  { code: 'phy-a', label: 'Overall Strength' },
  { code: 'phy-b', label: 'Cardiovascular Endurance' },
  { code: 'phy-c', label: 'Hand Speed & Reaction Time' },
  { code: 'phy-d', label: 'Sprint Speed & Explosiveness' },
  { code: 'phy-e', label: 'Vertical Jump & Power' },
  { code: 'phy-f', label: 'Balance & Proprioception' },
  { code: 'phy-g', label: 'Body Aesthetics & Composition' },
  { code: 'phy-h', label: 'Punch Power & Striking Force' },
  { code: 'phy-i', label: 'Push Power & Upper Body Force' },
  { code: 'phy-j', label: 'Hand-Eye Coordination' },
  { code: 'kno-a', label: 'Business & Entrepreneurship Knowledge' },
  { code: 'kno-b', label: 'Sports Knowledge' },
  { code: 'kno-c', label: 'General World Knowledge' },
  { code: 'kno-d', label: 'Pop Culture Awareness' },
  { code: 'kno-e', label: 'News & Current Affairs' },
  { code: 'kno-f', label: 'Academic / Technical Knowledge' },
  { code: 'kno-g', label: 'Psychology & Human Behavior' },
  { code: 'kno-h', label: 'Financial Literacy' },
  { code: 'kno-i', label: 'Health & Nutrition Science' },
  { code: 'kno-j', label: 'Technology & Future Trends' },
  { code: 'strs-a', label: 'People Reading & Social Adaptability' },
  { code: 'strs-b', label: 'Learning on the Fly' },
  { code: 'strs-c', label: 'Opportunity Spotting' },
  { code: 'strs-d', label: 'Risk & Trap Avoidance' },
  { code: 'strs-e', label: 'Real-World Resourcefulness' },
  { code: 'strs-f', label: 'Negotiation & Persuasion' },
  { code: 'strs-g', label: 'Situational Awareness' },
  { code: 'strs-h', label: 'Independence from Systems' },
  { code: 'strs-i', label: 'Street-Level Practical Wisdom' },
  { code: 'strs-j', label: 'Boundary Setting & Self-Protection' },
  { code: 'stra-a', label: 'Long-Term Planning' },
  { code: 'stra-b', label: 'Sacrifice Discipline' },
  { code: 'stra-c', label: 'Environmental Adaptation' },
  { code: 'stra-d', label: 'Trap Setting & Avoidance' },
  { code: 'stra-e', label: 'Composure Under Complexity' },
  { code: 'stra-f', label: 'Scenario Thinking' },
  { code: 'stra-g', label: 'Resource Allocation' },
  { code: 'stra-h', label: 'On-the-Spot Reactivity' },
  { code: 'stra-i', label: 'Risk Assessment' },
  { code: 'stra-j', label: 'Contingency Planning' },
  { code: 'ski-a', label: 'Depth in Core High-Value Skills' },
  { code: 'ski-b', label: 'Breadth of Useful Skills' },
  { code: 'ski-c', label: 'Rapid Learning Ability' },
  { code: 'ski-d', label: 'Self-Initiated Skill Development' },
  { code: 'ski-e', label: 'Skill Transferability' },
  { code: 'ski-f', label: 'Deliberate Practice Habit' },
  { code: 'ski-g', label: 'Teaching / Explaining Ability' },
  { code: 'ski-h', label: 'Adaptability of Skills' },
  { code: 'ski-i', label: 'Portfolio of Demonstrable Skills' },
  { code: 'ski-j', label: 'Continuous Skill Upgrading' },
  { code: 'enr-a', label: 'Physical Appearance & Vitality' },
  { code: 'enr-b', label: 'Presence & Charisma' },
  { code: 'enr-c', label: 'Vocal Energy & Tone' },
  { code: 'enr-d', label: 'Clarity of Communication' },
  { code: 'enr-e', label: 'Body Language' },
  { code: 'enr-f', label: 'Emotional Contagion' },
  { code: 'enr-g', label: 'Social Stamina' },
  { code: 'enr-h', label: 'Natural Authority' },
  { code: 'enr-i', label: 'Inspirational Motivation' },
  { code: 'enr-j', label: 'Crisis Leadership' },
];

export default function TargetsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [selectedTargets, setSelectedTargets] = useState<Stat[]>([]);
  const [allTargets, setAllTargets] = useState<Target[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, number>>({});
  const [allPlayersStats, setAllPlayersStats] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideMaxed, setHideMaxed] = useState(false);

  const currentPlayerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated' && currentPlayerId) {
      loadTargets();
    }
  }, [status, router, currentPlayerId]);

  const loadTargets = async () => {
    try {
      const targetsRes = await fetch('/api/targets');
      let data: Target[] = [];

      if (targetsRes.ok) {
        data = await targetsRes.json();
        setAllTargets(data);

        // Get user's own targets
        const userTargets = data.filter((t: Target) => t.playerId === currentPlayerId);
        const selected = userTargets.map((t: Target) => ({
          code: t.statCode,
          label: t.statLabel,
        }));
        console.log('User targets from API:', userTargets);
        console.log('Selected targets set to:', selected);
        setSelectedTargets(selected);
      }

      // Fetch current user's stats
      const statsRes = await fetch(`/api/players/${currentPlayerId}`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        console.log('API response for current user:', statsData);
        const statsMap: Record<string, number> = {};
        if (statsData.categories) {
          statsData.categories.forEach((category: any) => {
            if (category.stats) {
              category.stats.forEach((stat: any) => {
                statsMap[stat.code] = stat.value;
              });
            }
          });
        }
        console.log('Loaded current user stats:', statsMap);
        setPlayerStats(statsMap);
      } else {
        console.error('Failed to fetch current user stats:', statsRes.status);
      }

      // Fetch stats for all other players with targets
      const otherPlayerIds = [...new Set(data.filter((t) => t.playerId !== currentPlayerId).map((t) => t.playerId))];
      const allPlayersStatsMap: Record<string, Record<string, number>> = {};

      await Promise.all(
        otherPlayerIds.map(async (playerId) => {
          try {
            const res = await fetch(`/api/players/${playerId}`);
            if (res.ok) {
              const statsData = await res.json();
              const statsMap: Record<string, number> = {};
              statsData.categories.forEach((category: any) => {
                category.stats.forEach((stat: any) => {
                  statsMap[stat.code] = stat.value;
                });
              });
              allPlayersStatsMap[playerId] = statsMap;
            }
          } catch (error) {
            console.error(`Failed to load stats for player ${playerId}:`, error);
          }
        })
      );

      setAllPlayersStats(allPlayersStatsMap);
    } catch (error) {
      console.error('Failed to load targets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTarget = (stat: Stat) => {
    if (selectedTargets.find((t) => t.code === stat.code)) {
      setSelectedTargets(selectedTargets.filter((t) => t.code !== stat.code));
    } else if (selectedTargets.length < 3) {
      setSelectedTargets([...selectedTargets, stat]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: selectedTargets }),
      });

      if (res.ok) {
        await loadTargets();
      }
    } catch (error) {
      console.error('Failed to save targets:', error);
    } finally {
      setSaving(false);
    }
  };

  const getValueColor = (value: number): string => {
    if (value >= 8) return 'text-green-400';
    if (value >= 4) return 'text-orange-400';
    return 'text-red-400';
  };

  const filteredStats = ALL_STATS.filter((stat) => {
    const matchesSearch = stat.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stat.code.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (hideMaxed) {
      const currentValue = playerStats[stat.code] ?? 0;
      return currentValue < 10;
    }

    return true;
  });

  const targetsByPlayer = Array.from(
    new Map(allTargets.map((t) => [t.username, allTargets.filter((x) => x.username === t.username)])).entries()
  );

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur sticky top-0 z-40">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple), var(--accent-pink))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-sm font-medium mb-4 block" style={{ color: 'var(--accent-cyan)' }}>
            ← Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--foreground)' }}>Targets</h1>
          <p style={{ color: 'var(--text-secondary)' }} className="mt-1">Pick up to 3 stats to focus on</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Your Targets Section */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>Your Targets</h2>
              <p style={{ color: 'var(--text-secondary)' }} className="text-sm mt-2">
                Focus on {selectedTargets.length} of 3 stats
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 rounded-lg font-semibold text-white transition"
              style={{
                backgroundColor: 'var(--accent-cyan)',
                opacity: saving ? 0.5 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '⏳ Saving...' : '✓ Save'}
            </button>
          </div>

          {/* Selected Targets Display */}
          {selectedTargets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {selectedTargets.map((target, idx) => {
                const currentValue = playerStats[target.code] ?? 0;
                console.log(`Target ${target.code}: playerStats[${target.code}] =`, playerStats[target.code], 'currentValue =', currentValue);
                return (
                  <div
                    key={target.code}
                    className="bg-gradient-to-br from-cyan-900/20 to-cyan-900/5 border border-cyan-700/50 rounded-2xl p-6 card-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--accent-cyan)' }}>
                          Target {idx + 1}
                        </p>
                        <h3 className="text-lg font-bold text-white">{target.label}</h3>
                      </div>
                      <button
                        onClick={() => handleSelectTarget(target)}
                        className="text-cyan-400 hover:text-red-400 transition"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{target.code}</p>
                    <div className={`text-sm font-semibold ${getValueColor(currentValue)}`}>Current: {currentValue}/10</div>
                  </div>
                );
              })}
              {[...Array(3 - selectedTargets.length)].map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="bg-neutral-800/30 border border-dashed border-neutral-700 rounded-2xl p-6 flex items-center justify-center"
                >
                  <p style={{ color: 'var(--text-secondary)' }} className="text-sm">
                    Empty slot
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Search and Stats Grid */}
          <div>
            <div className="flex gap-3 mb-6">
              <input
                type="text"
                placeholder="Search by stat name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
              />
              <button
                onClick={() => setHideMaxed(!hideMaxed)}
                className={`px-4 py-3 rounded-xl font-medium transition whitespace-nowrap ${
                  hideMaxed
                    ? 'bg-accent-cyan text-black'
                    : 'bg-neutral-800 border border-neutral-700 text-white hover:border-neutral-600'
                }`}
                style={hideMaxed ? { backgroundColor: 'var(--accent-cyan)', color: 'black' } : {}}
              >
                {hideMaxed ? '✓ Hide 10/10s' : 'Hide 10/10s'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredStats.map((stat) => {
                const isSelected = selectedTargets.find((t) => t.code === stat.code);
                const isDisabled = !isSelected && selectedTargets.length >= 3;
                const currentValue = playerStats[stat.code] ?? 0;

                return (
                  <button
                    key={stat.code}
                    onClick={() => handleSelectTarget(stat)}
                    disabled={isDisabled}
                    className={`text-left px-4 py-3 rounded-xl border transition ${
                      isSelected
                        ? 'bg-cyan-900/30 border-cyan-700 text-white'
                        : isDisabled
                        ? 'bg-neutral-800/20 border-neutral-700 text-neutral-600 cursor-not-allowed'
                        : 'bg-neutral-800/50 border-neutral-700 text-white hover:border-neutral-600 hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{stat.label}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {stat.code}
                        </p>
                        <p className={`text-xs mt-2 font-semibold ${getValueColor(currentValue)}`}>Current: {currentValue}/10</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <StatDescriptionModal
                          statCode={stat.code}
                          statLabel={stat.label}
                          description={STAT_DESCRIPTIONS[stat.code] || 'No description available'}
                        />
                        {isSelected && (
                          <span className="text-cyan-400 font-bold">✓</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Team Targets Section */}
        <section>
          <h2 className="text-3xl font-bold mb-8" style={{ color: 'var(--foreground)' }}>Team Targets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {targetsByPlayer.map(([playerName, targets]) => {
              const playerId = targets.length > 0 ? targets[0].playerId : null;
              const playerStatValues = playerId ? (allPlayersStats[playerId] || {}) : {};

              return (
                <div key={playerName} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow">
                  <h3 className="text-lg font-bold text-white mb-4">{playerName}</h3>
                  <div className="space-y-2">
                    {targets.length > 0 ? (
                      targets.map((target) => {
                        const playerCurrentValue = playerStatValues[target.statCode] ?? 0;
                        return (
                          <div
                            key={target.id}
                            className="bg-neutral-800/50 rounded-lg px-3 py-2 border border-neutral-700 group cursor-help"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-white">{target.statLabel}</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                  {target.statCode}
                                </p>
                                <p className={`text-xs mt-2 font-semibold ${getValueColor(playerCurrentValue)}`}>Current: {playerCurrentValue}/10</p>
                              </div>
                              <StatDescriptionModal
                                statCode={target.statCode}
                                statLabel={target.statLabel}
                                description={STAT_DESCRIPTIONS[target.statCode] || 'No description available'}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>
                        No targets yet
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

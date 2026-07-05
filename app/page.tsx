'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PlayerStats {
  player: { username: string };
  categories: any[];
  overallAvg: number;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ strengths: false, develop: false });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }

    if (status === 'authenticated') {
      loadPlayerStats();
    }
  }, [status, router]);

  const loadPlayerStats = async () => {
    try {
      setStatsLoading(true);
      const playerId = (session?.user as any)?.playerId;
      if (!playerId) return;

      const res = await fetch(`/api/players/${playerId}`);
      if (res.ok) {
        const data = await res.json();
        setPlayerStats(data);
      }
    } catch (error) {
      console.error('Failed to load player stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Header with gradient accent */}
      <header className="border-b border-neutral-800 sticky top-0 z-50 bg-black/80 backdrop-blur">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple), var(--accent-pink))' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
              {session.user?.playerUsername}
            </h1>
            <div className="flex gap-3 items-center">
              <Link
                href="/players"
                className="px-3 py-2 text-sm font-medium transition rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50"
              >
                👥 Players
              </Link>
              <Link
                href="/reviews"
                className="px-3 py-2 text-sm font-medium transition rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50"
              >
                📋 Reviews
              </Link>
              <Link
                href="/history"
                className="px-3 py-2 text-sm font-medium transition rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50"
              >
                📈 History
              </Link>
              <Link
                href="/targets"
                className="px-3 py-2 text-sm font-medium transition rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50"
              >
                🎯 Targets
              </Link>
              <div className="w-px h-6" style={{ backgroundColor: 'var(--neutral-700)' }} />
              <Link
                href="/settings"
                className="px-3 py-2 text-sm font-medium transition rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50"
              >
                ⚙️ Settings
              </Link>
              <button
                onClick={() => signOut()}
                className="px-3 py-2 text-sm font-medium transition rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-900/10"
              >
                🚪 Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="mb-16 bg-neutral-900 border border-neutral-800 rounded-3xl p-12 card-shadow overflow-hidden relative">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-5" style={{ backgroundColor: 'var(--accent-cyan)' }} />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-5" style={{ backgroundColor: 'var(--accent-purple)' }} />
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-12 rounded-full" style={{ backgroundColor: 'var(--accent-cyan)' }} />
              <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-cyan)' }}>Welcome back</span>
            </div>
            <h2 className="text-5xl font-bold mb-4" style={{ color: 'var(--foreground)' }}>
              {session.user?.playerUsername}
            </h2>
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
              Track your development across 7 categories and 70 stats. Collaborate with your teammates, submit suggestions, and participate in quarterly reviews.
            </p>
          </div>
        </div>

        {/* Your Stats Trading Card Overview */}
        {playerStats && !statsLoading && (
          <div className="mb-16">
            <h3 className="text-sm uppercase font-bold tracking-wider mb-6" style={{ color: 'var(--text-secondary)' }}>Your Stats Card</h3>

            {/* Two Column Layout - 45/55 split */}
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left: Trading Card - 45% */}
              <div className="w-full lg:w-[45%]">
                <div className="bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-700 rounded-3xl p-8 card-shadow overflow-hidden relative h-full">
                {/* Background Effects */}
                <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-5" style={{ backgroundColor: 'var(--accent-purple)' }} />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-5" style={{ backgroundColor: 'var(--accent-cyan)' }} />

                <div className="relative z-10">
                  {/* Player Header */}
                  <div className="mb-8 pb-6 border-b border-neutral-700">
                    <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--accent-cyan)' }}>Player Card</p>
                    <h4 className="text-3xl font-bold text-white mb-1">{session.user?.playerUsername}</h4>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>70 Stats Tracked • 7 Categories</p>
                  </div>

                  {/* Overall Score - Large Display */}
                  <div className="text-center mb-8 p-6 rounded-2xl" style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}>
                    <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Overall Score</p>
                    <p className="text-7xl font-bold" style={{ color: 'var(--accent-purple)' }}>
                      {(() => {
                        // Calculate weighted score: sum of category totals divided by (categories - 1)
                        const categoryTotals = playerStats.categories.map((cat: any) =>
                          cat.stats.reduce((sum: number, s: any) => sum + s.value, 0)
                        );
                        const totalSum = categoryTotals.reduce((sum: number, total: number) => sum + total, 0);
                        const score = totalSum / (playerStats.categories.length - 1);
                        return score.toFixed(1);
                      })()}
                    </p>
                    <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>pts</p>
                  </div>

                  {/* Category Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-6">
                    {playerStats.categories.map((category, idx) => {
                      const colors = [
                        'var(--accent-cyan)',
                        'var(--accent-pink)',
                        'var(--accent-purple)',
                        'var(--accent-orange)',
                        'var(--accent-green)',
                        'var(--accent-blue)',
                        'var(--accent-red)',
                      ];
                      const color = colors[idx % colors.length];
                      const categoryAvg = (category.stats.reduce((sum: number, s: any) => sum + s.value, 0) / category.stats.length).toFixed(1);

                      return (
                        <div key={category.code} className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', borderLeft: `3px solid ${color}` }}>
                          <p className="text-xs font-semibold mb-1 text-white">{category.emoji}</p>
                          <p className="text-2xl font-bold" style={{ color }}>
                            {categoryAvg}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Expandable Sections */}
                  <div className="space-y-3 pt-6 border-t border-neutral-700">
                    {/* Strengths Section */}
                    <button
                      onClick={() =>
                        setExpandedSections({
                          ...expandedSections,
                          strengths: !expandedSections.strengths,
                        })
                      }
                      className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-neutral-800/50 transition"
                      style={{ backgroundColor: 'rgba(52, 199, 89, 0.1)' }}
                    >
                      <div className="flex items-center gap-3">
                        <span>📈</span>
                        <span className="font-semibold text-white">Your Strengths</span>
                      </div>
                      <span
                        style={{ color: 'var(--accent-green)' }}
                        className={`transition-transform ${expandedSections.strengths ? 'rotate-180' : ''}`}
                      >
                        ▼
                      </span>
                    </button>

                    {expandedSections.strengths && (
                      <div className="pl-4 space-y-2">
                        {playerStats.categories
                          .flatMap((cat: any) =>
                            cat.stats.map((stat: any) => ({ ...stat, categoryLabel: cat.label }))
                          )
                          .sort((a: any, b: any) => b.value - a.value)
                          .slice(0, 5)
                          .map((stat: any) => (
                            <div key={stat.code} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'rgba(52, 199, 89, 0.05)', borderLeft: '2px solid var(--accent-green)' }}>
                              <div>
                                <p className="text-sm font-medium text-white">{stat.label}</p>
                                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  {stat.categoryLabel}
                                </p>
                              </div>
                              <p className="text-lg font-bold" style={{ color: 'var(--accent-green)' }}>
                                {stat.value}
                              </p>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Areas to Develop Section */}
                    <button
                      onClick={() =>
                        setExpandedSections({
                          ...expandedSections,
                          develop: !expandedSections.develop,
                        })
                      }
                      className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-neutral-800/50 transition"
                      style={{ backgroundColor: 'rgba(255, 149, 0, 0.1)' }}
                    >
                      <div className="flex items-center gap-3">
                        <span>📉</span>
                        <span className="font-semibold text-white">Areas to Develop</span>
                      </div>
                      <span
                        style={{ color: 'var(--accent-orange)' }}
                        className={`transition-transform ${expandedSections.develop ? 'rotate-180' : ''}`}
                      >
                        ▼
                      </span>
                    </button>

                    {expandedSections.develop && (
                      <div className="pl-4 space-y-2">
                        {playerStats.categories
                          .flatMap((cat: any) =>
                            cat.stats.map((stat: any) => ({ ...stat, categoryLabel: cat.label }))
                          )
                          .sort((a: any, b: any) => a.value - b.value)
                          .slice(0, 5)
                          .map((stat: any) => (
                            <div key={stat.code} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'rgba(255, 149, 0, 0.05)', borderLeft: '2px solid var(--accent-orange)' }}>
                              <div>
                                <p className="text-sm font-medium text-white">{stat.label}</p>
                                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  {stat.categoryLabel}
                                </p>
                              </div>
                              <p className="text-lg font-bold" style={{ color: 'var(--accent-orange)' }}>
                                {stat.value}
                              </p>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>

              {/* Right: Category Breakdown - 55% */}
              <div className="w-full lg:w-[55%] space-y-6">
                {/* All Categories Progress */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow">
                  <h4 className="font-semibold text-white mb-6">Category Progress</h4>
                  <div className="space-y-4">
                    {playerStats.categories.map((category, idx) => {
                      const colors = [
                        'var(--accent-cyan)',
                        'var(--accent-pink)',
                        'var(--accent-purple)',
                        'var(--accent-orange)',
                        'var(--accent-green)',
                        'var(--accent-blue)',
                        'var(--accent-red)',
                      ];
                      const color = colors[idx % colors.length];
                      const categoryAvg = (category.stats.reduce((sum: number, s: any) => sum + s.value, 0) / category.stats.length);
                      const percentage = (categoryAvg / 10) * 100;

                      return (
                        <div key={category.code}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-white flex items-center gap-2">
                              <span>{category.emoji}</span>
                              {category.label}
                            </span>
                            <span className="text-sm font-bold" style={{ color }}>
                              {categoryAvg.toFixed(1)}/10
                            </span>
                          </div>
                          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow text-center">
                    <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Total Stats</p>
                    <p className="text-4xl font-bold text-white">70</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow text-center">
                    <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Categories</p>
                    <p className="text-4xl font-bold text-white">7</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow text-center">
                    <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Highest Stat</p>
                    <p className="text-3xl font-bold" style={{ color: 'var(--accent-green)' }}>
                      {Math.max(
                        ...playerStats.categories.flatMap((cat: any) =>
                          cat.stats.map((s: any) => s.value)
                        )
                      )}
                    </p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow text-center">
                    <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Lowest Stat</p>
                    <p className="text-3xl font-bold" style={{ color: 'var(--accent-orange)' }}>
                      {Math.min(
                        ...playerStats.categories.flatMap((cat: any) =>
                          cat.stats.map((s: any) => s.value)
                        )
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions & Key Metrics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16">
          {/* Left Column: Quick Actions */}
          <div className="lg:col-span-1 space-y-5">
            <h3 className="text-sm uppercase font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>Quick Actions</h3>

            <Link
              href="/players"
              className="block bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 transition card-shadow overflow-hidden relative group"
            >
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: 'var(--accent-cyan)' }} />
              <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-cyan)' }} />
              <div className="relative z-10">
                <div className="text-2xl mb-2">👥</div>
                <h4 className="font-semibold text-white">View Profiles</h4>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>See all player stats</p>
              </div>
            </Link>

            <Link
              href="/suggestions/new"
              className="block bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 transition card-shadow overflow-hidden relative group"
            >
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: 'var(--accent-purple)' }} />
              <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-purple)' }} />
              <div className="relative z-10">
                <div className="text-2xl mb-2">💡</div>
                <h4 className="font-semibold text-white">New Suggestion</h4>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Propose a change</p>
              </div>
            </Link>

            <Link
              href="/history"
              className="block bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 transition card-shadow overflow-hidden relative group"
            >
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: 'var(--accent-orange)' }} />
              <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-orange)' }} />
              <div className="relative z-10">
                <div className="text-2xl mb-2">📈</div>
                <h4 className="font-semibold text-white">View History</h4>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Recent changes</p>
              </div>
            </Link>
          </div>

          {/* Right Column: Stats & Info */}
          <div className="lg:col-span-2 space-y-5">
            {/* Stats Grid */}
            <h3 className="text-sm uppercase font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>System Overview</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow overflow-hidden relative group hover:border-neutral-700 transition">
                <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-green)' }} />
                <div className="relative z-10">
                  <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Categories</p>
                  <p className="text-4xl font-bold mb-1" style={{ color: 'var(--accent-green)' }}>7</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Stat groups</p>
                </div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow overflow-hidden relative group hover:border-neutral-700 transition">
                <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-orange)' }} />
                <div className="relative z-10">
                  <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Stats</p>
                  <p className="text-4xl font-bold mb-1" style={{ color: 'var(--accent-orange)' }}>70</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total tracked</p>
                </div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow overflow-hidden relative group hover:border-neutral-700 transition">
                <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition" style={{ backgroundColor: 'var(--accent-pink)' }} />
                <div className="relative z-10">
                  <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Players</p>
                  <p className="text-4xl font-bold mb-1" style={{ color: 'var(--accent-pink)' }}>4</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Team members</p>
                </div>
              </div>
            </div>

            {/* Featured Card: Reviews */}
            <Link
              href="/reviews"
              className="block bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 transition card-shadow overflow-hidden relative group"
              style={{ backgroundImage: `linear-gradient(135deg, rgba(${parseInt('30', 16)},${parseInt('b0', 16)},${parseInt('c0', 16)},0.05), transparent)` }}
            >
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-10" style={{ backgroundColor: 'var(--accent-pink)' }} />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--accent-pink)' }}>Featured</p>
                  <h4 className="font-bold text-lg text-white">Stats Voting Sessions</h4>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Real-time collaborative stat reviews with your team</p>
                </div>
                <div className="text-4xl">📋</div>
              </div>
            </Link>
          </div>
        </div>


        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow overflow-hidden relative hover:border-neutral-700 transition">
            <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full opacity-10" style={{ backgroundColor: 'var(--accent-purple)' }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">🎯</div>
              <h4 className="font-bold text-white mb-2">Track Stats</h4>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Monitor 70 different statistics across 7 categories</p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow overflow-hidden relative hover:border-neutral-700 transition">
            <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full opacity-10" style={{ backgroundColor: 'var(--accent-blue)' }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">💬</div>
              <h4 className="font-bold text-white mb-2">Collaborate</h4>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Suggest changes and vote on updates with your team</p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 card-shadow overflow-hidden relative hover:border-neutral-700 transition">
            <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full opacity-10" style={{ backgroundColor: 'var(--accent-green)' }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">📊</div>
              <h4 className="font-bold text-white mb-2">Review Progress</h4>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Quarterly sessions for team consensus and feedback</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

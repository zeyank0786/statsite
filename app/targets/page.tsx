'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { STAT_DESCRIPTIONS } from '@/lib/statDescriptions';
import StatDescriptionModal from '@/components/StatDescriptionModal';
import { getCategoryMeta, orderCategories, orderStats, scaleMax, categoryCodeOfStat } from '@/lib/categories';
import { getUserColorHex } from '@/lib/userColors';
import { SearchIcon, XIcon, CheckIcon, TargetIcon } from '@/components/icons';
import LockoutBanner, { useMyLockouts } from '@/components/LockoutBanner';

interface Target {
  id: string;
  playerId: string;
  statCode: string;
  statLabel: string;
  username: string;
}

interface StatOption {
  code: string;
  label: string;
}

export default function TargetsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const myLockouts = useMyLockouts(status === 'authenticated');
  const [selectedTargets, setSelectedTargets] = useState<StatOption[]>([]);
  const [allTargets, setAllTargets] = useState<Target[]>([]);
  const [availableStats, setAvailableStats] = useState<StatOption[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, number>>({});
  const [allPlayersStats, setAllPlayersStats] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'total'>('default');
  const [sortAscending, setSortAscending] = useState(true);
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

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
        const userTargets = data.filter((t: Target) => t.playerId === currentPlayerId);
        setSelectedTargets(userTargets.map((t: Target) => ({ code: t.statCode, label: t.statLabel })));
      }

      // Your visible stat catalog + current values come from your profile API
      const statsRes = await fetch(`/api/players/${currentPlayerId}`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const statsMap: Record<string, number> = {};
        const options: StatOption[] = [];
        for (const category of orderCategories<any>(statsData.categories || [])) {
          for (const stat of orderStats<any>(category.stats || [])) {
            statsMap[stat.code] = stat.value;
            options.push({ code: stat.code, label: stat.label });
          }
        }
        setPlayerStats(statsMap);
        setAvailableStats(options);
      }

      const otherPlayerIds = [
        ...new Set(data.filter((t) => t.playerId !== currentPlayerId).map((t) => t.playerId)),
      ];
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

  const handleSelectTarget = (stat: StatOption) => {
    setSaved(false);
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
        setSaved(true);
        await loadTargets();
      }
    } catch (error) {
      console.error('Failed to save targets:', error);
    } finally {
      setSaving(false);
    }
  };

  const getValueColorClass = (value: number) => {
    if (value >= 8) return 'text-emerald-400';
    if (value >= 4) return 'text-orange-400';
    return 'text-red-400';
  };

  const getColorCategory = (value: number): 'green' | 'yellow' | 'red' => {
    if (value >= 8) return 'green';
    if (value >= 4) return 'yellow';
    return 'red';
  };

  const getSortedStats = (stats: StatOption[]) => {
    const sorted = [...stats];
    switch (sortBy) {
      case 'name': {
        const nameSorted = sorted.sort((a, b) => a.code.localeCompare(b.code));
        return sortAscending ? nameSorted : nameSorted.reverse();
      }
      case 'total':
        return sorted.sort((a, b) => (playerStats[b.code] ?? 0) - (playerStats[a.code] ?? 0));
      default:
        return sorted.sort((a, b) => a.code.localeCompare(b.code));
    }
  };

  const filteredStats = availableStats.filter((stat) => {
    const matchesSearch =
      stat.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stat.code.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    const currentValue = playerStats[stat.code] ?? 0;
    if (colorFilter !== 'all' && getColorCategory(currentValue) !== colorFilter) return false;
    return true;
  });

  const sortedFilteredStats = getSortedStats(filteredStats);
  const globalMax = scaleMax(Object.values(playerStats));

  const targetsByPlayer = Array.from(
    new Map(allTargets.map((t) => [t.username, allTargets.filter((x) => x.username === t.username)])).entries()
  );

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <PageHeader title="Targets" eyebrow="Focus" eyebrowColor="var(--accent-green)" />
        <div className="glass h-48 animate-pulse mb-6" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Targets"
        subtitle="Each of us commits to 3 stats. Lock in, then bring the evidence."
        eyebrow="Focus"
        eyebrowColor="var(--accent-green)"
      />

      <LockoutBanner locks={myLockouts} feature="targets" />

      {/* Crew targets */}
      <section className="mb-10 animate-rise">
        <h2 className="font-display text-xl font-bold text-white mb-4">Crew Targets</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fill,minmax(250px,1fr))] gap-4">
          {targetsByPlayer.map(([playerName, targets]) => {
            const playerId = targets.length > 0 ? targets[0].playerId : null;
            const isCurrentUser = playerId === currentPlayerId;
            const playerStatValues = isCurrentUser
              ? playerStats
              : playerId
              ? allPlayersStats[playerId] || {}
              : {};
            const hex = playerId ? getUserColorHex(playerId) : '#22d3ee';
            const cardMax = scaleMax(Object.values(playerStatValues));

            return (
              <div key={playerName} className="glass card-shadow p-5" style={{ borderTop: `3px solid ${hex}` }}>
                <div className="flex items-center gap-2.5 mb-4">
                  {playerId && <Avatar id={playerId} name={playerName} size={30} />}
                  <h3 className="font-display font-bold text-white truncate">{playerName}</h3>
                  {isCurrentUser && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ml-auto" style={{ background: `${hex}22`, color: hex }}>
                      you
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {targets.length > 0 ? (
                    targets.map((target) => {
                      const value = playerStatValues[target.statCode] ?? 0;
                      const meta = getCategoryMeta(categoryCodeOfStat(target.statCode));
                      return (
                        <div
                          key={target.id}
                          className="rounded-xl px-3 py-2.5 border"
                          style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white leading-snug">{target.statLabel}</p>
                              <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: meta.hex }}>
                                {target.statCode}
                              </p>
                            </div>
                            <StatDescriptionModal
                              statCode={target.statCode}
                              statLabel={target.statLabel}
                              description={STAT_DESCRIPTIONS[target.statCode] || 'No description available'}
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(100, (value / cardMax) * 100)}%`, background: meta.hex }}
                              />
                            </div>
                            <span className={`text-xs font-bold ${getValueColorClass(value)}`}>{value} pts</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                      No targets yet
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {targetsByPlayer.length === 0 && (
            <div className="glass col-span-full text-center py-10">
              <p style={{ color: 'var(--text-secondary)' }}>Nobody has set targets yet. Be the first.</p>
            </div>
          )}
        </div>
      </section>

      {/* Your targets */}
      <section className="animate-rise animate-rise-1">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Your Targets</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {selectedTargets.length} of 3 selected
            </p>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-gradient">
            <CheckIcon size={16} />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save targets'}
          </button>
        </div>

        {/* Selected slots */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {selectedTargets.map((target, idx) => {
            const currentValue = playerStats[target.code] ?? 0;
            const meta = getCategoryMeta(categoryCodeOfStat(target.code));
            return (
              <div
                key={target.code}
                className="rounded-2xl p-5 border card-shadow"
                style={{
                  borderColor: `${meta.hex}55`,
                  background: `linear-gradient(150deg, ${meta.hex}14, transparent 70%)`,
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: meta.hex }}>
                    Target {idx + 1}
                  </p>
                  <button
                    onClick={() => handleSelectTarget(target)}
                    className="text-neutral-400 hover:text-red-400 transition"
                    title="Remove target"
                  >
                    <XIcon size={15} />
                  </button>
                </div>
                <h3 className="font-semibold text-white leading-snug mb-1">{target.label}</h3>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-3 text-neutral-500">{target.code}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, (currentValue / globalMax) * 100)}%`, background: meta.hex }}
                    />
                  </div>
                  <span className={`text-sm font-bold ${getValueColorClass(currentValue)}`}>{currentValue} pts</span>
                </div>
              </div>
            );
          })}
          {[...Array(3 - selectedTargets.length)].map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="rounded-2xl p-5 border border-dashed flex flex-col items-center justify-center gap-2 min-h-[140px]"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              <TargetIcon size={22} className="opacity-30" />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Empty slot
              </p>
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <div className="glass card-shadow p-4 mb-4 space-y-3">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
              <SearchIcon size={16} />
            </span>
            <input
              type="text"
              placeholder="Search stats by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field pl-10"
            />
          </div>
          <div className="flex gap-1.5 items-center flex-wrap">
            {(['default', 'name', 'total'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  sortBy === key ? 'text-black' : 'text-neutral-400 hover:text-white'
                }`}
                style={sortBy === key ? { backgroundColor: 'var(--accent-cyan)' } : {}}
              >
                {key}
              </button>
            ))}
            {sortBy === 'name' && (
              <button
                onClick={() => setSortAscending(!sortAscending)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-black"
                style={{ backgroundColor: 'var(--accent-cyan)' }}
              >
                {sortAscending ? 'A→Z' : 'Z→A'}
              </button>
            )}
            <span className="w-px self-stretch mx-1" style={{ background: 'var(--surface-border)' }} />
            {(
              [
                { key: 'all', label: 'All', color: 'var(--accent-cyan)' },
                { key: 'green', label: 'Strong', color: 'var(--accent-green)' },
                { key: 'yellow', label: 'Medium', color: 'var(--accent-orange)' },
                { key: 'red', label: 'Weak', color: 'var(--accent-red)' },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setColorFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  colorFilter === f.key ? 'text-white' : 'text-neutral-400 hover:text-white'
                }`}
                style={
                  colorFilter === f.key
                    ? { background: `color-mix(in srgb, ${f.color} 22%, transparent)`, borderColor: `color-mix(in srgb, ${f.color} 55%, transparent)` }
                    : { borderColor: 'var(--surface-border)' }
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {sortedFilteredStats.map((stat) => {
            const isSelected = !!selectedTargets.find((t) => t.code === stat.code);
            const isDisabled = !isSelected && selectedTargets.length >= 3;
            const currentValue = playerStats[stat.code] ?? 0;
            const meta = getCategoryMeta(categoryCodeOfStat(stat.code));

            return (
              <button
                key={stat.code}
                onClick={() => handleSelectTarget(stat)}
                disabled={isDisabled}
                className={`text-left px-4 py-3 rounded-xl border transition ${
                  isSelected
                    ? 'text-white'
                    : isDisabled
                    ? 'opacity-40 cursor-not-allowed text-neutral-500'
                    : 'text-white hover:bg-white/[0.04]'
                }`}
                style={{
                  borderColor: isSelected ? `${meta.hex}88` : 'var(--surface-border)',
                  background: isSelected ? `${meta.hex}14` : 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug">{stat.label}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: meta.hex }}>
                      {stat.code}
                    </p>
                    <p className={`text-xs mt-1.5 font-semibold ${getValueColorClass(currentValue)}`}>
                      Current: {currentValue} pts
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatDescriptionModal
                      statCode={stat.code}
                      statLabel={stat.label}
                      description={STAT_DESCRIPTIONS[stat.code] || 'No description available'}
                    />
                    {isSelected && (
                      <span style={{ color: meta.hex }}>
                        <CheckIcon size={16} />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

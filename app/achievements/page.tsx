'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import AchievementBadge, { AchievementData } from '@/components/AchievementBadge';
import { getUserColorHex } from '@/lib/userColors';
import { STAT_TIERS } from '@/lib/categories';

interface Player {
  id: string;
  username: string;
}

/** Section order on the page (any unknown group lands at the end). */
const GROUP_ORDER = ['Milestones', 'Categories', 'Momentum', 'Crew', 'Grind', 'Community'];

const GROUP_BLURBS: Record<string, string> = {
  Milestones: 'Climb the tier ladder on individual stats',
  Categories: 'Build whole areas, not just single stats',
  Momentum: 'Recent trajectory — what have you done lately?',
  Crew: 'Standing among the others (these can be taken from you)',
  Grind: 'All-time volume. No shortcuts.',
  Community: 'Evidence, proposals and votes — keeping the system honest',
};

export default function AchievementsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [byPlayer, setByPlayer] = useState<Record<string, AchievementData[]>>({});
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);

  const currentPlayerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadAll();
    }
  }, [status, router]);

  useEffect(() => {
    if (!selectedId && currentPlayerId) setSelectedId(currentPlayerId);
  }, [currentPlayerId, selectedId]);

  const loadAll = async () => {
    try {
      const [playersRes, achievementsRes] = await Promise.all([
        fetch('/api/players'),
        fetch('/api/achievements'),
      ]);
      if (playersRes.ok) {
        const list: Player[] = await playersRes.json();
        setPlayers(list);
        if (!currentPlayerId && list.length > 0) setSelectedId((prev) => prev || list[0].id);
      }
      if (achievementsRes.ok) {
        const data = await achievementsRes.json();
        setByPlayer(data.achievements || {});
      }
    } catch (error) {
      console.error('Failed to load achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const achievements = byPlayer[selectedId] || [];
  const earnedCount = achievements.filter((a) => a.earned).length;
  const isOwn = selectedId === currentPlayerId;

  const groups = [
    ...GROUP_ORDER.filter((g) => achievements.some((a) => (a.group || 'Other') === g)),
    ...[...new Set(achievements.map((a) => a.group || 'Other'))].filter(
      (g) => !GROUP_ORDER.includes(g)
    ),
  ];

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <PageHeader title="Achievements" eyebrow="Trophy Case" eyebrowColor="var(--accent-yellow)" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Achievements"
        subtitle="Everything there is to earn — and how far along you are."
        eyebrow="Trophy Case"
        eyebrowColor="var(--accent-yellow)"
      />

      {/* Player switcher */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {players.map((p) => {
          const hex = getUserColorHex(p.id);
          const active = selectedId === p.id;
          const count = (byPlayer[p.id] || []).filter((a) => a.earned).length;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition ${
                active ? 'text-white' : 'text-neutral-300 hover:text-white'
              }`}
              style={{
                borderColor: active ? hex : 'var(--surface-border)',
                background: active ? `${hex}1f` : 'transparent',
              }}
            >
              <Avatar id={p.id} name={p.username} size={22} />
              {p.username}
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${hex}26`, color: hex }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progress summary */}
      <div className="glass card-shadow p-5 mb-6 animate-rise">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <p className="font-display text-lg font-bold text-white">
            {isOwn ? 'Your progress' : `${players.find((p) => p.id === selectedId)?.username || ''}'s progress`}
          </p>
          <p className="text-sm font-bold" style={{ color: 'var(--accent-yellow)' }}>
            {earnedCount} / {achievements.length} earned
          </p>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${achievements.length ? (earnedCount / achievements.length) * 100 : 0}%`,
              background: 'linear-gradient(90deg, var(--accent-orange), var(--accent-yellow))',
            }}
          />
        </div>

        {/* Tier ladder legend */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {STAT_TIERS.map((tier) => (
            <span
              key={tier.name}
              className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide"
              style={{ background: `${tier.hex}1a`, color: tier.hex }}
            >
              {tier.name} · {tier.min}–{tier.max}
            </span>
          ))}
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-6">
        {groups.map((group, gi) => {
          const groupAchievements = achievements.filter((a) => (a.group || 'Other') === group);
          const groupEarned = groupAchievements.filter((a) => a.earned).length;
          return (
            <section
              key={group}
              className="glass card-shadow p-5 md:p-6 animate-rise"
              style={{ animationDelay: `${Math.min(gi * 0.05, 0.3)}s` }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="font-display text-xl font-bold text-white">{group}</h2>
                <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                  {groupEarned}/{groupAchievements.length}
                </span>
              </div>
              {GROUP_BLURBS[group] && (
                <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {GROUP_BLURBS[group]}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupAchievements.map((a) => (
                  <AchievementBadge key={a.id} achievement={a} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { getUserColorHex } from '@/lib/userColors';
import { getCategoryMeta, scaleMax } from '@/lib/categories';
import { CompareIcon, ChevronRightIcon, AwardIcon } from '@/components/icons';

interface LeaderboardPlayer {
  id: string;
  username: string;
  overall: number;
  categories: { code: string; label: string; avg: number }[];
  net90: number;
  achievementsEarned: number;
  bestStat: { label: string; value: number; categoryCode: string } | null;
}

export default function PlayersPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  const currentPlayerId = (session?.user as any)?.playerId;

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
      const res = await fetch('/api/leaderboards');
      if (res.ok) {
        const data = await res.json();
        // Alphabetical here — the leaderboard page is where ranking lives
        setPlayers(
          [...(data.players || [])].sort((a, b) => a.username.localeCompare(b.username))
        );
      }
    } catch (error) {
      console.error('Failed to load players:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <PageHeader title="Players" subtitle="The crew" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass h-64 animate-pulse" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Players"
        subtitle="Four friends, seventy stats each. Tap a card for the full breakdown."
        actions={
          <Link href="/compare" className="btn-ghost text-sm">
            <CompareIcon size={16} />
            Compare
          </Link>
        }
      />

      {players.length === 0 ? (
        <div className="glass card-shadow text-center py-20">
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            No players found. Seed the database to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))] gap-5">
          {players.map((player, idx) => {
            const hex = getUserColorHex(player.id);
            const isYou = player.id === currentPlayerId;
            const barMax = scaleMax(player.categories.map((c) => c.avg));
            return (
              <Link
                key={player.id}
                href={`/players/${player.id}`}
                className={`glass glass-hover card-shadow p-6 relative overflow-hidden group animate-rise animate-rise-${Math.min(idx + 1, 4)}`}
              >
                <div
                  className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-15 blur-2xl transition group-hover:opacity-30 pointer-events-none"
                  style={{ backgroundColor: hex }}
                />
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <Avatar id={player.id} name={player.username} size={52} ring />
                    {isYou && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
                        style={{ background: `${hex}22`, color: hex }}
                      >
                        You
                      </span>
                    )}
                  </div>

                  <h2 className="font-display text-xl font-bold text-white mb-1">
                    {player.username}
                  </h2>
                  <div className="flex items-baseline gap-1.5 mb-4">
                    <span className="font-display text-3xl font-bold" style={{ color: hex }}>
                      {player.overall.toFixed(1)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      overall
                    </span>
                    {player.net90 !== 0 && (
                      <span
                        className="text-xs font-bold ml-auto"
                        style={{
                          color: player.net90 > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                        }}
                      >
                        {player.net90 > 0 ? '+' : ''}
                        {player.net90}
                      </span>
                    )}
                  </div>

                  {/* Mini category bars in canonical order */}
                  <div className="flex items-end gap-1 h-9 mb-4">
                    {player.categories.map((cat) => {
                      const meta = getCategoryMeta(cat.code, cat.label);
                      return (
                        <div
                          key={cat.code}
                          className="flex-1 rounded-sm transition-all group-hover:opacity-100 opacity-80"
                          style={{
                            height: `${Math.max(8, Math.min(100, (cat.avg / barMax) * 100))}%`,
                            backgroundColor: meta.hex,
                          }}
                          title={`${meta.label}: ${cat.avg.toFixed(1)}`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <AwardIcon size={13} />
                      {player.achievementsEarned} badges
                    </span>
                    <span
                      className="flex items-center gap-0.5 font-semibold transition group-hover:translate-x-0.5"
                      style={{ color: hex }}
                    >
                      Profile <ChevronRightIcon size={13} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { getUserColorHex } from '@/lib/userColors';
import { getCategoryMeta, CATEGORY_ORDER } from '@/lib/categories';
import { CrownIcon, TrendUpIcon, TrendDownIcon, AwardIcon, ZapIcon } from '@/components/icons';

interface LeaderboardPlayer {
  id: string;
  username: string;
  overall: number;
  totalSum: number;
  categories: { code: string; label: string; total: number; avg: number }[];
  net90: number;
  net30: number;
  changes90: number;
  eliteStats: number;
  bestStat: { code: string; label: string; value: number; categoryCode: string } | null;
  achievementsEarned: number;
  achievementsTotal: number;
  streakWeeks?: number;
}

export default function LeaderboardPage() {
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
      load();
    }
  }, [status, router]);

  const load = async () => {
    try {
      const res = await fetch('/api/leaderboards');
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players || []);
      }
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <PageHeader title="Leaderboard" eyebrow="Rankings" eyebrowColor="var(--accent-yellow)" />
        <div className="glass h-64 animate-pulse mb-6" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  const ranked = [...players].sort((a, b) => b.overall - a.overall);
  const improvers = [...players].sort((a, b) => b.net90 - a.net90);
  const topImprover = improvers[0];

  return (
    <AppShell>
      <PageHeader
        title="Leaderboard"
        subtitle="Overall standings, category crowns, and who's moving fastest."
        eyebrow="Rankings"
        eyebrowColor="var(--accent-yellow)"
      />

      {/* ===== Podium ===== */}
      <section className="glass card-shadow-lg relative overflow-hidden p-6 md:p-8 mb-6 animate-rise">
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-72 rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{ background: 'linear-gradient(120deg, #fbbf24, #f97316)' }}
        />
        <div className="relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {ranked.map((player, idx) => {
              const hex = getUserColorHex(player.id);
              const isYou = player.id === currentPlayerId;
              const rankStyles = [
                { label: '1st', color: '#fbbf24', glow: 'rgba(251,191,36,0.35)' },
                { label: '2nd', color: '#d4d4d8', glow: 'rgba(212,212,216,0.2)' },
                { label: '3rd', color: '#f97316', glow: 'rgba(249,115,22,0.25)' },
                { label: '4th', color: '#71717a', glow: 'transparent' },
              ][idx] || { label: `${idx + 1}th`, color: '#71717a', glow: 'transparent' };

              return (
                <Link
                  key={player.id}
                  href={`/players/${player.id}`}
                  className="relative rounded-2xl border p-5 text-center transition hover:-translate-y-1"
                  style={{
                    borderColor: idx === 0 ? 'rgba(251,191,36,0.4)' : 'var(--surface-border)',
                    background: idx === 0 ? 'rgba(251,191,36,0.06)' : 'rgba(255,255,255,0.02)',
                    boxShadow: idx === 0 ? `0 8px 40px ${rankStyles.glow}` : undefined,
                  }}
                >
                  {idx === 0 && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2" style={{ color: '#fbbf24' }}>
                      <CrownIcon size={24} />
                    </span>
                  )}
                  <p className="font-display text-sm font-bold mb-3" style={{ color: rankStyles.color }}>
                    {rankStyles.label}
                  </p>
                  <div className="flex justify-center mb-3">
                    <Avatar id={player.id} name={player.username} size={56} ring />
                  </div>
                  <p className="font-display font-bold text-white truncate">
                    {player.username}
                    {isYou && (
                      <span className="ml-1.5 text-[10px] align-middle font-bold uppercase" style={{ color: hex }}>
                        you
                      </span>
                    )}
                  </p>
                  <p className="font-display text-4xl font-bold mt-2" style={{ color: hex }}>
                    {player.overall.toFixed(1)}
                  </p>
                  {(player.streakWeeks ?? 0) > 0 && (
                    <p
                      className="mt-1.5 text-[11px] font-bold"
                      style={{ color: 'var(--accent-orange)' }}
                      title="Consecutive weeks with a stat change or evidence post"
                    >
                      🔥 {player.streakWeeks}-week streak
                    </p>
                  )}
                  <div className="flex items-center justify-center gap-1 mt-2 text-xs font-semibold">
                    {player.net90 !== 0 ? (
                      <span
                        className="flex items-center gap-0.5"
                        style={{ color: player.net90 > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                      >
                        {player.net90 > 0 ? <TrendUpIcon size={13} /> : <TrendDownIcon size={13} />}
                        {player.net90 > 0 ? '+' : ''}
                        {player.net90} / 90d
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>steady</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Fastest riser ===== */}
      {topImprover && topImprover.net90 > 0 && (
        <section
          className="glass card-shadow p-5 md:p-6 mb-6 flex items-center gap-4 flex-wrap animate-rise animate-rise-1"
          style={{ borderColor: 'rgba(52,211,153,0.3)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(52,211,153,0.15)', color: 'var(--accent-green)' }}
          >
            <ZapIcon size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-green)' }}>
              Fastest riser · last 90 days
            </p>
            <p className="text-white font-semibold">
              {topImprover.username} — +{topImprover.net90} stat points across {topImprover.changes90} changes
            </p>
          </div>
          <Avatar id={topImprover.id} name={topImprover.username} size={40} ring />
        </section>
      )}

      {/* ===== Category crowns ===== */}
      <section className="mb-6 animate-rise animate-rise-2">
        <h2 className="font-display text-xl font-bold text-white mb-4">Category Crowns</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {(() => {
            // Dynamic category list: canonical first, then admin-created ones
            const codes = new Set<string>();
            for (const p of players) for (const c of p.categories) codes.add(c.code);
            const ordered = [
              ...CATEGORY_ORDER.filter((c) => codes.has(c)),
              ...[...codes].filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c)),
            ];
            return ordered.map((code) => {
            const catLabel = players
              .flatMap((p) => p.categories)
              .find((c) => c.code === code)?.label;
            const meta = getCategoryMeta(code, catLabel);
            const standings = [...players]
              .map((p) => ({
                player: p,
                avg: p.categories.find((c) => c.code === code)?.avg ?? 0,
              }))
              .sort((a, b) => b.avg - a.avg);
            const leader = standings[0];
            if (!leader) return null;
            const tied = standings.filter((s) => s.avg === leader.avg).length > 1;
            return (
              <div
                key={code}
                className="rounded-2xl border p-4"
                style={{
                  borderColor: `${meta.hex}44`,
                  background: `linear-gradient(160deg, ${meta.hex}14, transparent 65%)`,
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: meta.hex }}>
                  {meta.short}
                </p>
                <p className="text-xs font-medium text-white mb-3 truncate" title={meta.label}>
                  {meta.label}
                </p>
                <div className="flex items-center gap-2">
                  <Avatar id={leader.player.id} name={leader.player.username} size={30} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {tied ? 'Tied' : leader.player.username}
                    </p>
                    <p className="text-xs font-bold" style={{ color: meta.hex }}>
                      {leader.avg.toFixed(1)} avg
                    </p>
                  </div>
                </div>
              </div>
            );
            });
          })()}
        </div>
      </section>

      {/* ===== Full table ===== */}
      <section className="glass card-shadow overflow-hidden animate-rise animate-rise-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: 'var(--surface-border)' }}>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>#</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Player</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-secondary)' }}>Overall</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-secondary)' }}>90d</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-secondary)' }}>8+ stats</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--text-secondary)' }}>Badges</th>
                <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Best stat</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((player, idx) => {
                const hex = getUserColorHex(player.id);
                const bestMeta = player.bestStat ? getCategoryMeta(player.bestStat.categoryCode) : null;
                return (
                  <tr
                    key={player.id}
                    className="border-b last:border-0 hover:bg-white/[0.03] transition cursor-pointer"
                    style={{ borderColor: 'var(--surface-border)' }}
                    onClick={() => router.push(`/players/${player.id}`)}
                  >
                    <td className="px-4 py-4 font-display font-bold" style={{ color: idx === 0 ? '#fbbf24' : 'var(--text-secondary)' }}>
                      {idx + 1}
                    </td>
                    <td className="px-4 py-4">
                      <span className="flex items-center gap-2.5">
                        <Avatar id={player.id} name={player.username} size={30} />
                        <span className="font-semibold text-white">{player.username}</span>
                        {player.id === currentPlayerId && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${hex}22`, color: hex }}>
                            you
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-display font-bold text-lg" style={{ color: hex }}>
                      {player.overall.toFixed(1)}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold" style={{ color: player.net90 > 0 ? 'var(--accent-green)' : player.net90 < 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                      {player.net90 > 0 ? '+' : ''}
                      {player.net90}
                    </td>
                    <td className="px-4 py-4 text-right text-white font-semibold">{player.eliteStats}</td>
                    <td className="px-4 py-4 text-right">
                      <span className="inline-flex items-center gap-1 text-white font-semibold">
                        <AwardIcon size={14} className="opacity-60" />
                        {player.achievementsEarned}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {player.bestStat && bestMeta ? (
                        <span className="text-xs">
                          <span className="text-white font-medium">{player.bestStat.label}</span>{' '}
                          <span className="font-bold" style={{ color: bestMeta.hex }}>
                            {player.bestStat.value}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

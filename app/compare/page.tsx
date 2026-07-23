'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import RadarChart from '@/components/RadarChart';
import { orderCategories, getCategoryMeta, computeOverallScore, scaleMax, categoryRadarValue } from '@/lib/categories';
import { getUserColorHex } from '@/lib/userColors';

interface Player {
  id: string;
  username: string;
}

interface ProfileData {
  player: { id: string; username: string };
  categories: { code: string; label: string; stats: { id: string; code: string; label: string; value: number }[] }[];
}

function CompareContent() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [players, setPlayers] = useState<Player[]>([]);
  const [profileA, setProfileA] = useState<ProfileData | null>(null);
  const [profileB, setProfileB] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const currentPlayerId = (session?.user as any)?.playerId;
  const paramA = searchParams.get('a');
  const paramB = searchParams.get('b');

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
      const res = await fetch('/api/players');
      if (res.ok) {
        const data = await res.json();
        setPlayers(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load players:', error);
    }
  };

  // Resolve defaults once players are known
  const idA = paramA || currentPlayerId || players[0]?.id || '';
  const idB =
    paramB && paramB !== idA
      ? paramB
      : players.find((p) => p.id !== idA)?.id || '';

  useEffect(() => {
    if (!idA || !idB) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetch(`/api/players/${idA}`), fetch(`/api/players/${idB}`)])
      .then(async ([resA, resB]) => {
        if (cancelled) return;
        if (resA.ok) setProfileA(await resA.json());
        if (resB.ok) setProfileB(await resB.json());
      })
      .catch((e) => console.error('Failed to load comparison:', e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [idA, idB]);

  const setSide = (side: 'a' | 'b', id: string) => {
    const next = new URLSearchParams();
    next.set('a', side === 'a' ? id : idA);
    next.set('b', side === 'b' ? id : idB);
    router.replace(`/compare?${next.toString()}`);
  };

  const hexA = idA ? getUserColorHex(idA) : '#22d3ee';
  let hexB = idB ? getUserColorHex(idB) : '#ec4899';
  if (hexB === hexA) hexB = '#ec4899' === hexA ? '#a855f7' : '#ec4899';

  const catsA = profileA ? orderCategories(profileA.categories) : [];
  const catsB = profileB ? orderCategories(profileB.categories) : [];
  const ready = catsA.length > 0 && catsB.length > 0 && !loading;

  // Axes = the union of both players' visible categories (per-player hidden
  // stats/categories can differ), values = category totals, shared max so the
  // radar reads as a true ratio comparison.
  const unionCats = orderCategories([
    ...catsA,
    ...catsB.filter((cb) => !catsA.some((ca) => ca.code === cb.code)),
  ]);
  // Normalised per-10-stats value, so categories of different sizes compare fairly
  const categoryTotal = (cats: typeof catsA, code: string) => {
    const cat = cats.find((c) => c.code === code);
    return cat ? categoryRadarValue(cat.stats) : 0;
  };

  const labels = unionCats.map((c) => getCategoryMeta(c.code).short);
  const labelColors = unionCats.map((c) => getCategoryMeta(c.code).hex);
  const valuesA = unionCats.map((c) => categoryTotal(catsA, c.code));
  const valuesB = unionCats.map((c) => categoryTotal(catsB, c.code));
  const radarMax = Math.max(...valuesA, ...valuesB, 1);

  const overallA = profileA ? computeOverallScore(profileA.categories) : 0;
  const overallB = profileB ? computeOverallScore(profileB.categories) : 0;

  let winsA = 0;
  let winsB = 0;
  unionCats.forEach((cat, i) => {
    const a = valuesA[i] ?? 0;
    const b = valuesB[i] ?? 0;
    if (a > b) winsA++;
    else if (b > a) winsB++;
  });

  const PlayerPicker = ({ side, selected }: { side: 'a' | 'b'; selected: string }) => (
    <div className="flex flex-wrap gap-2">
      {players.map((p) => {
        const active = p.id === selected;
        const hex = getUserColorHex(p.id);
        const disabled = side === 'a' ? p.id === idB : p.id === idA;
        return (
          <button
            key={p.id}
            onClick={() => !disabled && setSide(side, p.id)}
            disabled={disabled}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition ${
              active ? 'text-white' : disabled ? 'opacity-30 cursor-not-allowed text-neutral-500' : 'text-neutral-300 hover:text-white'
            }`}
            style={{
              borderColor: active ? hex : 'var(--surface-border)',
              background: active ? `${hex}1f` : 'transparent',
            }}
          >
            <Avatar id={p.id} name={p.username} size={22} />
            {p.username}
          </button>
        );
      })}
    </div>
  );

  return (
    <AppShell>
      <PageHeader
        title="Head to Head"
        subtitle="Pick two of the crew and see exactly where each one leads."
        eyebrow="Compare"
      />

      {/* Pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="glass card-shadow p-5 animate-rise">
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: hexA }}>
            Player One
          </p>
          <PlayerPicker side="a" selected={idA} />
        </div>
        <div className="glass card-shadow p-5 animate-rise animate-rise-1">
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: hexB }}>
            Player Two
          </p>
          <PlayerPicker side="b" selected={idB} />
        </div>
      </div>

      {!ready ? (
        <div className="glass h-96 animate-pulse" />
      ) : (
        <>
          {/* Overview */}
          <section className="glass card-shadow p-6 md:p-8 mb-6 animate-rise animate-rise-2">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 items-center">
              <ScoreCard
                id={idA}
                name={profileA!.player.username}
                overall={overallA}
                wins={winsA}
                hex={hexA}
                align="left"
              />
              <div className="w-full max-w-[340px] mx-auto order-first lg:order-none">
                <RadarChart
                  labels={labels}
                  labelColors={labelColors}
                  series={[
                    { label: profileA!.player.username, color: hexA, values: valuesA },
                    { label: profileB!.player.username, color: hexB, values: valuesB },
                  ]}
                  max={radarMax}
                  size={340}
                />
                <div className="flex justify-center gap-5 mt-2">
                  <LegendDot hex={hexA} label={profileA!.player.username} />
                  <LegendDot hex={hexB} label={profileB!.player.username} />
                </div>
              </div>
              <ScoreCard
                id={idB}
                name={profileB!.player.username}
                overall={overallB}
                wins={winsB}
                hex={hexB}
                align="right"
              />
            </div>
          </section>

          {/* Category bars */}
          <section className="glass card-shadow p-6 md:p-8 mb-6 animate-rise animate-rise-3">
            <h2 className="font-display text-xl font-bold text-white mb-6">Category Breakdown</h2>
            <div className="space-y-5">
              {unionCats.map((cat, i) => {
                const meta = getCategoryMeta(cat.code, cat.label);
                const a = valuesA[i] ?? 0;
                const b = valuesB[i] ?? 0;
                const rowMax = radarMax;
                return (
                  <div key={cat.code}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold" style={{ color: hexA }}>
                        {a} pts
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: meta.hex }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.hex }} />
                        {meta.label}
                      </span>
                      <span className="text-sm font-bold" style={{ color: hexB }}>
                        {b} pts
                      </span>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden flex justify-end" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, (a / rowMax) * 100)}%`, background: `linear-gradient(270deg, ${hexA}, ${hexA}66)` }}
                        />
                      </div>
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, (b / rowMax) * 100)}%`, background: `linear-gradient(90deg, ${hexB}, ${hexB}66)` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Per-stat table */}
          <section className="space-y-5">
            {unionCats.map((cat) => {
              const meta = getCategoryMeta(cat.code, cat.label);
              const catB = catsB.find((c) => c.code === cat.code);
              const catA = catsA.find((c) => c.code === cat.code);
              const rowStats = (catA ?? cat).stats;
              const statsB = new Map(catB?.stats.map((s) => [s.code, s.value]) || []);
              const statMax = scaleMax([
                ...rowStats.map((s) => s.value),
                ...(catB?.stats.map((s) => s.value) || []),
              ]);
              return (
                <div key={cat.code} className="glass card-shadow p-5 md:p-6">
                  <h3 className="font-display text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-6 rounded-full" style={{ background: meta.hex }} />
                    {cat.label}
                  </h3>
                  <div className="space-y-1">
                    {rowStats.map((stat) => {
                      const a = catA ? stat.value : 0;
                      const b = statsB.get(stat.code) ?? 0;
                      const diff = a - b;
                      return (
                        <div
                          key={stat.code}
                          className="grid grid-cols-[2.5rem_1fr_2.5rem] sm:grid-cols-[3rem_1fr_5rem_1fr_3rem] items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition"
                        >
                          <span className="text-sm font-bold text-right" style={{ color: diff > 0 ? hexA : 'rgba(255,255,255,0.45)' }}>
                            {a}
                          </span>
                          <div className="hidden sm:flex h-1.5 rounded-full overflow-hidden justify-end" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (a / statMax) * 100)}%`, background: hexA }} />
                          </div>
                          <span className="text-xs text-center font-medium truncate col-span-1 sm:col-auto" style={{ color: 'var(--text-secondary)' }} title={stat.label}>
                            <span className="block truncate">{stat.label}</span>
                            {diff !== 0 && (
                              <span className="text-[10px] font-bold" style={{ color: diff > 0 ? hexA : hexB }}>
                                {diff > 0 ? `+${diff}` : diff} {diff > 0 ? '◄' : '►'}
                              </span>
                            )}
                          </span>
                          <div className="hidden sm:flex h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (b / statMax) * 100)}%`, background: hexB }} />
                          </div>
                          <span className="text-sm font-bold" style={{ color: diff < 0 ? hexB : 'rgba(255,255,255,0.45)' }}>
                            {b}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}
    </AppShell>
  );
}

function ScoreCard({
  id,
  name,
  overall,
  wins,
  hex,
  align,
}: {
  id: string;
  name: string;
  overall: number;
  wins: number;
  hex: string;
  align: 'left' | 'right';
}) {
  return (
    <div className={`text-center ${align === 'left' ? 'lg:text-left' : 'lg:text-right'}`}>
      <div className={`flex items-center gap-3 justify-center ${align === 'left' ? 'lg:justify-start' : 'lg:justify-end lg:flex-row-reverse'}`}>
        <Avatar id={id} name={name} size={52} ring />
        <div>
          <p className="font-display text-xl font-bold text-white">{name}</p>
          <p className="text-xs font-semibold" style={{ color: hex }}>
            leads {wins} {wins === 1 ? 'category' : 'categories'}
          </p>
        </div>
      </div>
      <p className="font-display text-6xl font-bold mt-4 leading-none" style={{ color: hex }}>
        {overall.toFixed(1)}
      </p>
      <p className="text-xs mt-1 uppercase font-semibold tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        Overall
      </p>
    </div>
  );
}

function LegendDot({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: hex }} />
      {label}
    </span>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}

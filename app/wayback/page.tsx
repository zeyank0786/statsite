'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import RadarChart from '@/components/RadarChart';
import CountUp from '@/components/CountUp';
import { getCategoryMeta, categoryRadarValue, getStatTier } from '@/lib/categories';
import { getUserColorHex } from '@/lib/userColors';
import { ClockIcon, TrendUpIcon, TrendDownIcon } from '@/components/icons';

/**
 * Compare-to-past-me: the whole stat sheet on any two dates, and everything
 * that moved between them.
 *
 * Values are rewound exactly from StatHistory rather than sampled, so a date
 * shows what was really on the board that day.
 */

interface SnapshotStat {
  statId: string;
  code: string;
  label: string;
  value: number;
}

interface SnapshotCategory {
  code: string;
  label: string;
  stats: SnapshotStat[];
  total: number;
}

interface Snapshot {
  at: string;
  overall: number;
  total: number;
  categories: SnapshotCategory[];
}

interface StatDelta {
  statId: string;
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
  from: number;
  to: number;
  delta: number;
}

interface WaybackData {
  player: { id: string; username: string };
  from: Snapshot;
  to: Snapshot;
  changed: StatDelta[];
  unchangedCount: number;
  earliestChangeAt: string | null;
  changeCount: number;
}

interface Player {
  id: string;
  username: string;
}

/** ISO timestamp → the `yyyy-mm-dd` an <input type="date"> expects. */
function toDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function daysAgoInput(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const PRESETS: { label: string; days: number }[] = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 182 },
  { label: '1 year', days: 365 },
];

function WaybackContent() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPlayerId = String((session?.user as { playerId?: string } | undefined)?.playerId || '');
  const paramFrom = searchParams.get('from');
  const paramTo = searchParams.get('to');
  const paramPlayer = searchParams.get('playerId');

  const [players, setPlayers] = useState<Player[]>([]);
  const [data, setData] = useState<WaybackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [from, setFrom] = useState(paramFrom || daysAgoInput(90));
  const [to, setTo] = useState(paramTo || daysAgoInput(0));
  const playerId = paramPlayer || currentPlayerId;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/players')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setPlayers(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [status]);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !playerId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to, playerId });
      const res = await fetch(`/api/history/wayback?${params}`);
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || 'Failed to load comparison');
        return;
      }
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load comparison');
    } finally {
      setLoading(false);
    }
  }, [status, playerId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the URL in step so a particular window is shareable/bookmarkable.
  useEffect(() => {
    const next = new URLSearchParams({ from, to });
    if (playerId && playerId !== currentPlayerId) next.set('playerId', playerId);
    router.replace(`/wayback?${next.toString()}`, { scroll: false });
  }, [from, to, playerId, currentPlayerId, router]);

  const hex = playerId ? getUserColorHex(playerId) : '#22d3ee';
  const isSelf = playerId === currentPlayerId;

  // Radar axes = the union of both snapshots, on a shared max so the two
  // polygons read as a true like-for-like comparison.
  const radar = useMemo(() => {
    if (!data) return null;
    const codes = [
      ...new Set([
        ...data.from.categories.map((c) => c.code),
        ...data.to.categories.map((c) => c.code),
      ]),
    ];
    const valueOf = (snapshot: Snapshot, code: string) => {
      const category = snapshot.categories.find((c) => c.code === code);
      return category ? categoryRadarValue(category.stats) : 0;
    };
    const fromValues = codes.map((code) => valueOf(data.from, code));
    const toValues = codes.map((code) => valueOf(data.to, code));
    return {
      labels: codes.map((code) => getCategoryMeta(code).short),
      labelColors: codes.map((code) => getCategoryMeta(code).hex),
      fromValues,
      toValues,
      max: Math.max(...fromValues, ...toValues, 1),
    };
  }, [data]);

  const overallDelta = data ? Math.round((data.to.overall - data.from.overall) * 10) / 10 : 0;
  const gains = data ? data.changed.filter((c) => c.delta > 0) : [];
  const losses = data ? data.changed.filter((c) => c.delta < 0) : [];

  return (
    <AppShell>
      <PageHeader
        title="Compare to past you"
        subtitle="Pick any two dates and see exactly what moved in between."
        eyebrow="Wayback"
        eyebrowColor="var(--accent-cyan)"
      />

      {/* Controls */}
      <section className="glass card-shadow p-5 mb-6 animate-rise">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              From
            </label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="field py-2 w-[165px]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              To
            </label>
            <input
              type="date"
              value={to}
              min={from}
              max={daysAgoInput(0)}
              onChange={(e) => setTo(e.target.value)}
              className="field py-2 w-[165px]"
            />
          </div>

          {players.length > 1 && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Whose history
              </label>
              <select
                value={playerId}
                onChange={(e) => {
                  const next = new URLSearchParams({ from, to });
                  if (e.target.value !== currentPlayerId) next.set('playerId', e.target.value);
                  router.replace(`/wayback?${next.toString()}`, { scroll: false });
                }}
                className="field py-2 w-[180px]"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === currentPlayerId ? `${p.username} (you)` : p.username}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                setFrom(daysAgoInput(preset.days));
                setTo(daysAgoInput(0));
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:bg-white/[0.05]"
              style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
            >
              Last {preset.label}
            </button>
          ))}
          {data?.earliestChangeAt && (
            <button
              onClick={() => {
                setFrom(toDateInput(data.earliestChangeAt as string));
                setTo(daysAgoInput(0));
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:bg-white/[0.05]"
              style={{ borderColor: `${hex}55`, color: hex }}
            >
              All time
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10 mb-6">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="glass h-96 animate-pulse" />
      ) : data ? (
        <>
          {/* Headline: then vs now */}
          <section className="glass card-shadow p-6 mb-6 animate-rise">
            <div className="flex items-center gap-3 mb-5">
              <Avatar id={data.player.id} name={data.player.username} size={40} />
              <div>
                <p className="font-display font-bold text-white">
                  {isSelf ? 'You' : data.player.username}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {data.changeCount} change{data.changeCount === 1 ? '' : 's'} in this window
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-5 items-center">
              {[
                { snapshot: data.from, caption: 'Then', dim: true },
                null,
                { snapshot: data.to, caption: 'Now', dim: false },
              ].map((side, i) =>
                side === null ? (
                  <div key="arrow" className="hidden sm:flex flex-col items-center gap-1">
                    <ClockIcon size={20} className="text-neutral-600" />
                    <span
                      className="font-display text-2xl font-bold"
                      style={{ color: overallDelta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                    >
                      {overallDelta > 0 ? '+' : ''}
                      {overallDelta}
                    </span>
                  </div>
                ) : (
                  <div key={i} className={side.dim ? 'opacity-70' : ''}>
                    <p
                      className="text-[11px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {side.caption} · {prettyDate(side.snapshot.at)}
                    </p>
                    <p
                      className="font-display text-4xl md:text-5xl font-bold leading-none"
                      style={{ color: side.dim ? 'var(--text-secondary)' : hex }}
                    >
                      <CountUp value={side.snapshot.overall} decimals={1} />
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {side.snapshot.total} total pts
                    </p>
                  </div>
                )
              )}
            </div>
          </section>

          {/* Shape of the change */}
          {radar && (
            <section className="glass card-shadow p-6 mb-6 animate-rise">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>
                How the shape changed
              </p>
              <div className="flex flex-col items-center">
                <RadarChart
                  labels={radar.labels}
                  labelColors={radar.labelColors}
                  series={[
                    { label: prettyDate(data.from.at), color: '#71717a', values: radar.fromValues },
                    { label: prettyDate(data.to.at), color: hex, values: radar.toValues },
                  ]}
                  max={radar.max}
                  size={320}
                />
              </div>
            </section>
          )}

          {/* Per-stat movement */}
          <section className="glass card-shadow p-6 animate-rise">
            <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                What moved
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {gains.length} up · {losses.length} down · {data.unchangedCount} unchanged
              </p>
            </div>

            {data.changed.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                Nothing moved between those dates.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.changed.map((stat) => {
                  const meta = getCategoryMeta(stat.categoryCode, stat.categoryLabel);
                  const up = stat.delta > 0;
                  const fromTier = getStatTier(stat.from);
                  const toTier = getStatTier(stat.to);
                  const tierChanged = fromTier.name !== toTier.name;
                  return (
                    <div
                      key={stat.statId}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border"
                      style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <span
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ background: meta.hex }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{stat.label}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {meta.short}
                          {tierChanged && (
                            <>
                              {' · '}
                              <span style={{ color: toTier.hex }}>
                                {fromTier.name} → {toTier.name}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {stat.from} → <span className="text-white font-semibold">{stat.to}</span>
                      </span>
                      <span
                        className="flex items-center gap-1 text-sm font-bold tabular-nums shrink-0 w-14 justify-end"
                        style={{ color: up ? 'var(--accent-green)' : 'var(--accent-red)' }}
                      >
                        {up ? <TrendUpIcon size={13} /> : <TrendDownIcon size={13} />}
                        {up ? '+' : ''}
                        {stat.delta}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

export default function WaybackPage() {
  return (
    <Suspense fallback={<AppShell><div className="glass h-96 animate-pulse" /></AppShell>}>
      <WaybackContent />
    </Suspense>
  );
}

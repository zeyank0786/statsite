'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import RadarChart from '@/components/RadarChart';
import Sparkline from '@/components/Sparkline';
import AchievementBadge, { AchievementData } from '@/components/AchievementBadge';
import {
  orderCategories,
  getCategoryMeta,
  computeOverallScore,
  categoryAvg,
  scaleMax,
  CATEGORY_ORDER,
} from '@/lib/categories';
import {
  TrophyIcon,
  CompareIcon,
  TargetIcon,
  LightbulbIcon,
  ClockIcon,
  CameraIcon,
  ClipboardIcon,
  TrendUpIcon,
  TrendDownIcon,
  ChevronRightIcon,
} from '@/components/icons';

interface PlayerStats {
  player: { username: string };
  categories: any[];
}

interface Trends {
  overall: number;
  series: number[];
  perCategory: { code: string; label: string; avg: number; net90: number }[];
  net30: number;
  net90: number;
  changeCount: number;
}

const QUICK_ACTIONS = [
  { href: '/leaderboard', label: 'Leaderboard', desc: 'Who leads the crew', icon: TrophyIcon, rgb: '251, 191, 36' },
  { href: '/compare', label: 'Compare', desc: 'Head-to-head stats', icon: CompareIcon, rgb: '34, 211, 238' },
  { href: '/targets', label: 'Targets', desc: 'Your 3 focus stats', icon: TargetIcon, rgb: '52, 211, 153' },
  { href: '/reviews', label: 'Reviews', desc: 'Live stat sessions', icon: ClipboardIcon, rgb: '236, 72, 153' },
  { href: '/evidence', label: 'Evidence', desc: 'Post your receipts', icon: CameraIcon, rgb: '249, 115, 22' },
  { href: '/suggestions', label: 'Suggest', desc: 'Crew votes on changes', icon: LightbulbIcon, rgb: '168, 85, 247' },
];

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [achievements, setAchievements] = useState<AchievementData[]>([]);
  const [loading, setLoading] = useState(true);

  const playerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && playerId) {
      loadAll();
    }
  }, [status, router, playerId]);

  const loadAll = async () => {
    try {
      const [statsRes, trendsRes, achRes] = await Promise.all([
        fetch(`/api/players/${playerId}`),
        fetch(`/api/players/${playerId}/trends`),
        fetch(`/api/achievements?playerId=${playerId}`),
      ]);
      if (statsRes.ok) setPlayerStats(await statsRes.json());
      if (trendsRes.ok) setTrends(await trendsRes.json());
      if (achRes.ok) {
        const data = await achRes.json();
        setAchievements(data.achievements || []);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  const orderedCategories = playerStats ? orderCategories(playerStats.categories) : [];
  const overall = playerStats ? computeOverallScore(playerStats.categories) : 0;
  const allStats = orderedCategories.flatMap((cat: any) =>
    cat.stats.map((s: any) => ({ ...s, categoryCode: cat.code, categoryLabel: cat.label }))
  );
  const strengths = [...allStats].sort((a, b) => b.value - a.value).slice(0, 5);
  const focusAreas = [...allStats].sort((a, b) => a.value - b.value).slice(0, 5);
  const earnedAchievements = achievements.filter((a) => a.earned);

  const radarLabels = orderedCategories.map((c: any) => getCategoryMeta(c.code).short);
  const radarColors = orderedCategories.map((c: any) => getCategoryMeta(c.code).hex);
  const radarValues = orderedCategories.map((c: any) => categoryAvg(c.stats));

  return (
    <AppShell>
      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden glass card-shadow-lg p-6 md:p-10 mb-6 animate-rise">
        <div
          className="absolute -top-32 -right-24 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: 'var(--brand-gradient)' }}
        />
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 items-center">
          <div>
            <p
              className="text-xs font-bold uppercase tracking-[0.2em] mb-3"
              style={{ color: 'var(--accent-cyan)' }}
            >
              Welcome back
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-4">
              {session.user?.playerUsername}
            </h1>

            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Overall Score
                </p>
                <p className="font-display text-6xl md:text-7xl font-bold text-gradient leading-none">
                  {overall ? overall.toFixed(1) : '—'}
                </p>
              </div>

              {trends && trends.series.length > 1 && (
                <div className="pb-1">
                  <p className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Trajectory
                  </p>
                  <Sparkline data={trends.series} color="#a855f7" width={160} height={44} />
                </div>
              )}
            </div>

            {trends && (
              <div className="flex flex-wrap gap-2 mt-5">
                <DeltaChip label="30 days" value={trends.net30} />
                <DeltaChip label="90 days" value={trends.net90} />
                <span
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border"
                  style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
                >
                  {trends.changeCount} changes tracked
                </span>
              </div>
            )}

            <Link
              href={`/players/${playerId}`}
              className="btn-gradient mt-6 inline-flex"
            >
              View full profile
              <ChevronRightIcon size={16} />
            </Link>
          </div>

          {/* Radar */}
          <div className="max-w-sm w-full mx-auto lg:mx-0 lg:justify-self-end">
            {orderedCategories.length > 0 ? (
              <RadarChart
                labels={radarLabels}
                labelColors={radarColors}
                series={[{ label: 'You', color: '#a855f7', values: radarValues }]}
                max={scaleMax(radarValues)}
                size={340}
              />
            ) : (
              <div className="aspect-square rounded-full border border-dashed animate-pulse" style={{ borderColor: 'var(--surface-border)' }} />
            )}
          </div>
        </div>
      </section>

      {/* ===== Category momentum ===== */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 glass card-shadow p-6 animate-rise animate-rise-1">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-lg font-bold text-white">Category Momentum</h2>
            <Link href="/history" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent-cyan)' }}>
              View history →
            </Link>
          </div>
          <div className="space-y-4">
            {(() => {
              const rows =
                trends?.perCategory ??
                CATEGORY_ORDER.map((code) => ({ code, label: getCategoryMeta(code).label, avg: 0, net90: 0 }));
              const momentumMax = scaleMax(rows.map((r) => Number(r.avg)));
              return rows.map((cat) => {
              const meta = getCategoryMeta(cat.code, (cat as any).label);
              return (
                <div key={cat.code}>
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-sm font-medium text-white flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.hex }} />
                      <span className="truncate">{meta.label}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {cat.net90 !== 0 && (
                        <span
                          className="text-[11px] font-bold flex items-center gap-0.5"
                          style={{ color: cat.net90 > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                        >
                          {cat.net90 > 0 ? <TrendUpIcon size={12} /> : <TrendDownIcon size={12} />}
                          {cat.net90 > 0 ? '+' : ''}
                          {cat.net90}
                        </span>
                      )}
                      <span className="text-sm font-bold" style={{ color: meta.hex }}>
                        {Number(cat.avg).toFixed(1)}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, (Number(cat.avg) / momentumMax) * 100)}%`,
                        background: `linear-gradient(90deg, ${meta.hex}88, ${meta.hex})`,
                      }}
                    />
                  </div>
                </div>
              );
              });
            })()}
          </div>
        </div>

        {/* Achievements preview */}
        <div className="glass card-shadow p-6 animate-rise animate-rise-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-lg font-bold text-white">Achievements</h2>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {earnedAchievements.length}/{achievements.length || 11}
            </span>
          </div>
          {earnedAchievements.length > 0 ? (
            <div className="space-y-2.5">
              {earnedAchievements.slice(0, 4).map((a) => (
                <AchievementBadge key={a.id} achievement={a} />
              ))}
              <Link
                href={`/players/${playerId}`}
                className="block text-center text-xs font-semibold pt-2 hover:underline"
                style={{ color: 'var(--accent-cyan)' }}
              >
                See all on your profile →
              </Link>
            </div>
          ) : (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
              {loading ? 'Loading...' : 'No badges yet — keep grinding. Every stat gain counts.'}
            </p>
          )}
        </div>
      </section>

      {/* ===== Strengths / Focus ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="glass card-shadow p-6 animate-rise animate-rise-2">
          <h2 className="font-display text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span style={{ color: 'var(--accent-green)' }}><TrendUpIcon size={19} /></span>
            Your Strengths
          </h2>
          <div className="space-y-2">
            {strengths.map((stat: any) => (
              <StatRow key={stat.code} stat={stat} accent="var(--accent-green)" />
            ))}
            {strengths.length === 0 && <EmptyRows />}
          </div>
        </div>
        <div className="glass card-shadow p-6 animate-rise animate-rise-3">
          <h2 className="font-display text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span style={{ color: 'var(--accent-orange)' }}><TargetIcon size={19} /></span>
            Focus Areas
          </h2>
          <div className="space-y-2">
            {focusAreas.map((stat: any) => (
              <StatRow key={stat.code} stat={stat} accent="var(--accent-orange)" />
            ))}
            {focusAreas.length === 0 && <EmptyRows />}
          </div>
        </div>
      </section>

      {/* ===== Quick actions ===== */}
      <section className="animate-rise animate-rise-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--text-secondary)' }}>
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="glass glass-hover card-shadow p-4 group"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition group-hover:scale-110"
                style={{ background: `rgba(${action.rgb}, 0.15)`, color: `rgb(${action.rgb})` }}
              >
                <action.icon size={20} />
              </div>
              <p className="font-semibold text-white text-sm">{action.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {action.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function DeltaChip({ label, value }: { label: string; value: number }) {
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <span
      className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border"
      style={{
        color: neutral ? 'var(--text-secondary)' : positive ? 'var(--accent-green)' : 'var(--accent-red)',
        borderColor: neutral
          ? 'var(--surface-border)'
          : positive
          ? 'rgba(52, 211, 153, 0.35)'
          : 'rgba(239, 68, 68, 0.35)',
        background: neutral
          ? 'transparent'
          : positive
          ? 'rgba(52, 211, 153, 0.08)'
          : 'rgba(239, 68, 68, 0.08)',
      }}
    >
      {!neutral && (positive ? <TrendUpIcon size={13} /> : <TrendDownIcon size={13} />)}
      {positive ? '+' : ''}
      {value} <span className="font-medium opacity-70">{label}</span>
    </span>
  );
}

function StatRow({ stat, accent }: { stat: any; accent: string }) {
  const meta = getCategoryMeta(stat.categoryCode);
  return (
    <div
      className="flex items-center justify-between gap-3 p-3 rounded-xl border"
      style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{stat.label}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: meta.hex }}>
          {meta.label}
        </p>
      </div>
      <p className="text-lg font-bold shrink-0" style={{ color: accent }}>
        {stat.value}
      </p>
    </div>
  );
}

function EmptyRows() {
  return (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-xl animate-pulse"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        />
      ))}
    </div>
  );
}

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import CountUp from '@/components/CountUp';
import { SparklesIcon, TrophyIcon, CameraIcon, LightbulbIcon, ScaleIcon, TrendUpIcon, MedalIcon, HandIcon, StarIcon } from '@/components/icons';

interface Wrapped {
  season: { key: string; label: string; months: string };
  netPoints: number;
  changeCount: number;
  tierUps: number;
  topStat: { label: string; delta: number } | null;
  topCategory: { label: string; delta: number } | null;
  evidenceCount: number;
  suggestionsProposed: number;
  suggestionsApproved: number;
  votesCast: number;
  achievements: string[];
  commitmentsKept: number;
  crewRank: number | null;
  crewSize: number;
  topCrew: { name: string; net: number } | null;
  hasData: boolean;
}

interface SeasonOpt {
  key: string;
  label: string;
  months: string;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function StatCard({
  icon,
  label,
  children,
  hex,
  className = '',
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  hex: string;
  className?: string;
}) {
  return (
    <div
      className={`glass card-shadow p-5 flex flex-col animate-rise ${className}`}
      style={{ borderTop: `3px solid ${hex}` }}
    >
      <div className="flex items-center gap-2 mb-2" style={{ color: hex }}>
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      {children}
    </div>
  );
}

export default function WrappedPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Wrapped | null>(null);
  const [seasons, setSeasons] = useState<SeasonOpt[]>([]);
  const [seasonKey, setSeasonKey] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const load = async (key?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wrapped${key ? `?season=${key}` : ''}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.wrapped);
        setSeasons(json.seasons || []);
        setSeasonKey(json.wrapped?.season?.key || '');
        // Remember the latest so the dashboard banner can stop nagging.
        try {
          if (json.seasons?.[0]?.key) localStorage.setItem(`wrapped-seen-${json.seasons[0].key}`, '1');
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.error('Failed to load wrapped:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <PageHeader title="Season Wrapped" eyebrow="Your quarter" eyebrowColor="#a855f7" />
        <div className="glass h-64 animate-pulse mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass h-32 animate-pulse" />
          ))}
        </div>
      </AppShell>
    );
  }

  const w = data;
  const gained = (w?.netPoints ?? 0) >= 0;

  return (
    <AppShell>
      <PageHeader
        title="Season Wrapped"
        subtitle={w ? `${w.season.label} · ${w.season.months}` : 'Your quarter, wrapped up.'}
        eyebrow="Your quarter"
        eyebrowColor="#a855f7"
        actions={
          seasons.length > 1 ? (
            <select
              value={seasonKey}
              onChange={(e) => {
                setSeasonKey(e.target.value);
                load(e.target.value);
              }}
              className="field w-auto py-2 text-sm"
            >
              {seasons.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {!w || !w.hasData ? (
        <div className="glass card-shadow text-center py-16 px-6">
          <SparklesIcon size={30} className="opacity-30 mx-auto mb-3" />
          <p className="text-lg mb-1 text-white">Nothing to wrap yet for {w?.season.label}.</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Post evidence, earn stat changes and vote — your next Wrapped fills itself in.
          </p>
        </div>
      ) : (
        <>
          {/* Hero: net points */}
          <section
            className="relative overflow-hidden glass card-shadow-lg p-8 md:p-10 mb-6 animate-rise text-center"
            style={{ background: 'linear-gradient(150deg, rgba(168,85,247,0.18), rgba(34,211,238,0.1) 60%, transparent)' }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#c084fc' }}>
              This season you moved
            </p>
            <p className="font-display text-7xl md:text-8xl font-bold leading-none text-gradient">
              {gained ? '+' : ''}
              <CountUp value={w.netPoints} />
            </p>
            <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              net points across <span className="text-white font-semibold">{w.changeCount}</span> stat change
              {w.changeCount !== 1 ? 's' : ''}
              {w.tierUps > 0 && (
                <>
                  {' '}
                  · <span className="text-white font-semibold">{w.tierUps}</span> tier-up{w.tierUps !== 1 ? 's' : ''}
                </>
              )}
            </p>
          </section>

          {/* Grid of highlights */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {w.topStat && (
              <StatCard icon={<TrendUpIcon size={15} />} label="Biggest gain" hex="#34d399">
                <p className="text-2xl font-bold text-white leading-tight">
                  +<CountUp value={w.topStat.delta} />
                </p>
                <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                  {w.topStat.label}
                </p>
              </StatCard>
            )}

            {w.topCategory && (
              <StatCard icon={<StarIcon size={15} />} label="Top category" hex="#f5c451">
                <p className="text-2xl font-bold text-white leading-tight">{w.topCategory.label}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  +{w.topCategory.delta} this season
                </p>
              </StatCard>
            )}

            <StatCard icon={<CameraIcon size={15} />} label="Evidence posted" hex="#f97316">
              <p className="text-3xl font-bold text-white">
                <CountUp value={w.evidenceCount} />
              </p>
            </StatCard>

            <StatCard icon={<LightbulbIcon size={15} />} label="Suggestions" hex="#a855f7">
              <p className="text-3xl font-bold text-white">
                <CountUp value={w.suggestionsProposed} />
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {w.suggestionsApproved} approved
              </p>
            </StatCard>

            <StatCard icon={<ScaleIcon size={15} />} label="Votes cast" hex="#22d3ee">
              <p className="text-3xl font-bold text-white">
                <CountUp value={w.votesCast} />
              </p>
            </StatCard>

            {w.commitmentsKept > 0 && (
              <StatCard icon={<HandIcon size={15} />} label="Commitments kept" hex="#34d399">
                <p className="text-3xl font-bold text-white">
                  <CountUp value={w.commitmentsKept} />
                </p>
              </StatCard>
            )}

            {w.crewRank && (
              <StatCard icon={<MedalIcon size={15} />} label="Crew rank" hex="#fbbf24">
                <p className="text-3xl font-bold text-white">{ordinal(w.crewRank)}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  of {w.crewSize} by points gained
                </p>
              </StatCard>
            )}

            {w.topCrew && (
              <StatCard icon={<TrophyIcon size={15} />} label="Season MVP" hex="#fbbf24">
                <p className="text-2xl font-bold text-white leading-tight truncate">{w.topCrew.name}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  +{w.topCrew.net} points
                </p>
              </StatCard>
            )}
          </div>

          {/* Achievements */}
          {w.achievements.length > 0 && (
            <section className="glass card-shadow p-6 mt-6 animate-rise">
              <div className="flex items-center gap-2 mb-4" style={{ color: '#fbbf24' }}>
                <MedalIcon size={16} />
                <span className="text-sm font-bold uppercase tracking-wider">
                  {w.achievements.length} achievement{w.achievements.length !== 1 ? 's' : ''} unlocked
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {w.achievements.map((a, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-full text-sm font-semibold border"
                    style={{ borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.08)', color: '#fde68a' }}
                  >
                    🎖️ {a}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

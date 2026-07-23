'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Avatar from '@/components/Avatar';
import Sparkline from '@/components/Sparkline';
import TierBadge from '@/components/TierBadge';
import { getCategoryMeta, getStatTier, getNextTier } from '@/lib/categories';
import { STAT_DESCRIPTIONS } from '@/lib/statDescriptions';
import { ChevronLeftIcon, TrendUpIcon, TrendDownIcon, LightbulbIcon } from '@/components/icons';

interface StatDetail {
  player: { id: string; username: string };
  stat: { id: string; code: string; label: string; categoryCode: string; categoryLabel: string };
  value: number;
  series: number[];
  history: {
    oldValue: number;
    newValue: number;
    reason: string | null;
    source: string;
    changedBy: string;
    createdAt: string;
  }[];
  suggestions: {
    id: string;
    delta: number;
    reason: string;
    status: string;
    proposerName: string;
    createdAt: string;
    resolvedAt: string | null;
  }[];
}

const SOURCE_LABELS: Record<string, string> = {
  suggestion: 'Suggestion',
  commitment: 'Commitment',
  admin_edit: 'Admin edit',
  review_cycle: 'Review',
};

export default function StatDetailPage({
  params,
}: {
  params: Promise<{ id: string; statId: string }>;
}) {
  const { id: playerId, statId } = use(params);
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<StatDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      fetch(`/api/players/${playerId}/stats/${statId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => setData(d))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [status, router, playerId, statId]);

  if (status === 'loading' || loading) {
    return (
      <AppShell width="narrow">
        <div className="glass h-64 animate-pulse mb-4" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell width="narrow">
        <div className="glass card-shadow text-center py-16">
          <p style={{ color: 'var(--text-secondary)' }}>Couldn&apos;t load this stat.</p>
        </div>
      </AppShell>
    );
  }

  const meta = getCategoryMeta(data.stat.categoryCode, data.stat.categoryLabel);
  const tier = getStatTier(data.value);
  const next = getNextTier(data.value);
  const netAllTime = data.history.reduce((s, h) => s + (h.newValue - h.oldValue), 0);
  const description = STAT_DESCRIPTIONS[data.stat.code];

  return (
    <AppShell width="narrow">
      <Link
        href={`/players/${data.player.id}`}
        className="inline-flex items-center gap-1 text-sm font-medium mb-5 hover:underline"
        style={{ color: 'var(--accent-cyan)' }}
      >
        <ChevronLeftIcon size={15} />
        {data.player.username}&apos;s profile
      </Link>

      {/* Hero */}
      <section className="glass card-shadow p-6 mb-5 animate-rise" style={{ borderTop: `3px solid ${meta.hex}` }}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: meta.hex }}>
              {data.stat.code.toUpperCase()} · {meta.label}
            </p>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-white">{data.stat.label}</h1>
            <p className="text-xs mt-1 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <Avatar id={data.player.id} name={data.player.username} size={18} />
              {data.player.username}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display text-5xl font-bold leading-none" style={{ color: tier.hex }}>
              {data.value}
              <span className="text-base font-medium opacity-60"> pts</span>
            </p>
            <div className="mt-2 flex justify-end">
              <TierBadge value={data.value} />
            </div>
          </div>
        </div>

        <Sparkline data={data.series} color={meta.hex} width={560} height={90} className="w-full h-auto" />

        <div className="flex items-center gap-4 flex-wrap mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-1">
            {netAllTime >= 0 ? <TrendUpIcon size={13} /> : <TrendDownIcon size={13} />}
            <span style={{ color: netAllTime >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }} className="font-bold">
              {netAllTime >= 0 ? '+' : ''}
              {netAllTime}
            </span>
            all-time
          </span>
          <span>{data.history.length} changes recorded</span>
          {next && (
            <span>
              <span className="font-bold" style={{ color: next.hex }}>
                {next.min - data.value} pts
              </span>{' '}
              to {next.name}
            </span>
          )}
        </div>

        {description && (
          <p className="text-sm mt-4 pt-4 border-t leading-relaxed" style={{ color: 'var(--text-secondary)', borderColor: 'var(--surface-border)' }}>
            {description}
          </p>
        )}
      </section>

      {/* Change log */}
      <section className="glass card-shadow p-5 mb-5 animate-rise animate-rise-1">
        <h2 className="font-display text-lg font-bold text-white mb-4">Change log</h2>
        {data.history.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            No changes yet — still at the starting value.
          </p>
        ) : (
          <div className="space-y-2">
            {data.history.map((h, i) => {
              const up = h.newValue > h.oldValue;
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-xl border"
                  style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.015)' }}
                >
                  <span
                    className="mt-0.5 shrink-0"
                    style={{ color: up ? 'var(--accent-green)' : 'var(--accent-red)' }}
                  >
                    {up ? <TrendUpIcon size={15} /> : <TrendDownIcon size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      <span className="font-bold">
                        {h.oldValue} → {h.newValue}
                      </span>
                      {h.reason && <span className="text-neutral-400"> — “{h.reason}”</span>}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {SOURCE_LABELS[h.source] || h.source} · by {h.changedBy} ·{' '}
                      {new Date(h.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Related suggestions */}
      <section className="glass card-shadow p-5 animate-rise animate-rise-2">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <LightbulbIcon size={17} />
            Suggestions on this stat
          </h2>
          <Link href="/suggestions" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent-purple)' }}>
            All suggestions →
          </Link>
        </div>
        {data.suggestions.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            Never been suggested. See something worth calling? You know what to do.
          </p>
        ) : (
          <div className="space-y-2">
            {data.suggestions.map((sg) => (
              <div
                key={sg.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border flex-wrap"
                style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.015)' }}
              >
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-bold shrink-0"
                  style={{
                    background: sg.delta > 0 ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
                    color: sg.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}
                >
                  {sg.delta > 0 ? '+' : ''}
                  {sg.delta}
                </span>
                <span className="text-sm text-neutral-300 flex-1 min-w-[140px] truncate" title={sg.reason}>
                  “{sg.reason}”
                </span>
                <span className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  {sg.proposerName} · {new Date(sg.createdAt).toLocaleDateString()}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0"
                  style={{
                    background:
                      sg.status === 'approved'
                        ? 'rgba(52,211,153,0.15)'
                        : sg.status === 'rejected'
                        ? 'rgba(239,68,68,0.15)'
                        : 'rgba(168,85,247,0.15)',
                    color:
                      sg.status === 'approved'
                        ? 'var(--accent-green)'
                        : sg.status === 'rejected'
                        ? 'var(--accent-red)'
                        : 'var(--accent-purple)',
                  }}
                >
                  {sg.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

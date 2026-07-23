'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import LockoutBanner, { useMyLockouts } from '@/components/LockoutBanner';
import LockBadge from '@/components/LockBadge';
import { getCategoryMeta, orderCategories, orderStats } from '@/lib/categories';
import { ChevronLeftIcon, CheckIcon, XIcon } from '@/components/icons';

interface MyStat {
  id: string;
  code: string;
  label: string;
  value: number;
  locked: boolean;
  lockSource: 'override' | 'rules' | null;
  lockReasons: any[];
  categoryCode: string;
  categoryLabel: string;
}

const DELTAS = [-2, -1, 1, 2];

/** Quick deadline presets — most commitments are "a week or a month". */
const PRESETS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
];

function isoLocal(date: Date): string {
  // datetime-local wants local time without a timezone suffix
  const off = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - off).toISOString().slice(0, 16);
}

export default function NewCommitmentPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const myLockouts = useMyLockouts(status === 'authenticated');

  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [deadline, setDeadline] = useState(isoLocal(new Date(Date.now() + 7 * 86400000)));
  const [cadence, setCadence] = useState<'none' | 'weekly'>('weekly');
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<MyStat[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const playerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && playerId) {
      fetch(`/api/players/${playerId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          const flat: MyStat[] = [];
          for (const cat of orderCategories<any>(d.categories || [])) {
            for (const s of orderStats<any>(cat.stats || [])) {
              flat.push({ ...s, categoryCode: cat.code, categoryLabel: cat.label });
            }
          }
          setStats(flat);
        })
        .catch(() => {});
    }
  }, [status, router, playerId]);

  const toggleStat = (id: string) => {
    setChanges((prev) => {
      const next = { ...prev };
      if (next[id] !== undefined) delete next[id];
      else next[id] = 1;
      return next;
    });
  };

  const submit = async () => {
    setError('');
    if (!title.trim()) {
      setError('Give it a title — what are you promising?');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/commitments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          detail: detail.trim() || null,
          deadline: new Date(deadline).toISOString(),
          cadence,
          stats: Object.entries(changes).map(([statId, delta]) => ({ statId, delta })),
        }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/commitments/${data.id}`);
      else setError(data.error || 'Failed to create commitment');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const selected = stats.filter((s) => changes[s.id] !== undefined);
  const categoriesInPlay = [...new Set(stats.map((s) => s.categoryCode))];

  if ('commit' in myLockouts) {
    return (
      <AppShell width="narrow">
        <PageHeader title="New Commitment" eyebrow="Promises" eyebrowColor="var(--accent-green)" />
        <LockoutBanner locks={myLockouts} feature="commit" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <Link
        href="/commitments"
        className="inline-flex items-center gap-1 text-sm font-medium mb-5 hover:underline"
        style={{ color: 'var(--accent-cyan)' }}
      >
        <ChevronLeftIcon size={15} />
        All commitments
      </Link>

      <PageHeader
        title="New Commitment"
        subtitle="Say what you'll do and by when. At the deadline the crew votes on whether you delivered."
        eyebrow="Promises"
        eyebrowColor="var(--accent-green)"
      />

      <div className="space-y-5">
        <section className="glass card-shadow p-5 animate-rise">
          <label className="block text-sm font-semibold text-white mb-2">What are you committing to?</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Run 3x a week"
            className="field mb-4"
            maxLength={120}
          />

          <label className="block text-sm font-semibold text-white mb-2">Detail (optional)</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="What exactly counts as done? Be specific — the crew judges this."
            className="field resize-none text-sm"
            rows={3}
          />
        </section>

        <section className="glass card-shadow p-5 animate-rise">
          <label className="block text-sm font-semibold text-white mb-2">Deadline</label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setDeadline(isoLocal(new Date(Date.now() + p.days * 86400000)))}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border text-neutral-300 hover:text-white transition"
                style={{ borderColor: 'var(--surface-border)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="field mb-4"
          />

          <label className="block text-sm font-semibold text-white mb-2">Check-ins</label>
          <div className="flex gap-1 p-1 rounded-xl border w-fit" style={{ borderColor: 'var(--surface-border)' }}>
            {(
              [
                { key: 'weekly', label: 'Weekly nudge' },
                { key: 'none', label: 'No reminders' },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                onClick={() => setCadence(o.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                  cadence === o.key ? 'text-white' : 'text-neutral-400 hover:text-white'
                }`}
                style={cadence === o.key ? { background: 'rgba(52,211,153,0.25)' } : {}}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className="glass card-shadow p-5 animate-rise">
          <label className="block text-sm font-semibold text-white mb-1">Stats you earn if you keep it</label>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Optional, but it's what makes the promise worth something. Nothing is deducted if you miss —
            a miss only affects your completion rate.
          </p>

          {selected.length > 0 && (
            <div className="space-y-2 mb-4">
              {selected.map((s) => {
                const meta = getCategoryMeta(s.categoryCode, s.categoryLabel);
                const d = changes[s.id];
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border p-3"
                    style={{ borderColor: `${meta.hex}44`, background: `${meta.hex}0d` }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold text-white truncate">{s.label}</span>
                      <button
                        onClick={() => toggleStat(s.id)}
                        className="p-1 rounded-lg text-neutral-500 hover:text-red-400 transition shrink-0"
                      >
                        <XIcon size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {DELTAS.map((opt) => {
                        const on = d === opt;
                        const color = opt > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                        return (
                          <button
                            key={opt}
                            onClick={() => setChanges((prev) => ({ ...prev, [s.id]: opt }))}
                            className={`py-1.5 rounded-lg border font-bold text-sm transition ${
                              on ? 'text-white' : 'text-neutral-400 hover:text-white'
                            }`}
                            style={{
                              borderColor: on ? color : 'var(--surface-border)',
                              background: on ? `color-mix(in srgb, ${color} 20%, transparent)` : 'transparent',
                            }}
                          >
                            {opt > 0 ? '+' : ''}
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-4">
            {categoriesInPlay.map((code) => {
              const catStats = stats.filter((s) => s.categoryCode === code);
              const meta = getCategoryMeta(code, catStats[0]?.categoryLabel);
              return (
                <div key={code}>
                  <p
                    className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                    style={{ color: meta.hex }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.hex }} />
                    {catStats[0]?.categoryLabel || code}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {catStats.map((s) => {
                      const on = changes[s.id] !== undefined;
                      return (
                        <button
                          key={s.id}
                          onClick={() => !s.locked && toggleStat(s.id)}
                          disabled={s.locked}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition ${
                            s.locked ? 'opacity-50 cursor-not-allowed' : on ? 'text-white' : 'text-neutral-300 hover:text-white'
                          }`}
                          style={{
                            borderColor: on ? meta.hex : 'var(--surface-border)',
                            background: on ? `${meta.hex}18` : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm truncate">{s.label}</span>
                            <span className="text-[10px] font-bold uppercase" style={{ color: meta.hex }}>
                              now {s.value}
                            </span>
                          </span>
                          {s.locked ? (
                            <LockBadge reasons={s.lockReasons} source={s.lockSource} statLabel={s.label} />
                          ) : on ? (
                            <CheckIcon size={15} />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10">{error}</div>
        )}

        <button onClick={submit} disabled={submitting || !title.trim()} className="btn-gradient w-full py-3">
          {submitting ? 'Committing…' : 'Make it public'}
        </button>
        <p className="text-xs text-center pb-2" style={{ color: 'var(--text-secondary)' }}>
          Everyone gets notified. You can forfeit any time (counts as a miss), or ask the crew to withdraw
          it if something genuinely unavoidable comes up.
        </p>
      </div>
    </AppShell>
  );
}

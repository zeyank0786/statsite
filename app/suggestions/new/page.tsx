'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import LockBadge from '@/components/LockBadge';
import { getUserColorHex } from '@/lib/userColors';
import { getCategoryMeta, orderCategories, orderStats } from '@/lib/categories';
import { ChevronLeftIcon, CheckIcon, ImageIcon, LockIcon } from '@/components/icons';

interface Player {
  id: string;
  username: string;
}

interface EvidencePost {
  id: string;
  playerId: string;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  captionHidden: boolean;
  categories: { categoryId: string; code: string; label: string }[];
  createdAt: string;
}

interface SubjectStat {
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

const DELTAS = [
  { value: -2, label: '-2', note: 'exceptional drop' },
  { value: -1, label: '-1', note: 'step back' },
  { value: 1, label: '+1', note: 'step forward' },
  { value: 2, label: '+2', note: 'exceptional gain' },
];

function NewSuggestionContent() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [players, setPlayers] = useState<Player[]>([]);
  const [evidence, setEvidence] = useState<EvidencePost[]>([]);
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  const [subjectId, setSubjectId] = useState('');
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [selectedStatId, setSelectedStatId] = useState('');
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const currentPlayerId = (session?.user as any)?.playerId;
  const paramSubject = searchParams.get('subject');
  const paramEvidence = searchParams.get('evidenceId');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadBase();
    }
  }, [status, router]);

  const loadBase = async () => {
    try {
      const [playersRes, evidenceRes] = await Promise.all([
        fetch('/api/players'),
        fetch('/api/evidence'),
      ]);
      if (playersRes.ok) setPlayers(await playersRes.json());
      if (evidenceRes.ok) setEvidence(await evidenceRes.json());
    } catch (error) {
      console.error('Failed to load:', error);
    }
  };

  // Apply URL prefill once data is available
  useEffect(() => {
    if (paramSubject && paramSubject !== currentPlayerId && !subjectId) {
      setSubjectId(paramSubject);
    }
  }, [paramSubject, currentPlayerId, subjectId]);

  useEffect(() => {
    if (paramEvidence && evidence.length > 0 && selectedEvidenceIds.length === 0) {
      const post = evidence.find((e) => e.id === paramEvidence);
      if (post && post.playerId !== currentPlayerId) {
        if (!subjectId) setSubjectId(post.playerId);
        setSelectedEvidenceIds([post.id]);
      }
    }
  }, [paramEvidence, evidence, currentPlayerId, subjectId, selectedEvidenceIds.length]);

  // Load the subject's stats (visibility-filtered + lock-annotated by the API)
  useEffect(() => {
    if (!subjectId) {
      setSubjectStats([]);
      return;
    }
    let cancelled = false;
    setLoadingStats(true);
    fetch(`/api/players/${subjectId}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const flat: SubjectStat[] = [];
        for (const cat of orderCategories<any>(data.categories || [])) {
          for (const stat of orderStats<any>(cat.stats || [])) {
            flat.push({ ...stat, categoryCode: cat.code, categoryLabel: cat.label });
          }
        }
        setSubjectStats(flat);
      })
      .catch((e) => console.error('Failed to load subject stats:', e))
      .finally(() => !cancelled && setLoadingStats(false));
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const eligibleSubjects = players.filter((p) => p.id !== currentPlayerId);
  const subjectEvidence = evidence.filter((e) => e.playerId === subjectId);
  const selectedEvidence = subjectEvidence.filter((e) => selectedEvidenceIds.includes(e.id));

  // Stat choice is constrained to categories the selected evidence is tagged with
  const allowedCategoryCodes = new Set(
    selectedEvidence.flatMap((e) => e.categories.map((c) => c.code))
  );
  const availableStats = subjectStats.filter((s) => allowedCategoryCodes.has(s.categoryCode));
  const selectedStat = subjectStats.find((s) => s.id === selectedStatId);

  const changeSubject = (id: string) => {
    setSubjectId(id);
    setSelectedEvidenceIds([]);
    setSelectedStatId('');
    setError('');
  };

  const toggleEvidence = (id: string) => {
    setSelectedEvidenceIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
    setSelectedStatId('');
  };

  const handleSubmit = async () => {
    setError('');
    if (!subjectId || !selectedStatId || selectedEvidenceIds.length === 0 || !reason.trim()) {
      setError('Complete every step: subject, evidence, stat, and a reason.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectPlayerId: subjectId,
          statId: selectedStatId,
          delta,
          reason: reason.trim(),
          evidenceIds: selectedEvidenceIds,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(
          data.resolution?.status === 'approved'
            ? 'Suggestion created — and instantly approved (your yes was already a majority)!'
            : 'Suggestion created! The crew can now vote.'
        );
        setTimeout(() => router.push('/suggestions'), 1600);
      } else {
        setError(data.error || 'Failed to create suggestion');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell width="narrow">
      <Link
        href="/suggestions"
        className="inline-flex items-center gap-1 text-sm font-medium mb-5 hover:underline"
        style={{ color: 'var(--accent-cyan)' }}
      >
        <ChevronLeftIcon size={15} />
        All suggestions
      </Link>

      <PageHeader
        title="New Suggestion"
        subtitle="Grounded in evidence, decided by majority. Your proposal counts as your yes vote."
        eyebrow="Crew Votes"
        eyebrowColor="var(--accent-purple)"
      />

      <div className="space-y-5">
        {/* Step 1: subject */}
        <section className="glass card-shadow p-5 animate-rise">
          <StepLabel n={1} title="Who is this about?" />
          <div className="flex flex-wrap gap-2">
            {eligibleSubjects.map((p) => {
              const hex = getUserColorHex(p.id);
              const active = subjectId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => changeSubject(p.id)}
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
                </button>
              );
            })}
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
            You can't suggest about yourself — post evidence and let the crew call it.
          </p>
        </section>

        {/* Step 2: evidence */}
        {subjectId && (
          <section className="glass card-shadow p-5 animate-rise">
            <StepLabel n={2} title="Attach their evidence" />
            {subjectEvidence.length === 0 ? (
              <p className="text-sm py-4" style={{ color: 'var(--text-secondary)' }}>
                They haven't posted any evidence yet — suggestions must cite evidence, so there's
                nothing to build on. Nudge them on the{' '}
                <Link href="/messages" className="underline" style={{ color: 'var(--accent-cyan)' }}>
                  message board
                </Link>
                .
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {subjectEvidence.map((post) => {
                  const selected = selectedEvidenceIds.includes(post.id);
                  return (
                    <button
                      key={post.id}
                      onClick={() => toggleEvidence(post.id)}
                      className={`relative rounded-xl overflow-hidden border-2 text-left transition ${
                        selected ? '' : 'opacity-75 hover:opacity-100'
                      }`}
                      style={{ borderColor: selected ? 'var(--accent-purple)' : 'var(--surface-border)' }}
                    >
                      {post.mediaUrl ? (
                        post.mediaType === 'video' ? (
                          <video src={post.mediaUrl} className="w-full h-24 object-cover" muted />
                        ) : (
                          <img src={post.mediaUrl} alt="" className="w-full h-24 object-cover" />
                        )
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center bg-white/[0.03] text-neutral-500">
                          <ImageIcon size={22} />
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-[11px] text-neutral-300 line-clamp-2 min-h-[1.5em]">
                          {post.captionHidden ? '' : post.caption || 'No caption'}
                        </p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {post.categories.map((cat) => {
                            const meta = getCategoryMeta(cat.code, cat.label);
                            return (
                              <span
                                key={cat.categoryId}
                                className="text-[9px] font-bold uppercase px-1 py-0.5 rounded"
                                style={{ background: `${meta.hex}1f`, color: meta.hex }}
                              >
                                {meta.short}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      {selected && (
                        <span
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white"
                          style={{ background: 'var(--accent-purple)' }}
                        >
                          <CheckIcon size={12} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Step 3: stat (constrained to evidence categories) */}
        {selectedEvidenceIds.length > 0 && (
          <section className="glass card-shadow p-5 animate-rise">
            <StepLabel n={3} title="Which stat does it prove?" />
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Limited to categories the attached evidence is tagged with.
            </p>
            {loadingStats ? (
              <div className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
            ) : availableStats.length === 0 ? (
              <p className="text-sm py-3" style={{ color: 'var(--text-secondary)' }}>
                No stats available in the evidence's categories.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableStats.map((stat) => {
                  const meta = getCategoryMeta(stat.categoryCode, stat.categoryLabel);
                  const active = selectedStatId === stat.id;
                  return (
                    <button
                      key={stat.id}
                      onClick={() => !stat.locked && setSelectedStatId(stat.id)}
                      disabled={stat.locked}
                      className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left transition ${
                        stat.locked
                          ? 'opacity-50 cursor-not-allowed'
                          : active
                          ? 'text-white'
                          : 'text-neutral-300 hover:text-white'
                      }`}
                      style={{
                        borderColor: active ? meta.hex : 'var(--surface-border)',
                        background: active ? `${meta.hex}18` : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{stat.label}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.hex }}>
                          {stat.code} · now {stat.value}
                        </span>
                      </span>
                      <span className="shrink-0 flex items-center gap-1.5">
                        {stat.locked ? (
                          <LockBadge
                            reasons={stat.lockReasons}
                            source={stat.lockSource}
                            statLabel={stat.label}
                          />
                        ) : active ? (
                          <span style={{ color: meta.hex }}>
                            <CheckIcon size={16} />
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Step 4: delta + reason */}
        {selectedStat && (
          <section className="glass card-shadow p-5 animate-rise">
            <StepLabel n={4} title="The change" />
            <div className="grid grid-cols-4 gap-2 mb-2">
              {DELTAS.map((d) => {
                const active = delta === d.value;
                const positive = d.value > 0;
                const color = positive ? 'var(--accent-green)' : 'var(--accent-red)';
                return (
                  <button
                    key={d.value}
                    onClick={() => setDelta(d.value)}
                    className={`py-3 rounded-xl border font-bold font-display text-lg transition ${
                      active ? 'text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                    style={{
                      borderColor: active ? color : 'var(--surface-border)',
                      background: active ? `color-mix(in srgb, ${color} 20%, transparent)` : 'transparent',
                    }}
                  >
                    {d.label}
                    <span className="block text-[9px] font-sans font-semibold uppercase tracking-wide opacity-70">
                      {d.note}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
              ±1 is the default. Save ±2 for genuinely exceptional cases.{' '}
              <span className="text-white font-medium">
                {selectedStat.label}: {selectedStat.value} → {Math.max(0, selectedStat.value + delta)}
              </span>
            </p>

            <label className="block text-sm font-semibold text-white mb-2">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="field resize-none"
              rows={3}
              placeholder="Why does the evidence justify this change?"
            />

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10 mt-4">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 mt-4 flex items-center gap-2">
                <CheckIcon size={15} /> {successMessage}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || !reason.trim()}
              className="btn-gradient w-full py-3 mt-4"
            >
              {submitting ? 'Submitting...' : 'Submit — this is your yes vote'}
            </button>
          </section>
        )}

        {error && !selectedStat && (
          <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10">
            {error}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ background: 'var(--brand-gradient)' }}
      >
        {n}
      </span>
      <h2 className="font-display text-lg font-bold text-white">{title}</h2>
    </div>
  );
}

export default function NewSuggestionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      }
    >
      <NewSuggestionContent />
    </Suspense>
  );
}

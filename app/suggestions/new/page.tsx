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
import { cldThumb, cldVideoThumb } from '@/lib/cloudinary';
import TierBadge from '@/components/TierBadge';
import LockoutBanner, { useMyLockouts } from '@/components/LockoutBanner';
import { ChevronLeftIcon, CheckIcon, ImageIcon, XIcon } from '@/components/icons';

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

interface Preset {
  id: string;
  name: string;
  reason: string;
  createdByName: string;
  canManage: boolean;
  changes: { statId: string; delta: number; label: string; code: string }[];
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
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetNote, setPresetNote] = useState('');

  const [subjectId, setSubjectId] = useState('');
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [testimony, setTestimony] = useState('');
  // statId → delta for every stat attached to this proposal (default +1)
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const currentPlayerId = (session?.user as any)?.playerId;
  const myLockouts = useMyLockouts(status === 'authenticated');
  const suggestLocked = 'suggest' in myLockouts;
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
      const [playersRes, evidenceRes, presetsRes] = await Promise.all([
        fetch('/api/players'),
        fetch('/api/evidence'),
        fetch('/api/suggestions/presets'),
      ]);
      if (playersRes.ok) setPlayers(await playersRes.json());
      if (evidenceRes.ok) setEvidence(await evidenceRes.json());
      if (presetsRes.ok) setPresets(await presetsRes.json());
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

  const MIN_TESTIMONY = 1;
  const eligibleSubjects = players.filter((p) => p.id !== currentPlayerId);
  const subjectEvidence = evidence.filter((e) => e.playerId === subjectId);
  const testimonyReady = testimony.trim().length >= MIN_TESTIMONY;
  const grounded = selectedEvidenceIds.length > 0 || testimonyReady;

  // Stats are picked manually — evidence tags don't constrain the choice
  // (written testimony has no tags, and the crew's vote vets relevance).
  const changeCount = Object.keys(changes).length;
  const selectedStats = subjectStats.filter((s) => changes[s.id] !== undefined);

  const changeSubject = (id: string) => {
    setSubjectId(id);
    setSelectedEvidenceIds([]);
    setTestimony('');
    setChanges({});
    setError('');
    setPresetNote('');
  };

  const toggleEvidence = (id: string) => {
    setSelectedEvidenceIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const toggleStat = (statId: string) => {
    setChanges((prev) => {
      const next = { ...prev };
      if (next[statId] !== undefined) delete next[statId];
      else next[statId] = 1;
      return next;
    });
  };

  // Prefill from a preset — the preset itself is never mutated by a use;
  // everything stays editable from here (add/remove stats, tweak deltas, etc.)
  const applyPreset = (preset: Preset) => {
    const available = new Set(subjectStats.filter((s) => !s.locked).map((s) => s.id));
    const applied: Record<string, number> = {};
    let skipped = 0;
    for (const change of preset.changes) {
      if (available.has(change.statId)) applied[change.statId] = change.delta;
      else skipped++;
    }
    setChanges(applied);
    setReason(preset.reason);
    setPresetNote(
      skipped > 0
        ? `"${preset.name}" applied — ${skipped} stat${skipped > 1 ? 's' : ''} skipped (hidden, locked or deleted for this player)`
        : `"${preset.name}" applied — tweak anything below before submitting`
    );
  };

  const savePreset = async () => {
    const name = prompt('Name this preset (e.g. "Gym session"):');
    if (!name?.trim()) return;
    try {
      const res = await fetch('/api/suggestions/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          reason: reason.trim(),
          changes: Object.entries(changes).map(([statId, delta]) => ({ statId, delta })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPresetNote(`Preset "${name.trim()}" saved — it'll be one tap next time`);
        const refreshed = await fetch('/api/suggestions/presets');
        if (refreshed.ok) setPresets(await refreshed.json());
      } else {
        setError(data.error || 'Failed to save preset');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save preset');
    }
  };

  const deletePreset = async (preset: Preset) => {
    if (!confirm(`Delete the preset "${preset.name}"? (Past suggestions made from it are unaffected.)`)) return;
    try {
      const res = await fetch('/api/suggestions/presets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId: preset.id }),
      });
      if (res.ok) setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    } catch (err) {
      console.error('Failed to delete preset:', err);
    }
  };

  const setStatDelta = (statId: string, delta: number) => {
    setChanges((prev) => ({ ...prev, [statId]: delta }));
  };

  const handleSubmit = async () => {
    setError('');
    if (!subjectId || changeCount === 0 || !grounded || !reason.trim()) {
      setError('Complete every step: subject, evidence (or witness testimony), stats, and a reason.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectPlayerId: subjectId,
          changes: Object.entries(changes).map(([statId, delta]) => ({ statId, delta })),
          reason: reason.trim(),
          evidenceIds: selectedEvidenceIds,
          testimony: testimony.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const approvedNow = (data.created || []).filter(
          (c: any) => c.resolution?.status === 'approved'
        ).length;
        const n = data.count || 1;
        setSuccessMessage(
          approvedNow === n
            ? `${n} suggestion${n > 1 ? 's' : ''} created — and instantly approved (your yes was already a majority)!`
            : `${n} suggestion${n > 1 ? 's' : ''} created! The crew votes on each separately.`
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

      <LockoutBanner locks={myLockouts} feature="suggest" />

      <div className="space-y-5" style={suggestLocked ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
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

        {/* Quick start: presets (crew-made templates for regular hand-outs) */}
        {subjectId && presets.length > 0 && (
          <section className="glass card-shadow p-5 animate-rise">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-purple)' }}>
              Quick start
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Tap a preset to prefill the stats and reason — everything stays editable, and the
              preset itself never changes.
            </p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <span key={preset.id} className="relative inline-flex">
                  <button
                    onClick={() => applyPreset(preset)}
                    disabled={loadingStats}
                    className="text-left px-3 py-2 rounded-xl border text-sm transition hover:bg-white/[0.04] disabled:opacity-50"
                    style={{ borderColor: 'rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.07)' }}
                    title={`by ${preset.createdByName} — "${preset.reason}"`}
                  >
                    <span className="block font-semibold text-white">{preset.name}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {preset.changes
                        .map((c) => `${c.delta > 0 ? '+' : ''}${c.delta} ${c.label}`)
                        .join(' · ')}
                    </span>
                  </button>
                  {preset.canManage && (
                    <button
                      onClick={() => deletePreset(preset)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 border text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition flex items-center justify-center"
                      style={{ borderColor: 'var(--surface-border-strong)' }}
                      title="Delete preset"
                    >
                      <XIcon size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {presetNote && (
              <p className="text-xs mt-3" style={{ color: 'var(--accent-cyan)' }}>
                {presetNote}
              </p>
            )}
          </section>
        )}

        {/* Step 2: evidence or witness testimony */}
        {subjectId && (
          <section className="glass card-shadow p-5 animate-rise">
            <StepLabel n={2} title="Ground it: their evidence, or what you witnessed" />
            {subjectEvidence.length === 0 ? (
              <p className="text-sm py-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                They haven't posted any evidence yet — but you can still write what you witnessed
                below, or nudge them on the{' '}
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
                          <div className="relative">
                            <img src={cldVideoThumb(post.mediaUrl, 160)} alt="" className="w-full h-24 object-cover" />
                            <span className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/20">
                              ▶
                            </span>
                          </div>
                        ) : (
                          <img src={cldThumb(post.mediaUrl, 160)} alt="" className="w-full h-24 object-cover" />
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

            {/* Witness testimony — substitutes for evidence when it happened IRL with no media */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--surface-border)' }}>
              <p className="text-sm font-semibold text-white mb-1">
                {selectedEvidenceIds.length > 0 ? 'Add witness context (optional)' : 'No media? Write what you witnessed'}
              </p>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Saw it happen in real life with nothing on camera? Describe it first-hand — your
                account substitutes for evidence and the crew's vote decides if it holds up.
              </p>
              <textarea
                value={testimony}
                onChange={(e) => setTestimony(e.target.value)}
                className="field resize-none text-sm"
                rows={3}
                placeholder="What did you see them do, when, and why does it matter?"
              />
              {testimony.trim().length > 0 && !testimonyReady && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--accent-yellow)' }}>
                  {MIN_TESTIMONY - testimony.trim().length} more characters — make it substantive
                </p>
              )}
            </div>
          </section>
        )}

        {/* Step 3: pick the stats (manual — evidence tags don't constrain the choice) */}
        {grounded && (
          <section className="glass card-shadow p-5 animate-rise">
            <StepLabel n={3} title="Which stats does it prove?" />
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Pick as many as the moment genuinely demonstrated — each becomes its own suggestion
              the crew votes on separately.
            </p>
            {loadingStats ? (
              <div className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
            ) : subjectStats.length === 0 ? (
              <p className="text-sm py-3" style={{ color: 'var(--text-secondary)' }}>
                No tracked stats for this player.
              </p>
            ) : (
              <div className="space-y-4">
                {[...new Set(subjectStats.map((s) => s.categoryCode))].map((catCode) => {
                  const catStats = subjectStats.filter((s) => s.categoryCode === catCode);
                  const meta = getCategoryMeta(catCode, catStats[0]?.categoryLabel);
                  return (
                    <div key={catCode}>
                      <p
                        className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                        style={{ color: meta.hex }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.hex }} />
                        {catStats[0]?.categoryLabel || catCode}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {catStats.map((stat) => {
                          const active = changes[stat.id] !== undefined;
                          return (
                            <button
                              key={stat.id}
                              onClick={() => !stat.locked && toggleStat(stat.id)}
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
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Step 4: per-stat deltas + reason */}
        {changeCount > 0 && (
          <section className="glass card-shadow p-5 animate-rise">
            <StepLabel n={4} title={`The change${changeCount > 1 ? 's' : ''}`} />
            <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
              ±1 is the default. <span className="text-white font-medium">Save ±2 for genuinely
              exceptional moments</span> — particularly impressive or particularly bad.
            </p>

            <div className="space-y-3 mb-4">
              {selectedStats.map((stat) => {
                const meta = getCategoryMeta(stat.categoryCode, stat.categoryLabel);
                const d = changes[stat.id] ?? 1;
                const projected = Math.max(0, stat.value + d);
                return (
                  <div
                    key={stat.id}
                    className="rounded-xl border p-3"
                    style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{stat.label}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.hex }}>
                          {stat.code}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold" style={{ color: d > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {stat.value} → {projected}
                        </span>
                        <TierBadge value={projected} />
                        <button
                          onClick={() => toggleStat(stat.id)}
                          className="p-1 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                          title="Remove this stat"
                        >
                          <XIcon size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {DELTAS.map((opt) => {
                        const active = d === opt.value;
                        const color = opt.value > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setStatDelta(stat.id, opt.value)}
                            className={`py-1.5 rounded-lg border font-bold font-display text-sm transition ${
                              active ? 'text-white' : 'text-neutral-400 hover:text-white'
                            }`}
                            style={{
                              borderColor: active ? color : 'var(--surface-border)',
                              background: active ? `color-mix(in srgb, ${color} 20%, transparent)` : 'transparent',
                            }}
                            title={opt.note}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <label className="block text-sm font-semibold text-white mb-2">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="field resize-none"
              rows={3}
              placeholder="Why does the evidence / what you witnessed justify these changes?"
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
              {submitting
                ? 'Submitting...'
                : `Submit ${changeCount > 1 ? `${changeCount} suggestions` : 'suggestion'} — your yes vote on each`}
            </button>
            <button
              onClick={savePreset}
              disabled={submitting || !reason.trim() || changeCount === 0}
              className="btn-ghost w-full py-2.5 mt-2 text-sm"
              title="Save these stats + reason as a reusable preset (subject not included)"
            >
              Save as preset for next time
            </button>
          </section>
        )}

        {error && changeCount === 0 && (
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

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import LockBadge from '@/components/LockBadge';
import StatPicker from '@/components/StatPicker';
import { getUserColorHex } from '@/lib/userColors';
import { getCategoryMeta, orderCategories, orderStats } from '@/lib/categories';
import { cldThumb, cldVideoThumb } from '@/lib/cloudinary';
import TierBadge from '@/components/TierBadge';
import MentionTextarea from '@/components/MentionTextarea';
import LockoutBanner, { useMyLockouts, isLockedOut } from '@/components/LockoutBanner';
import { ChevronLeftIcon, CheckIcon, ImageIcon, XIcon, SparklesIcon } from '@/components/icons';

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

/** One drafted change from /api/evidence/[id]/stat-hints. */
interface StatHint {
  statId: string;
  code: string;
  label: string;
  delta: number;
  why: string;
  value: number;
  categoryCode: string;
  categoryLabel: string;
}

/**
 * Mirrors MIN_CAPTION_LENGTH in lib/statHints. The server refuses anything
 * shorter; checking here too means the button is disabled with a reason
 * instead of failing after a press.
 */
const HINT_MIN_CAPTION = 40;

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
  // statId → delta for every stat attached to this proposal (default +1)
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // AI hints — a drafted starting point read off one evidence post's caption.
  // Everything it returns is editable in steps 3 and 4 like anything else.
  const [hints, setHints] = useState<StatHint[] | null>(null);
  const [hintAccount, setHintAccount] = useState('');
  const [hintPicks, setHintPicks] = useState<Record<string, boolean>>({});
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState('');
  const [hintNote, setHintNote] = useState('');
  // Which post the draft on screen belongs to. Attaching a different one makes
  // it stale by derivation, so nothing has to remember to clear it.
  const [hintsFor, setHintsFor] = useState<string | null>(null);

  const currentPlayerId = (session?.user as any)?.playerId;
  const myLockouts = useMyLockouts(status === 'authenticated');
  const suggestLocked = isLockedOut(myLockouts, 'suggest');
  const paramSubject = searchParams.get('subject');
  const paramEvidence = searchParams.get('evidenceId');
  // Starting text for the account, so deep-links from elsewhere in the app
  // (a training-facility record, say) arrive with the context already written.
  const paramReason = searchParams.get('reason');

  // Edit mode: ?edit=<suggestionId> reopens an existing proposal (whole batch)
  // for the proposer to change — allowed only while no one else has voted yet.
  const editAnchor = searchParams.get('edit');
  const editMode = !!editAnchor;
  const [editLoading, setEditLoading] = useState(editMode);
  const [editBlocked, setEditBlocked] = useState(false);

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

  // Edit mode: pull the existing batch and prefill the form. Gated the same
  // way the server is — you must own every row, nothing may have resolved, and
  // no one else may have voted — so a blocked edit fails loudly up front.
  useEffect(() => {
    if (!editMode || status !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/suggestions');
        if (!res.ok || cancelled) return;
        const body = await res.json();
        const all = (Array.isArray(body) ? body : body.suggestions || []) as any[];
        if (cancelled) return;
        const anchor = all.find((s) => s.id === editAnchor);
        if (!anchor) {
          setError('That suggestion no longer exists.');
          setEditBlocked(true);
          return;
        }
        const batchKey = anchor.batchId || anchor.id;
        const rows = all.filter((s) => (s.batchId || s.id) === batchKey);
        const iOwnAll = rows.every((s) => s.isProposer);
        const allPending = rows.every((s) => s.status === 'pending');
        const noOtherVotes = rows.every((s) =>
          (s.voters || []).every((v: any) => v.playerId === s.proposerId)
        );
        if (!iOwnAll || !allPending || !noOtherVotes) {
          setError(
            !allPending
              ? 'This suggestion has already resolved — it can no longer be edited.'
              : "Voting has started on this suggestion — it can no longer be edited."
          );
          setEditBlocked(true);
          return;
        }
        setSubjectId(String(anchor.subjectId));
        // The API returns one merged account, so a batch written back when
        // there were two boxes prefills as a single editable block.
        setReason(anchor.reason || '');
        const ch: Record<string, number> = {};
        for (const s of rows) ch[String(s.statId)] = Number(s.delta);
        setChanges(ch);
        setSelectedEvidenceIds([
          ...new Set(rows.flatMap((s: any) => (s.evidence || []).map((e: any) => String(e.id)))),
        ] as string[]);
      } catch (e) {
        console.error('Failed to load suggestion for editing:', e);
        setError('Could not load this suggestion.');
        setEditBlocked(true);
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editMode, editAnchor, status]);

  // Apply URL prefill once data is available
  useEffect(() => {
    if (editMode) return;
    if (paramSubject && paramSubject !== currentPlayerId && !subjectId) {
      setSubjectId(paramSubject);
    }
    // Only ever seeds an empty box — never overwrites what someone has typed.
    if (paramReason && !reason) setReason(paramReason);
  }, [paramSubject, paramReason, currentPlayerId, subjectId, reason, editMode]);

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

  // Stats are picked manually — evidence tags don't constrain the choice
  // (a written account has no tags, and the crew's vote vets relevance).
  const changeCount = Object.keys(changes).length;
  const selectedStats = subjectStats.filter((s) => changes[s.id] !== undefined);

  // AI hints read one post, so they're offered only when exactly one is
  // attached — which is also how these get used in practice (a suggestion per
  // receipt). Two selected and the button waits rather than guessing which.
  const soleEvidence =
    selectedEvidenceIds.length === 1
      ? subjectEvidence.find((e) => e.id === selectedEvidenceIds[0]) || null
      : null;
  const soleCaption = (soleEvidence?.caption || '').trim();
  const hintsAvailable = !!soleEvidence && soleCaption.length >= HINT_MIN_CAPTION;

  // A draft belongs to the post it was read from. Attach a different one (or
  // change subject, which clears the attachments) and it stops being shown —
  // derived rather than cleared, so there's no state to keep in sync.
  const hintsStale = hintsFor !== (soleEvidence?.id || null);
  const shownHints = hintsStale ? null : hints;

  const fetchHints = async () => {
    if (!soleEvidence) return;
    setHintsFor(soleEvidence.id);
    setHints(null);
    setHintLoading(true);
    setHintError('');
    setHintNote('');
    try {
      const res = await fetch(`/api/evidence/${soleEvidence.id}/stat-hints`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setHintError(data.error || 'Could not read this evidence');
        return;
      }
      const drafted: StatHint[] = data.suggestions || [];
      setHints(drafted);
      setHintAccount(data.account || '');
      setHintPicks(Object.fromEntries(drafted.map((h) => [h.statId, true])));
      if (drafted.length === 0) {
        setHintNote("Nothing in this post reads as a clear stat change — pick them by hand below.");
      } else if (data.dropped?.length > 0) {
        setHintNote(
          `${data.dropped.length} more ${data.dropped.length === 1 ? 'was' : 'were'} drafted but ${
            data.dropped.length === 1 ? 'is' : 'are'
          } now locked or untracked for this player.`
        );
      }
    } catch (err: any) {
      setHintError(err.message || 'Could not read this evidence');
    } finally {
      setHintLoading(false);
    }
  };

  // Merges rather than replaces — anything already picked by hand survives, and
  // a hint for a stat already picked overwrites only its delta.
  const applyHints = () => {
    if (!shownHints) return;
    const picked = shownHints.filter((h) => hintPicks[h.statId]);
    if (picked.length === 0) return;
    setChanges((prev) => {
      const next = { ...prev };
      for (const hint of picked) next[hint.statId] = hint.delta;
      return next;
    });
    setHintNote(
      `${picked.length} stat${picked.length > 1 ? 's' : ''} added — change the deltas or drop any of them below.`
    );
  };

  const applyHintAccount = () => {
    if (!hintAccount) return;
    if (reason.trim() && !confirm('Replace what you have already written?')) return;
    setReason(hintAccount);
    setHintNote('Write-up applied — edit it freely, it saves to the stat history exactly as submitted.');
  };

  const changeSubject = (id: string) => {
    if (editMode) return; // subject is fixed while editing an existing proposal
    setSubjectId(id);
    setSelectedEvidenceIds([]);
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
    if (!subjectId || changeCount === 0 || !reason.trim()) {
      setError('Complete every step: subject, stats, and what happened.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        changes: Object.entries(changes).map(([statId, delta]) => ({ statId, delta })),
        reason: reason.trim(),
        evidenceIds: selectedEvidenceIds,
      };
      const res = await fetch(
        editMode ? `/api/suggestions/${editAnchor}` : '/api/suggestions',
        {
          method: editMode ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editMode ? payload : { subjectPlayerId: subjectId, ...payload }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        if (editMode) {
          const n = data.count || 1;
          setSuccessMessage(`Suggestion updated — ${n} stat${n > 1 ? 's' : ''} now in play.`);
        } else {
          const approvedNow = (data.created || []).filter(
            (c: any) => c.resolution?.status === 'approved'
          ).length;
          const n = data.count || 1;
          setSuccessMessage(
            approvedNow === n
              ? `${n} suggestion${n > 1 ? 's' : ''} created — and instantly approved (your yes was already a majority)!`
              : `${n} suggestion${n > 1 ? 's' : ''} created! The crew votes on each separately.`
          );
        }
        setTimeout(() => router.push('/suggestions'), 1600);
      } else {
        setError(data.error || (editMode ? 'Failed to update suggestion' : 'Failed to create suggestion'));
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
        title={editMode ? 'Edit Suggestion' : 'New Suggestion'}
        subtitle={
          editMode
            ? 'Change the stats, deltas, evidence or reason — allowed only until someone else votes.'
            : 'Grounded in evidence, decided by majority. Your proposal counts as your yes vote.'
        }
        eyebrow="Crew Votes"
        eyebrowColor="var(--accent-purple)"
      />

      <LockoutBanner locks={myLockouts} feature="suggest" />

      {editBlocked ? (
        <div className="glass card-shadow p-6 text-center animate-rise">
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            {error || 'This suggestion can no longer be edited.'}
          </p>
          <Link href="/suggestions" className="btn-ghost inline-flex">
            Back to suggestions
          </Link>
        </div>
      ) : editMode && editLoading ? (
        <div className="glass h-80 animate-pulse rounded-2xl" />
      ) : (
      <div className="space-y-5" style={suggestLocked ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
        {/* Step 1: subject */}
        <section className="glass card-shadow p-5 animate-rise">
          <StepLabel n={1} title="Who is this about?" />
          {editMode ? (
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const subj = players.find((p) => p.id === subjectId);
                const hex = getUserColorHex(subjectId);
                return (
                  <span
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium text-white"
                    style={{ borderColor: hex, background: `${hex}1f` }}
                  >
                    <Avatar id={subjectId} name={subj?.username || '?'} size={22} profileCard={false} />
                    {subj?.username || 'Subject'}
                  </span>
                );
              })()}
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Locked while editing
              </span>
            </div>
          ) : (
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
                  <Avatar id={p.id} name={p.username} size={22} profileCard={false} />
                  {p.username}
                </button>
              );
            })}
          </div>
          )}
          {!editMode && (
            <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
              You can't suggest about yourself — post evidence and let the crew call it.
            </p>
          )}
        </section>

        {/* Quick start: presets (crew-made templates for regular hand-outs) */}
        {!editMode && subjectId && presets.length > 0 && (
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

        {/* Step 2: attach their evidence (optional — the written account in
            step 4 is what grounds the proposal and what history keeps) */}
        {subjectId && (
          <section className="glass card-shadow p-5 animate-rise">
            <StepLabel n={2} title="Attach their evidence (optional)" />
            {subjectEvidence.length === 0 ? (
              <p className="text-sm py-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                They haven't posted any evidence yet — describe what you saw in step 4 instead, or
                nudge them on the{' '}
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

            {subjectEvidence.length > 0 && (
              <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
                Optional. Nothing on camera is fine — write what you witnessed in step 4 and the
                crew's vote decides if it holds up.
              </p>
            )}
          </section>
        )}

        {/* AI starting point — reads the attached post's caption and drafts the
            stats someone might propose off it. Purely a prefill: every row
            lands in step 3/4 as an ordinary pick and the crew still votes. */}
        {!editMode && subjectId && selectedEvidenceIds.length > 0 && (
          <section className="glass card-shadow p-5 animate-rise">
            <p
              className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"
              style={{ color: 'var(--accent-cyan)' }}
            >
              <SparklesIcon size={13} />
              AI starting point
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Reads what they wrote and drafts the stats it seems to prove. A starting point only —
              add, remove and adjust before you submit.
            </p>

            {!hintsAvailable ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {selectedEvidenceIds.length > 1
                  ? 'Attach a single post to use this — it reads one at a time.'
                  : 'There is not enough written on this post to read. Pick the stats by hand below.'}
              </p>
            ) : (
              <>
                {shownHints === null && (
                  <button
                    onClick={fetchHints}
                    disabled={hintLoading || loadingStats}
                    className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
                    style={{ borderColor: 'rgba(34,211,238,0.4)' }}
                  >
                    <SparklesIcon size={14} />
                    {hintLoading ? 'Reading the post...' : 'Draft stats from this post'}
                  </button>
                )}

                {shownHints !== null && shownHints.length > 0 && (
                  <div className="space-y-2">
                    {shownHints.map((hint) => {
                      const meta = getCategoryMeta(hint.categoryCode, hint.categoryLabel);
                      const picked = !!hintPicks[hint.statId];
                      return (
                        <button
                          key={hint.statId}
                          onClick={() =>
                            setHintPicks((prev) => ({ ...prev, [hint.statId]: !prev[hint.statId] }))
                          }
                          className="w-full flex items-start gap-3 px-3.5 py-2.5 rounded-xl border text-left transition"
                          style={{
                            borderColor: picked ? meta.hex : 'var(--surface-border)',
                            background: picked ? `${meta.hex}14` : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          <span
                            className="mt-0.5 w-4 h-4 rounded shrink-0 border flex items-center justify-center"
                            style={{
                              borderColor: picked ? meta.hex : 'var(--surface-border-strong)',
                              background: picked ? meta.hex : 'transparent',
                            }}
                          >
                            {picked && <CheckIcon size={11} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white">{hint.label}</span>
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider"
                                style={{ color: meta.hex }}
                              >
                                {hint.code}
                              </span>
                              <span
                                className="text-xs font-bold"
                                style={{
                                  color: hint.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                                }}
                              >
                                {hint.delta > 0 ? '+' : ''}
                                {hint.delta}
                              </span>
                            </span>
                            {hint.why && (
                              <span
                                className="block text-[11px] mt-0.5"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {hint.why}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={applyHints}
                        disabled={!shownHints.some((h) => hintPicks[h.statId])}
                        className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-40"
                        style={{ borderColor: 'rgba(34,211,238,0.4)' }}
                      >
                        <CheckIcon size={13} />
                        Add {shownHints.filter((h) => hintPicks[h.statId]).length} to my suggestion
                      </button>
                      {hintAccount && (
                        <button
                          onClick={applyHintAccount}
                          className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-sm"
                        >
                          Use its write-up
                        </button>
                      )}
                    </div>

                    {hintAccount && (
                      <p
                        className="text-xs leading-relaxed rounded-xl border p-3 mt-1"
                        style={{
                          color: 'var(--text-secondary)',
                          borderColor: 'var(--surface-border)',
                          background: 'rgba(255,255,255,0.02)',
                        }}
                      >
                        {hintAccount}
                      </p>
                    )}
                  </div>
                )}

                {!hintsStale && hintNote && (
                  <p className="text-xs mt-3" style={{ color: 'var(--accent-cyan)' }}>
                    {hintNote}
                  </p>
                )}
                {!hintsStale && hintError && (
                  <p className="text-xs mt-3 text-red-400">{hintError}</p>
                )}
              </>
            )}
          </section>
        )}

        {/* Step 3: pick the stats (manual — evidence tags don't constrain the
            choice). Gated on the subject alone now: evidence is optional and
            the written account comes after this, so gating on either would
            leave the form unable to open. */}
        {subjectId && (
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
              <StatPicker
                stats={subjectStats}
                selectedIds={selectedStats.map((s) => s.id)}
                onToggle={toggleStat}
              />
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

            {/* The one and only text box. This is what the crew votes on and
                what gets written into the stat's permanent history. */}
            <label className="block text-sm font-semibold text-white mb-1">
              What happened (required)
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              Everything in one place — what you saw or what the evidence shows, and why it earns
              these changes. This exact text is saved to the stat history forever.
            </p>
            <MentionTextarea
              value={reason}
              onChange={setReason}
              players={players}
              className="field resize-none"
              rows={5}
              placeholder="What did they do, when, and why does it justify these changes? @ to mention"
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
                ? editMode
                  ? 'Saving...'
                  : 'Submitting...'
                : editMode
                ? `Save changes${changeCount > 1 ? ` (${changeCount} stats)` : ''}`
                : `Submit ${changeCount > 1 ? `${changeCount} suggestions` : 'suggestion'} — your yes vote on each`}
            </button>
            {!editMode && (
              <button
                onClick={savePreset}
                disabled={submitting || !reason.trim() || changeCount === 0}
                className="btn-ghost w-full py-2.5 mt-2 text-sm"
                title="Save these stats + reason as a reusable preset (subject not included)"
              >
                Save as preset for next time
              </button>
            )}
          </section>
        )}

        {error && changeCount === 0 && (
          <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10">
            {error}
          </div>
        )}
      </div>
      )}
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

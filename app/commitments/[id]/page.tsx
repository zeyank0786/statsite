'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Avatar from '@/components/Avatar';
import { getCategoryMeta } from '@/lib/categories';
import { cldThumb, cldVideoThumb } from '@/lib/cloudinary';
import { STATUS_META, timeLeft } from '@/components/CommitmentCard';
import { ChevronLeftIcon, CheckIcon, XIcon, ClockIcon, CameraIcon } from '@/components/icons';

interface Detail {
  id: string;
  playerId: string;
  playerName: string;
  title: string;
  detail: string | null;
  cadence: string;
  deadline: string;
  status: string;
  withdrawReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  isSubject: boolean;
  adjustedBy: string | null;
  adjustedAt: string | null;
  adjustReason: string | null;
  originalStats: { statId: string; delta: number; code: string; label: string }[];
  stats: {
    statId: string;
    delta: number;
    code: string;
    label: string;
    categoryCode: string;
    categoryLabel: string;
    currentValue: number;
  }[];
  checkIns: {
    id: string;
    note: string | null;
    createdAt: string;
    evidence: { id: string; mediaUrl: string | null; mediaType: string | null; caption: string | null } | null;
  }[];
  tally: {
    kind: 'verdict' | 'withdrawal';
    eligibleCount: number;
    votesNeeded: number;
    yes: number;
    no: number;
    waitingOn: string[];
    yourVote: string | null;
    canVote: boolean;
  } | null;
}

export default function CommitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [c, setC] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [myEvidence, setMyEvidence] = useState<any[]>([]);
  const [attachId, setAttachId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustDraft, setAdjustDraft] = useState<Record<string, number>>({});
  const [adjustReason, setAdjustReason] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (authStatus === 'authenticated') load();
  }, [authStatus, router, id]);

  const load = async () => {
    try {
      const res = await fetch(`/api/commitments/${id}`);
      if (res.ok) {
        const data = await res.json();
        setC(data);
        if (data.isSubject) {
          const ev = await fetch('/api/evidence');
          if (ev.ok) {
            const all = await ev.json();
            setMyEvidence(all.filter((e: any) => e.isOwn));
          }
        }
      } else {
        router.push('/commitments');
      }
    } catch (e) {
      console.error('Failed to load commitment:', e);
    } finally {
      setLoading(false);
    }
  };

  const act = async (body: any) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/commitments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || 'Failed');
      else {
        setWithdrawing(false);
        setWithdrawReason('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async () => {
    if (!note.trim() && !attachId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/commitments/${id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null, evidenceId: attachId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || 'Failed to check in');
      else {
        setNote('');
        setAttachId(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const submitAdjustment = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/commitments/${id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats: Object.entries(adjustDraft).map(([statId, delta]) => ({ statId, delta })),
          reason: adjustReason.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || 'Failed to adjust');
      else {
        setAdjusting(false);
        setAdjustReason('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const vote = async (choice: string) => {
    setBusy(true);
    try {
      await fetch(`/api/commitments/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (authStatus === 'loading' || loading || !c) {
    return (
      <AppShell width="narrow">
        <div className="glass h-64 animate-pulse mb-4" />
        <div className="glass h-64 animate-pulse" />
      </AppShell>
    );
  }

  const meta = STATUS_META[c.status] || STATUS_META.active;
  const open = ['active', 'awaiting_verdict', 'withdraw_pending'].includes(c.status);

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

      <section className="glass card-shadow p-6 mb-5 animate-rise" style={{ borderTop: `3px solid ${meta.hex}` }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar id={c.playerId} name={c.playerName} size={40} />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-white">{c.title}</h1>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {c.playerName}
                {c.isSubject && ' (you)'} · due {new Date(c.deadline).toLocaleDateString()}
                {c.status === 'active' && ` · ${timeLeft(c.deadline)}`}
              </p>
            </div>
          </div>
          <span
            className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide shrink-0"
            style={{ background: `${meta.hex}22`, color: meta.hex }}
          >
            {meta.label}
          </span>
        </div>

        {c.detail && (
          <p className="text-sm mb-4 whitespace-pre-wrap break-words text-neutral-200">{c.detail}</p>
        )}

        {c.stats.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {c.stats.map((s) => {
              const cm = getCategoryMeta(s.categoryCode, s.categoryLabel);
              const dc = s.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
              return (
                <span
                  key={s.statId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
                  style={{ borderColor: `${cm.hex}44`, background: `${cm.hex}0f`, color: 'white' }}
                >
                  <span style={{ color: dc }}>
                    {s.delta > 0 ? '+' : ''}
                    {s.delta}
                  </span>
                  {s.label}
                  <span className="opacity-60">(now {s.currentValue})</span>
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* Reward was re-priced by the crew */}
      {c.adjustedBy && c.originalStats.length > 0 && (
        <div className="glass p-4 mb-5 text-sm animate-rise" style={{ borderColor: 'rgba(251,191,36,0.4)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--accent-yellow)' }}>
            Reward adjusted by {c.adjustedBy}
          </p>
          <p className="mb-2" style={{ color: 'var(--text-secondary)' }}>
            Originally asked for:{' '}
            <span className="text-neutral-300">
              {c.originalStats.map((o) => `${o.delta > 0 ? '+' : ''}${o.delta} ${o.label}`).join(' · ')}
            </span>
          </p>
          {c.adjustReason && <p className="text-neutral-200 whitespace-pre-wrap break-words">{c.adjustReason}</p>}
        </div>
      )}

      {/* Withdrawal reason */}
      {c.status === 'withdraw_pending' && c.withdrawReason && (
        <div
          className="glass p-4 mb-5 text-sm animate-rise"
          style={{ borderColor: 'rgba(251,191,36,0.4)' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-yellow)' }}>
            Withdrawal requested — every eligible voter must agree
          </p>
          <p className="text-neutral-200 whitespace-pre-wrap break-words">{c.withdrawReason}</p>
        </div>
      )}

      {/* Voting */}
      {c.tally && (
        <section className="glass card-shadow p-5 mb-5 animate-rise">
          <h2 className="font-display text-lg font-bold text-white mb-1">
            {c.tally.kind === 'withdrawal' ? 'Allow the withdrawal?' : 'Did they do it?'}
          </h2>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            {c.tally.kind === 'withdrawal' ? (
              <>
                {c.tally.yes} of {c.tally.eligibleCount} agreed — a withdrawal needs everyone, and a single
                objection sends it back to active.
              </>
            ) : (
              <>
                <span style={{ color: 'var(--accent-green)' }}>{c.tally.yes} kept</span> ·{' '}
                <span style={{ color: 'var(--accent-red)' }}>{c.tally.no} missed</span> — needs {c.tally.votesNeeded} of{' '}
                {c.tally.eligibleCount}
              </>
            )}
          </p>
          {c.tally.waitingOn.length > 0 && (
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-secondary)' }}>
              ⏳ Waiting on: <span className="text-neutral-300 font-medium">{c.tally.waitingOn.join(', ')}</span>
            </p>
          )}
          {c.tally.canVote && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => vote(c.tally!.kind === 'withdrawal' ? 'yes' : 'kept')}
                disabled={busy}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 ${
                  c.tally.yourVote === 'kept' || c.tally.yourVote === 'yes'
                    ? 'text-white border-emerald-400 bg-emerald-500/30'
                    : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'
                }`}
              >
                <CheckIcon size={15} /> {c.tally.kind === 'withdrawal' ? 'Allow it' : 'They did it'}
              </button>
              <button
                onClick={() => vote(c.tally!.kind === 'withdrawal' ? 'no' : 'missed')}
                disabled={busy}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 ${
                  c.tally.yourVote === 'missed' || c.tally.yourVote === 'no'
                    ? 'text-white border-red-400 bg-red-500/30'
                    : 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20'
                }`}
              >
                <XIcon size={15} /> {c.tally.kind === 'withdrawal' ? 'Object' : 'They didn’t'}
              </button>
            </div>
          )}

          {/* Re-price the reward: "you did it, but that's not worth +2" */}
          {c.tally.canVote && c.tally.kind === 'verdict' && (
            <div className="border-t mt-4 pt-4" style={{ borderColor: 'var(--surface-border)' }}>
              {adjusting ? (
                <>
                  <p className="text-sm font-semibold text-white mb-1">Adjust the reward</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Set what you think it&apos;s actually worth. Everyone&apos;s votes reset so the crew
                    judges the new terms — remove every stat if it shouldn&apos;t score at all.
                  </p>
                  <div className="space-y-2 mb-3">
                    {c.stats.map((s) => {
                      const cm = getCategoryMeta(s.categoryCode, s.categoryLabel);
                      const current = adjustDraft[s.statId];
                      const dropped = current === undefined;
                      return (
                        <div
                          key={s.statId}
                          className="rounded-xl border p-3"
                          style={{
                            borderColor: dropped ? 'var(--surface-border)' : `${cm.hex}44`,
                            background: dropped ? 'transparent' : `${cm.hex}0d`,
                            opacity: dropped ? 0.5 : 1,
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-sm font-semibold text-white truncate">{s.label}</span>
                            <button
                              onClick={() =>
                                setAdjustDraft((prev) => {
                                  const next = { ...prev };
                                  if (dropped) next[s.statId] = s.delta;
                                  else delete next[s.statId];
                                  return next;
                                })
                              }
                              className="text-[11px] font-semibold shrink-0 hover:underline"
                              style={{ color: dropped ? 'var(--accent-green)' : 'var(--accent-red)' }}
                            >
                              {dropped ? 'include' : 'drop'}
                            </button>
                          </div>
                          {!dropped && (
                            <div className="grid grid-cols-4 gap-1.5">
                              {[-2, -1, 1, 2].map((opt) => {
                                const on = current === opt;
                                const color = opt > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                                return (
                                  <button
                                    key={opt}
                                    onClick={() => setAdjustDraft((prev) => ({ ...prev, [s.statId]: opt }))}
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <textarea
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="Why? (optional — but it helps to explain)"
                    className="field resize-none text-sm mb-2"
                    rows={2}
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={submitAdjustment} disabled={busy} className="btn-gradient text-sm py-2">
                      Propose this reward
                    </button>
                    <button onClick={() => setAdjusting(false)} className="btn-ghost text-sm py-2">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => {
                    setAdjustDraft(Object.fromEntries(c.stats.map((s) => [s.statId, s.delta])));
                    setAdjusting(true);
                  }}
                  className="btn-ghost text-sm py-2"
                >
                  They did it — but adjust the reward
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Check in */}
      {c.isSubject && (c.status === 'active' || c.status === 'awaiting_verdict') && (
        <section className="glass card-shadow p-5 mb-5 animate-rise">
          <h2 className="font-display text-lg font-bold text-white mb-3">Log progress</h2>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you do?"
            className="field resize-none text-sm mb-3"
            rows={2}
          />
          {myEvidence.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                Attach evidence (optional)
              </p>
              <div className="flex gap-2 flex-wrap mb-3">
                {myEvidence.slice(0, 8).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setAttachId(attachId === e.id ? null : e.id)}
                    className="w-14 h-14 rounded-lg overflow-hidden border-2 transition"
                    style={{ borderColor: attachId === e.id ? 'var(--accent-green)' : 'var(--surface-border)' }}
                    title={e.caption || 'Evidence'}
                  >
                    {e.mediaUrl ? (
                      <img
                        src={e.mediaType === 'video' ? cldVideoThumb(e.mediaUrl, 56) : cldThumb(e.mediaUrl, 56)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-neutral-500">
                        <CameraIcon size={16} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
          <button onClick={checkIn} disabled={busy || (!note.trim() && !attachId)} className="btn-gradient text-sm py-2">
            Check in
          </button>
        </section>
      )}

      {/* Subject controls */}
      {c.isSubject && open && (
        <section className="glass card-shadow p-5 mb-5 animate-rise">
          <h2 className="font-display text-lg font-bold text-white mb-1">Can&apos;t finish it?</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Forfeiting is instant and counts as a miss. A withdrawal doesn&apos;t count against you, but every
            eligible voter has to agree it was genuinely unavoidable.
          </p>
          {withdrawing ? (
            <>
              <textarea
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="What happened? The crew has to agree unanimously."
                className="field resize-none text-sm mb-2"
                rows={3}
              />
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => act({ action: 'requestWithdrawal', reason: withdrawReason })}
                  disabled={busy || withdrawReason.trim().length < 10}
                  className="btn-gradient text-sm py-2 disabled:opacity-50"
                >
                  Request withdrawal
                </button>
                <button onClick={() => setWithdrawing(false)} className="btn-ghost text-sm py-2">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {c.status !== 'withdraw_pending' && (
                <button onClick={() => setWithdrawing(true)} disabled={busy} className="btn-ghost text-sm py-2">
                  Request withdrawal
                </button>
              )}
              {c.status === 'withdraw_pending' && (
                <button onClick={() => act({ action: 'cancelWithdrawal' })} disabled={busy} className="btn-ghost text-sm py-2">
                  Cancel withdrawal request
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm('Forfeit this commitment? It goes on your record as a miss.')) {
                    act({ action: 'forfeit' });
                  }
                }}
                disabled={busy}
                className="px-3.5 py-2 rounded-xl text-sm font-semibold border text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition"
              >
                Forfeit
              </button>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10 mb-5">
          {error}
        </div>
      )}

      {/* Check-in log */}
      <section className="glass card-shadow p-5 animate-rise">
        <h2 className="font-display text-lg font-bold text-white mb-4 flex items-center gap-2">
          <ClockIcon size={17} />
          Progress log ({c.checkIns.length})
        </h2>
        {c.checkIns.length === 0 ? (
          <p className="text-sm py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
            No check-ins yet.
          </p>
        ) : (
          <div className="space-y-2">
            {c.checkIns.map((ci) => (
              <div
                key={ci.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-xl border"
                style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.015)' }}
              >
                {ci.evidence?.mediaUrl && (
                  <img
                    src={
                      ci.evidence.mediaType === 'video'
                        ? cldVideoThumb(ci.evidence.mediaUrl, 48)
                        : cldThumb(ci.evidence.mediaUrl, 48)
                    }
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  {ci.note && <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">{ci.note}</p>}
                  {ci.evidence?.caption && !ci.note && (
                    <p className="text-sm text-neutral-300 italic">{ci.evidence.caption}</p>
                  )}
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(ci.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

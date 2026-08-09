'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import RuleForm, { emptyDraft, toPayload, type Draft, type StatOption } from './RuleForm';
import {
  RefreshIcon,
  PlusIcon,
  PauseIcon,
  PlayIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
  HandIcon,
} from '@/components/icons';

interface AutomationStat {
  statId: string;
  statLabel: string;
  delta: number;
}
interface Qualifier {
  id: string;
  playerId: string;
  username: string;
  status: 'active' | 'removed';
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
}
interface Automation {
  id: string;
  name: string;
  description: string | null;
  cadence: 'daily' | 'weekly' | 'monthly' | 'interval';
  intervalDays: number | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  startImmediately: boolean;
  status: 'active' | 'paused';
  stats: AutomationStat[];
  qualifiers: Qualifier[];
}
interface RequestRow {
  id: string;
  kind: 'join' | 'new';
  automationId: string | null;
  automationName: string | null;
  playerId: string;
  playerName: string;
  requestedById: string;
  requestedByName: string;
  reason: string | null;
  payload: any;
  status: 'pending' | 'approved' | 'rejected';
  decisionNote: string | null;
  createdAt: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Mirrors describeCadence in lib/automations — kept in sync deliberately. */
function describeCadence(r: Automation | Draft): string {
  switch (r.cadence) {
    case 'daily':
      return 'every day';
    case 'weekly':
      return `weekly on ${DAY_NAMES[Number(r.dayOfWeek) || 0]}`;
    case 'monthly': {
      const d = Math.min(28, Math.max(1, Number(r.dayOfMonth) || 1));
      const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
      return `monthly on the ${d}${suffix}`;
    }
    case 'interval': {
      const n = Math.max(1, Number(r.intervalDays) || 1);
      return n === 1 ? 'every day' : `every ${n} days`;
    }
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function DeltaChip({ delta, label }: { delta: number; label: string }) {
  const positive = delta > 0;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
      style={{
        background: positive ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
        color: positive ? 'var(--accent-green)' : 'var(--accent-red)',
      }}
    >
      {positive ? `+${delta}` : delta}
      <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </span>
  );
}

export default function AutomationsPage() {
  const router = useRouter();
  const { status, data: session } = useSession();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [players, setPlayers] = useState<{ id: string; username: string }[]>([]);
  const [statOptions, setStatOptions] = useState<StatOption[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [proposing, setProposing] = useState(false);
  const [proposeReason, setProposeReason] = useState('');
  const [joinReason, setJoinReason] = useState<Record<string, string>>({});
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4500);
  };

  const load = useCallback(async () => {
    try {
      const [mainRes, catalogRes] = await Promise.all([
        fetch('/api/automations'),
        fetch('/api/stats/catalog'),
      ]);
      if (mainRes.ok) {
        const data = await mainRes.json();
        setAutomations(data.automations || []);
        setRequests(data.requests || []);
        setPlayers(data.players || []);
        setIsAdmin(Boolean(data.isAdmin));
        setPlayerId(String(data.playerId || ''));
      }
      if (catalogRes.ok) {
        const stats = await catalogRes.json();
        setStatOptions(
          (stats || []).map((s: any) => ({
            id: String(s.id),
            label: String(s.label),
            categoryLabel: String(s.categoryLabel),
          }))
        );
      }
    } catch {
      flash('err', 'Could not load automations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') void load();
  }, [status, router, load]);

  const call = async (url: string, method: string, body?: any): Promise<any | null> => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash('err', [data.error, data.details].filter(Boolean).join(' — ') || 'That did not work');
        return null;
      }
      await load();
      return data;
    } catch (e: any) {
      flash('err', e?.message || 'That did not work');
      return null;
    } finally {
      setBusy(false);
    }
  };

  /** Rules this player is currently receiving — the "you qualify" view. */
  const mine = useMemo(
    () =>
      automations.filter((a) =>
        a.qualifiers.some((q) => q.playerId === playerId && q.status === 'active')
      ),
    [automations, playerId]
  );

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  const startEdit = (rule: Automation) => {
    setCreating(false);
    setEditingId(rule.id);
    setDraft({
      name: rule.name,
      description: rule.description || '',
      cadence: rule.cadence,
      intervalDays: rule.intervalDays ?? 7,
      dayOfWeek: rule.dayOfWeek ?? 1,
      dayOfMonth: rule.dayOfMonth ?? 1,
      startDate: rule.startDate.slice(0, 10),
      endDate: rule.endDate ? rule.endDate.slice(0, 10) : '',
      startImmediately: rule.startImmediately,
      stats: rule.stats.map((s) => ({ statId: s.statId, delta: s.delta })),
    });
  };

  const submitRule = async () => {
    const payload = toPayload(draft);
    const ok = editingId
      ? await call(`/api/automations/${editingId}`, 'PATCH', payload)
      : await call('/api/automations', 'POST', payload);
    if (ok) {
      flash('ok', editingId ? 'Rule updated.' : 'Rule created.');
      setCreating(false);
      setEditingId(null);
      setDraft(emptyDraft());
    }
  };

  const submitProposal = async () => {
    const ok = await call('/api/automations/requests', 'POST', {
      kind: 'new',
      draft: toPayload(draft),
      reason: proposeReason,
    });
    if (ok) {
      flash('ok', 'Sent to the admin for approval.');
      setProposing(false);
      setProposeReason('');
      setDraft(emptyDraft());
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <PageHeader eyebrow="Automatic" title="Automations" />
        <div className="glass card-shadow p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Automatic"
        eyebrowColor="var(--accent-green)"
        title="Automations"
        subtitle="Standing rules that move stats on a schedule. While you qualify, they apply themselves."
        actions={
          <>
            <button onClick={() => void load()} disabled={busy} className="btn-ghost py-2">
              <RefreshIcon size={15} /> Refresh
            </button>
            {isAdmin ? (
              <button
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft());
                  setCreating((v) => !v);
                }}
                className="btn-gradient py-2"
              >
                <PlusIcon size={15} /> New rule
              </button>
            ) : (
              <button
                onClick={() => {
                  setDraft(emptyDraft());
                  setProposing((v) => !v);
                }}
                className="btn-gradient py-2"
              >
                <PlusIcon size={15} /> Propose a rule
              </button>
            )}
          </>
        }
      />

      {notice && (
        <div
          className="mb-5 px-4 py-3 rounded-xl text-sm font-medium border"
          style={{
            background: notice.kind === 'ok' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
            borderColor: notice.kind === 'ok' ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)',
            color: notice.kind === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)',
          }}
        >
          {notice.text}
        </div>
      )}

      {/* ===== Create / edit / propose form ===== */}
      {(creating || editingId || proposing) && (
        <div className="glass-strong card-shadow p-5 md:p-6 mb-6 animate-rise">
          <h2 className="font-display text-lg font-bold text-white mb-4">
            {editingId ? 'Edit rule' : proposing ? 'Propose a rule' : 'New rule'}
          </h2>

          {proposing && (
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Why you should qualify
              </label>
              <textarea
                value={proposeReason}
                onChange={(e) => setProposeReason(e.target.value.slice(0, 600))}
                placeholder="Make the case — the admin sees this with your proposal."
                rows={3}
                className="field resize-y"
              />
            </div>
          )}

          <RuleForm
            draft={draft}
            setDraft={setDraft}
            statOptions={statOptions}
            busy={busy}
            submitLabel={editingId ? 'Save changes' : proposing ? 'Send for approval' : 'Create rule'}
            onSubmit={proposing ? submitProposal : submitRule}
            onCancel={() => {
              setCreating(false);
              setEditingId(null);
              setProposing(false);
              setDraft(emptyDraft());
            }}
          />
        </div>
      )}

      {/* ===== Requests ===== */}
      {(isAdmin ? requests.length > 0 : requests.length > 0) && (
        <section className="mb-8">
          <h2 className="font-display text-lg font-bold text-white mb-3">
            {isAdmin ? `Requests${pendingRequests.length ? ` (${pendingRequests.length} waiting)` : ''}` : 'Your requests'}
          </h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="glass card-shadow p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <Avatar id={r.playerId} name={r.playerName} size={34} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">
                    <span className="font-semibold">{r.requestedByName}</span>{' '}
                    {r.kind === 'new' ? (
                      <>proposed <span className="font-semibold">{r.payload?.name || 'a new rule'}</span></>
                    ) : (
                      <>
                        asked for{' '}
                        <span className="font-semibold">{r.playerName}</span> to qualify for{' '}
                        <span className="font-semibold">{r.automationName || 'a rule'}</span>
                      </>
                    )}
                  </p>
                  {r.reason && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      “{r.reason}”
                    </p>
                  )}
                  {r.kind === 'new' && r.payload?.stats?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.payload.stats.map((s: any) => (
                        <DeltaChip
                          key={s.statId}
                          delta={s.delta}
                          label={statOptions.find((o) => o.id === s.statId)?.label || 'stat'}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {r.status === 'pending' && isAdmin ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        const ok = await call(`/api/automations/requests/${r.id}`, 'PATCH', { decision: 'approved' });
                        if (ok) flash('ok', 'Approved.');
                      }}
                      disabled={busy}
                      className="btn-primary py-2 px-3"
                    >
                      <CheckIcon size={14} /> Approve
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await call(`/api/automations/requests/${r.id}`, 'PATCH', { decision: 'rejected' });
                        if (ok) flash('ok', 'Rejected.');
                      }}
                      disabled={busy}
                      className="btn-ghost py-2 px-3"
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                ) : (
                  <span
                    className="text-xs font-semibold uppercase tracking-wide shrink-0"
                    style={{
                      color:
                        r.status === 'approved'
                          ? 'var(--accent-green)'
                          : r.status === 'rejected'
                            ? 'var(--accent-red)'
                            : 'var(--text-secondary)',
                    }}
                  >
                    {r.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== What you qualify for ===== */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-bold text-white mb-3">
          {mine.length > 0 ? `You qualify for ${mine.length}` : 'You qualify for nothing yet'}
        </h2>
        {mine.length === 0 ? (
          <div className="glass card-shadow p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No automatic stats are running for you. Ask to qualify for one below
            {isAdmin ? '' : ', or propose a new rule'}.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {mine.map((rule) => {
              const q = rule.qualifiers.find((x) => x.playerId === playerId && x.status === 'active')!;
              return (
                <div key={rule.id} className="glass glass-hover card-shadow p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-display font-bold text-white">{rule.name}</h3>
                    {rule.status === 'paused' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shrink-0"
                        style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--accent-yellow)' }}>
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {rule.stats.map((s) => (
                      <DeltaChip key={s.statId} delta={s.delta} label={s.statLabel} />
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {describeCadence(rule)} · next {rule.status === 'paused' ? 'when resumed' : formatDate(q.nextRunAt)}
                    {q.runCount > 0 && ` · ${q.runCount} applied so far`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== All rules ===== */}
      <section>
        <h2 className="font-display text-lg font-bold text-white mb-3">All rules</h2>
        {automations.length === 0 ? (
          <div className="glass card-shadow p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            No automatic stat rules exist yet.
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((rule) => {
              const active = rule.qualifiers.filter((q) => q.status === 'active');
              const iQualify = active.some((q) => q.playerId === playerId);
              return (
                <div key={rule.id} className="glass card-shadow p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-white">{rule.name}</h3>
                        {rule.status === 'paused' && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                            style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--accent-yellow)' }}>
                            Paused
                          </span>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {rule.description}
                        </p>
                      )}
                      <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                        {describeCadence(rule)} · from {formatDate(rule.startDate)}
                        {rule.endDate ? ` until ${formatDate(rule.endDate)}` : ''}
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={async () => {
                            const ok = await call(`/api/automations/${rule.id}`, 'PATCH', {
                              action: rule.status === 'active' ? 'pause' : 'resume',
                            });
                            if (ok) flash('ok', rule.status === 'active' ? 'Paused.' : 'Resumed — missed cycles skipped.');
                          }}
                          disabled={busy}
                          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
                          title={rule.status === 'active' ? 'Pause' : 'Resume'}
                        >
                          {rule.status === 'active' ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
                        </button>
                        <button
                          onClick={() => startEdit(rule)}
                          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
                          title="Edit"
                        >
                          <PencilIcon size={15} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete "${rule.name}"?\n\nIt stops for everyone. Stats it already applied are kept.`)) return;
                            const ok = await call(`/api/automations/${rule.id}`, 'DELETE');
                            if (ok) flash('ok', 'Rule deleted.');
                          }}
                          disabled={busy}
                          className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
                          title="Delete"
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {rule.stats.length === 0 ? (
                      <span className="text-xs" style={{ color: 'var(--accent-yellow)' }}>
                        No stats attached — this rule can't apply anything.
                      </span>
                    ) : (
                      rule.stats.map((s) => <DeltaChip key={s.statId} delta={s.delta} label={s.statLabel} />)
                    )}
                  </div>

                  {/* Qualifiers */}
                  <div className="border-t pt-3" style={{ borderColor: 'var(--surface-border)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Qualifying ({active.length})
                    </p>
                    {active.length === 0 ? (
                      <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Nobody yet.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {active.map((q) => (
                          <span
                            key={q.id}
                            className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border"
                            style={{ borderColor: 'var(--surface-border)' }}
                          >
                            <Avatar id={q.playerId} name={q.username} size={22} />
                            <span className="text-xs text-white">{q.username}</span>
                            {isAdmin && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Disqualify ${q.username} from "${rule.name}"?\n\nThey keep everything it already gave them.`)) return;
                                  const ok = await call(`/api/automations/${rule.id}/qualifiers`, 'DELETE', { playerId: q.playerId });
                                  if (ok) flash('ok', `${q.username} disqualified.`);
                                }}
                                disabled={busy}
                                className="text-neutral-500 hover:text-red-400 transition"
                                aria-label={`Disqualify ${q.username}`}
                              >
                                <XIcon size={12} />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {isAdmin ? (
                      <select
                        value=""
                        onChange={async (e) => {
                          const pid = e.target.value;
                          if (!pid) return;
                          const who = players.find((p) => p.id === pid)?.username || 'They';
                          const ok = await call(`/api/automations/${rule.id}/qualifiers`, 'POST', { playerId: pid });
                          if (ok) flash('ok', `${who} now qualifies.`);
                        }}
                        disabled={busy || rule.stats.length === 0}
                        className="field py-2 max-w-xs"
                      >
                        <option value="">Add someone…</option>
                        {players
                          .filter((p) => !active.some((q) => q.playerId === p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.username}
                            </option>
                          ))}
                      </select>
                    ) : iQualify ? (
                      <p className="text-xs" style={{ color: 'var(--accent-green)' }}>
                        You qualify for this.
                      </p>
                    ) : joiningId === rule.id ? (
                      <div className="space-y-2 max-w-lg">
                        <textarea
                          value={joinReason[rule.id] || ''}
                          onChange={(e) => setJoinReason({ ...joinReason, [rule.id]: e.target.value.slice(0, 600) })}
                          placeholder="Why do you qualify?"
                          rows={2}
                          className="field resize-y"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              const ok = await call('/api/automations/requests', 'POST', {
                                kind: 'join',
                                automationId: rule.id,
                                reason: joinReason[rule.id] || '',
                              });
                              if (ok) {
                                flash('ok', 'Request sent to the admin.');
                                setJoiningId(null);
                              }
                            }}
                            disabled={busy}
                            className="btn-primary py-2"
                          >
                            Send request
                          </button>
                          <button onClick={() => setJoiningId(null)} className="btn-ghost py-2">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setJoiningId(rule.id)} className="btn-ghost py-2">
                        <HandIcon size={14} /> Request to qualify
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

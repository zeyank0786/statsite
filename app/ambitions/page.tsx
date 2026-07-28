'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { orderCategories, orderStats } from '@/lib/categories';
import { getUserColorHex } from '@/lib/userColors';
import { StarIcon, PlusIcon, CheckIcon, TrashIcon, PencilIcon, XIcon, TrophyIcon } from '@/components/icons';

interface Ambition {
  id: string;
  playerId: string;
  ownerName: string;
  ownerActive: boolean;
  title: string;
  detail: string | null;
  statId: string | null;
  statLabel: string | null;
  status: 'active' | 'completed' | 'archived';
  completedAt: string | null;
  createdAt: string;
  rewardStatus: 'pending' | 'approved' | 'rejected' | null;
  rewardDelta: number | null;
}

interface StatOpt {
  id: string;
  code: string;
  label: string;
  categoryLabel: string;
}

async function loadStatOptions(playerId: string): Promise<StatOpt[]> {
  const res = await fetch(`/api/players/${playerId}`);
  if (!res.ok) return [];
  const data = await res.json();
  const opts: StatOpt[] = [];
  for (const cat of orderCategories<any>(data.categories || [])) {
    for (const s of orderStats<any>(cat.stats || [])) {
      if (s.locked) continue;
      opts.push({ id: String(s.id), code: String(s.code), label: String(s.label), categoryLabel: String(cat.label) });
    }
  }
  return opts;
}

function StatSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: StatOpt[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const groups = Array.from(new Set(options.map((o) => o.categoryLabel)));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {options
            .filter((o) => o.categoryLabel === g)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function AmbitionsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [ambitions, setAmbitions] = useState<Ambition[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myStats, setMyStats] = useState<StatOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Create form
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [statId, setStatId] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit + reward form state (keyed by ambition id)
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; detail: string; statId: string }>({ title: '', detail: '', statId: '' });
  const [rewardFor, setRewardFor] = useState<string | null>(null);
  const [rewardStats, setRewardStats] = useState<StatOpt[]>([]);
  const [rewardStatId, setRewardStatId] = useState('');
  const [rewardDelta, setRewardDelta] = useState('10');
  const [rewardReason, setRewardReason] = useState('');
  const [rewardBusy, setRewardBusy] = useState(false);

  const currentPlayerId = (session?.user as any)?.playerId;

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4500);
  };

  const load = async () => {
    try {
      const res = await fetch('/api/ambitions');
      if (res.ok) {
        const data = await res.json();
        setAmbitions(data.ambitions || []);
        setIsAdmin(Boolean(data.isAdmin));
      }
    } catch (e) {
      console.error('Failed to load ambitions:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && currentPlayerId) {
      load();
      loadStatOptions(currentPlayerId).then(setMyStats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentPlayerId]);

  const createAmbition = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/ambitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), detail: detail.trim() || undefined, statId: statId || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setTitle('');
        setDetail('');
        setStatId('');
        await load();
      } else {
        flash('err', data.error || 'Failed to add');
      }
    } catch (e: any) {
      flash('err', e.message || 'Failed to add');
    } finally {
      setCreating(false);
    }
  };

  const patch = async (body: any): Promise<boolean> => {
    try {
      const res = await fetch('/api/ambitions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('err', data.error || 'Failed');
        return false;
      }
      await load();
      return true;
    } catch (e: any) {
      flash('err', e.message || 'Failed');
      return false;
    }
  };

  const complete = async (a: Ambition) => {
    if (!confirm(`Mark "${a.title}" as complete?\n\nThis takes over the whole crew's dashboard with a celebration for a day. Only do it when it's truly done.`)) return;
    if (await patch({ id: a.id, action: 'complete' })) flash('ok', 'Completed! The crew is celebrating 🎉');
  };

  const remove = async (a: Ambition) => {
    if (!confirm(`Delete "${a.title}"? This can't be undone.`)) return;
    try {
      const res = await fetch('/api/ambitions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id }),
      });
      const data = await res.json();
      if (res.ok) await load();
      else flash('err', data.error || 'Failed to delete');
    } catch (e: any) {
      flash('err', e.message || 'Failed to delete');
    }
  };

  const startEdit = (a: Ambition) => {
    setEditing(a.id);
    setEditDraft({ title: a.title, detail: a.detail || '', statId: a.statId || '' });
  };

  const saveEdit = async (a: Ambition) => {
    const ok = await patch({
      id: a.id,
      title: editDraft.title.trim(),
      detail: editDraft.detail.trim(),
      statId: editDraft.statId,
    });
    if (ok) setEditing(null);
  };

  const openReward = async (a: Ambition) => {
    setRewardFor(a.id);
    setRewardStatId(a.statId || '');
    setRewardDelta('10');
    setRewardReason('');
    setRewardStats([]);
    const opts = await loadStatOptions(a.playerId);
    setRewardStats(opts);
  };

  const submitReward = async (a: Ambition) => {
    const delta = Math.floor(Number(rewardDelta));
    if (!Number.isInteger(delta) || delta < 1) {
      flash('err', 'Reward must be a positive whole number');
      return;
    }
    if (!rewardStatId) {
      flash('err', 'Pick which stat the reward lands on');
      return;
    }
    if (!rewardReason.trim()) {
      flash('err', 'Add a reason for the crew');
      return;
    }
    setRewardBusy(true);
    try {
      const res = await fetch(`/api/ambitions/${a.id}/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta, statId: rewardStatId, reason: rewardReason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setRewardFor(null);
        flash('ok', 'Reward proposed — the crew votes on it now.');
        await load();
      } else {
        flash('err', data.error || 'Failed to propose reward');
      }
    } catch (e: any) {
      flash('err', e.message || 'Failed to propose reward');
    } finally {
      setRewardBusy(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell>
        <PageHeader title="Ambitions" eyebrow="The long game" eyebrowColor="#f5c451" />
        <div className="glass h-48 animate-pulse mb-6" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  const activeCount = ambitions.filter((a) => a.status === 'active').length;
  const doneCount = ambitions.filter((a) => a.status === 'completed').length;

  return (
    <AppShell>
      <PageHeader
        title="Ambitions"
        subtitle="The big, long-term goals. Declare them, chase them — and when one lands, the whole crew celebrates and you earn a reward far past the usual."
        eyebrow="The long game"
        eyebrowColor="#f5c451"
      />

      {notice && (
        <div
          className="glass p-3.5 mb-5 text-sm font-medium animate-rise"
          style={{
            borderColor: notice.kind === 'ok' ? 'rgba(52,211,153,0.4)' : 'rgba(239,68,68,0.4)',
            color: notice.kind === 'ok' ? 'var(--accent-green)' : '#f87171',
          }}
        >
          {notice.text}
        </div>
      )}

      {/* Declare a new ambition */}
      <section className="glass card-shadow p-5 mb-8 animate-rise">
        <h2 className="font-display text-lg font-bold text-white mb-3 flex items-center gap-2">
          <StarIcon size={17} /> Declare an ambition
        </h2>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            placeholder="e.g. Run a sub-4-hour marathon"
            className="field"
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && createAmbition()}
          />
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, 600))}
            placeholder="Optional — what does 'done' actually look like?"
            rows={2}
            className="field resize-none"
          />
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex-1">
              <StatSelect options={myStats} value={statId} onChange={setStatId} placeholder="Relevant stat (optional) — points the reward" />
            </div>
            <button onClick={createAmbition} disabled={creating || !title.trim()} className="btn-gradient shrink-0 py-2.5">
              <PlusIcon size={16} /> {creating ? 'Adding…' : 'Add ambition'}
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4 mb-4">
        <h2 className="font-display text-xl font-bold text-white">The board</h2>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {activeCount} active · {doneCount} completed
        </span>
      </div>

      {ambitions.length === 0 ? (
        <div className="glass text-center py-14">
          <StarIcon size={30} className="opacity-30 mx-auto mb-3" />
          <p style={{ color: 'var(--text-secondary)' }}>No ambitions yet. Be the first to put a big one on the board.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ambitions.map((a) => {
            const mine = a.playerId === currentPlayerId;
            const canManage = mine || isAdmin;
            const hex = getUserColorHex(a.playerId);
            const done = a.status === 'completed';
            const liveReward = a.rewardStatus === 'pending' || a.rewardStatus === 'approved';

            return (
              <div
                key={a.id}
                className="glass card-shadow p-5 flex flex-col"
                style={{ borderTop: `3px solid ${done ? '#f5c451' : hex}` }}
              >
                {/* Header */}
                <div className="flex items-center gap-2.5 mb-3">
                  <Avatar id={a.playerId} name={a.ownerName} size={30} />
                  <span className="font-display font-bold text-white truncate">{a.ownerName}</span>
                  {mine && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${hex}22`, color: hex }}>
                      you
                    </span>
                  )}
                  <span className="ml-auto">
                    {done ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,196,81,0.15)', color: '#f5c451' }}>
                        ✓ Completed
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                        Active
                      </span>
                    )}
                  </span>
                </div>

                {editing === a.id ? (
                  <div className="space-y-2 mb-2">
                    <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value.slice(0, 120) })} className="field py-2" />
                    <textarea value={editDraft.detail} onChange={(e) => setEditDraft({ ...editDraft, detail: e.target.value.slice(0, 600) })} rows={2} className="field py-2 resize-none" />
                    <StatSelect options={mine ? myStats : rewardStats} value={editDraft.statId} onChange={(v) => setEditDraft({ ...editDraft, statId: v })} placeholder="Relevant stat (optional)" />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(a)} className="btn-primary py-1.5 px-3 text-xs">
                        <CheckIcon size={13} /> Save
                      </button>
                      <button onClick={() => setEditing(null)} className="btn-ghost py-1.5 px-3 text-xs">
                        <XIcon size={13} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-base font-semibold text-white leading-snug">{a.title}</p>
                    {a.detail && (
                      <p className="text-sm mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                        {a.detail}
                      </p>
                    )}
                    {a.statLabel && (
                      <p className="text-[11px] font-bold uppercase tracking-wider mt-2" style={{ color: 'var(--accent-cyan)' }}>
                        🎯 {a.statLabel}
                      </p>
                    )}
                  </>
                )}

                {/* Reward status line */}
                {done && (
                  <div className="mt-3 text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <TrophyIcon size={13} />
                    {a.rewardStatus === 'approved' && <span className="text-emerald-400 font-semibold">Reward granted{a.rewardDelta ? `: +${a.rewardDelta}` : ''}</span>}
                    {a.rewardStatus === 'pending' && <span className="text-purple-300 font-semibold">Reward +{a.rewardDelta} awaiting the crew&apos;s vote</span>}
                    {(!a.rewardStatus || a.rewardStatus === 'rejected') && (
                      <span>{mine ? 'Awaiting a crewmate to propose your reward' : 'No reward proposed yet'}</span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto pt-4 flex flex-wrap gap-2">
                  {!done && canManage && editing !== a.id && (
                    <button onClick={() => complete(a)} className="btn-gradient py-1.5 px-3 text-xs">
                      <CheckIcon size={13} /> Mark complete
                    </button>
                  )}
                  {done && canManage && (
                    <button onClick={() => patch({ id: a.id, action: 'reopen' })} className="btn-ghost py-1.5 px-3 text-xs">
                      Reopen
                    </button>
                  )}
                  {canManage && editing !== a.id && (
                    <>
                      <button onClick={() => startEdit(a)} className="btn-ghost py-1.5 px-3 text-xs">
                        <PencilIcon size={13} /> Edit
                      </button>
                      <button onClick={() => remove(a)} className="py-1.5 px-3 text-xs rounded-lg text-red-400 border border-red-500/30 hover:bg-red-500/10 transition font-semibold">
                        <TrashIcon size={13} />
                      </button>
                    </>
                  )}
                  {/* Non-owner can propose the reward on a completed ambition with no live reward */}
                  {done && !mine && !liveReward && rewardFor !== a.id && (
                    <button onClick={() => openReward(a)} className="btn-gradient py-1.5 px-3 text-xs">
                      <TrophyIcon size={13} /> Propose reward
                    </button>
                  )}
                </div>

                {/* Reward form */}
                {rewardFor === a.id && (
                  <div className="mt-4 pt-4 border-t space-y-2.5" style={{ borderColor: 'var(--surface-border)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#f5c451' }}>
                      Reward for completing this
                    </p>
                    <StatSelect options={rewardStats} value={rewardStatId} onChange={setRewardStatId} placeholder="Which stat gets the boost" />
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                        +
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={rewardDelta}
                        onChange={(e) => setRewardDelta(e.target.value)}
                        className="field w-24 py-2 text-center"
                      />
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        no ±2 cap here — the crew&apos;s vote is the only limit
                      </span>
                    </div>
                    <textarea
                      value={rewardReason}
                      onChange={(e) => setRewardReason(e.target.value)}
                      placeholder="Why this reward? (the crew sees this when voting)"
                      rows={2}
                      className="field py-2 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => submitReward(a)} disabled={rewardBusy} className="btn-gradient py-1.5 px-3 text-xs">
                        {rewardBusy ? 'Proposing…' : 'Propose to crew'}
                      </button>
                      <button onClick={() => setRewardFor(null)} className="btn-ghost py-1.5 px-3 text-xs">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

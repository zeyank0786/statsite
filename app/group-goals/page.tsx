'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import CountUp from '@/components/CountUp';
import { getUserColorHex } from '@/lib/userColors';
import { getCategoryMeta, orderCategories, orderStats } from '@/lib/categories';
import { cldThumb } from '@/lib/cloudinary';
import { CheckIcon, PlusIcon, TrophyIcon, WarningIcon, XIcon } from '@/components/icons';

/**
 * Crew group goals — one shared target everyone chips away at.
 *
 * Every contribution carries an evidence post, so the running total is always
 * something the crew can check. The payout still goes through the normal vote.
 */

interface Standing {
  playerId: string;
  playerName: string;
  amount: number;
  share: number;
  rank: number;
  contributions: number;
}

interface Goal {
  id: string;
  title: string;
  detail: string | null;
  unit: string;
  target: number;
  statId: string | null;
  statLabel: string | null;
  rewardMode: 'proportional' | 'podium';
  rewardPool: number;
  rewardFirst: number;
  rewardSecond: number;
  rewardThird: number;
  deadline: string | null;
  status: 'active' | 'completed' | 'archived';
  completedAt: string | null;
  createdById: string;
  createdByName: string;
  progress: number;
  standings: Standing[];
  paidOutPlayerIds: string[];
}

interface Contribution {
  id: string;
  goalId: string;
  playerId: string;
  playerName: string;
  amount: number;
  evidenceId: string;
  evidenceUrl: string | null;
  evidenceType: string | null;
  note: string | null;
  status: 'counted' | 'struck';
  struckByName: string | null;
  struckReason: string | null;
  createdAt: string;
}

interface EvidencePost {
  id: string;
  playerId: string;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  captionHidden?: boolean;
  createdAt: string;
}

interface StatOption {
  id: string;
  label: string;
  categoryCode: string;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function GroupGoalsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const currentPlayerId = String((session?.user as { playerId?: string } | undefined)?.playerId || '');

  const [goals, setGoals] = useState<Goal[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [evidence, setEvidence] = useState<EvidencePost[]>([]);
  const [stats, setStats] = useState<StatOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  const load = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const [goalsRes, contribRes, evidenceRes] = await Promise.all([
        fetch('/api/group-goals'),
        fetch('/api/group-goals/contributions'),
        fetch('/api/evidence'),
      ]);
      if (goalsRes.ok) setGoals(await goalsRes.json());
      if (contribRes.ok) setContributions(await contribRes.json());
      if (evidenceRes.ok) {
        const posts = await evidenceRes.json();
        setEvidence(Array.isArray(posts) ? posts : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stat list for the create form — any player's sheet has the same stats.
  useEffect(() => {
    if (status !== 'authenticated' || !currentPlayerId) return;
    fetch(`/api/players/${currentPlayerId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.categories) return;
        const flat: StatOption[] = [];
        for (const cat of orderCategories<{ code: string; stats: { id: string; code: string; label: string }[] }>(data.categories)) {
          for (const stat of orderStats(cat.stats)) {
            flat.push({ id: stat.id, label: stat.label, categoryCode: cat.code });
          }
        }
        setStats(flat);
      })
      .catch(() => {});
  }, [status, currentPlayerId]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const myEvidence = evidence.filter((e) => e.playerId === currentPlayerId);

  return (
    <AppShell>
      <PageHeader
        title="Crew Goals"
        subtitle="One target, everyone chipping in. Every rep evidenced, every award voted."
        eyebrow="Together"
        eyebrowColor="var(--accent-green)"
      />

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10 mb-5">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 mb-5 flex items-center gap-2">
          <CheckIcon size={15} /> {notice}
        </div>
      )}

      <button onClick={() => setCreating(!creating)} className="btn-gradient mb-6">
        {creating ? <XIcon size={15} /> : <PlusIcon size={15} />}
        {creating ? 'Cancel' : 'Set a crew goal'}
      </button>

      {creating && (
        <CreateGoalForm
          stats={stats}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            flash('Goal set — the crew has been told.');
            void load();
          }}
          onError={setError}
        />
      )}

      {loading ? (
        <div className="glass h-64 animate-pulse" />
      ) : goals.length === 0 ? (
        <div className="glass card-shadow p-10 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="font-display font-bold text-white mb-1">No crew goals yet</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Set one and everyone can start logging toward it.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              contributions={contributions.filter((c) => c.goalId === goal.id)}
              myEvidence={myEvidence}
              currentPlayerId={currentPlayerId}
              expanded={expanded === goal.id}
              onToggle={() => setExpanded(expanded === goal.id ? null : goal.id)}
              onChanged={load}
              onFlash={flash}
              onError={setError}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function CreateGoalForm({
  stats,
  onCancel,
  onCreated,
  onError,
}: {
  stats: StatOption[];
  onCancel: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [statId, setStatId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [rewardMode, setRewardMode] = useState<'proportional' | 'podium'>('proportional');
  const [rewardPool, setRewardPool] = useState('10');
  const [rewardFirst, setRewardFirst] = useState('6');
  const [rewardSecond, setRewardSecond] = useState('3');
  const [rewardThird, setRewardThird] = useState('1');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/group-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          detail,
          unit,
          target: Number(target),
          statId,
          deadline: deadline || null,
          rewardMode,
          rewardPool: Number(rewardPool),
          rewardFirst: Number(rewardFirst),
          rewardSecond: Number(rewardSecond),
          rewardThird: Number(rewardThird),
        }),
      });
      const data = await res.json();
      if (res.ok) onCreated();
      else onError(data.error || 'Failed to create goal');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to create goal');
    } finally {
      setSaving(false);
    }
  };

  const ready = title.trim() && unit.trim() && Number(target) > 0 && statId;

  return (
    <section className="glass card-shadow p-5 mb-6 animate-rise">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-white mb-1.5">The goal</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field"
            placeholder="10,000 push-ups in a month"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">Target</label>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="field"
            placeholder="10000"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">Counting what?</label>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="field"
            placeholder="push-ups"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">Reward lands on</label>
          <select value={statId} onChange={(e) => setStatId(e.target.value)} className="field">
            <option value="">Pick a stat…</option>
            {stats.map((s) => (
              <option key={s.id} value={s.id}>
                {getCategoryMeta(s.categoryCode).short} · {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">Deadline (optional)</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="field"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-white mb-1.5">Detail (optional)</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
            className="field resize-none"
            placeholder="Rules, what counts, anything the crew should know."
          />
        </div>
      </div>

      {/* How the points get split when it's done */}
      <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--surface-border)' }}>
        <p className="text-sm font-semibold text-white mb-2">How it pays out</p>
        <div className="flex gap-2 mb-3 flex-wrap">
          {(
            [
              ['proportional', 'Split by contribution', 'Everyone who chipped in gets a slice of the pool, sized by how much they did.'],
              ['podium', 'Podium', 'Top three take fixed awards. Ties break in favour of whoever got there first.'],
            ] as const
          ).map(([mode, label, hint]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRewardMode(mode)}
              title={hint}
              className="px-3 py-2 rounded-xl border text-sm font-medium transition"
              style={{
                borderColor: rewardMode === mode ? 'var(--accent-green)' : 'var(--surface-border)',
                background: rewardMode === mode ? 'rgba(52,211,153,0.1)' : 'transparent',
                color: rewardMode === mode ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {rewardMode === 'proportional' ? (
          <div className="max-w-[220px]">
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Total points to share out
            </label>
            <input
              type="number"
              min={1}
              value={rewardPool}
              onChange={(e) => setRewardPool(e.target.value)}
              className="field"
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {(
              [
                ['🥇 1st', rewardFirst, setRewardFirst] as const,
                ['🥈 2nd', rewardSecond, setRewardSecond] as const,
                ['🥉 3rd', rewardThird, setRewardThird] as const,
              ]
            ).map(([label, value, set]) => (
              <div key={label}>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {label}
                </label>
                <input
                  type="number"
                  min={0}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="field"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-5">
        <button onClick={submit} disabled={!ready || saving} className="btn-gradient flex-1 py-2.5 disabled:opacity-50">
          {saving ? 'Setting…' : 'Set the goal'}
        </button>
        <button onClick={onCancel} className="btn-ghost px-4">
          Cancel
        </button>
      </div>
    </section>
  );
}

function GoalCard({
  goal,
  contributions,
  myEvidence,
  currentPlayerId,
  expanded,
  onToggle,
  onChanged,
  onFlash,
  onError,
}: {
  goal: Goal;
  contributions: Contribution[];
  myEvidence: EvidencePost[];
  currentPlayerId: string;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
  onFlash: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pct = goal.target > 0 ? Math.min(100, (goal.progress / goal.target) * 100) : 0;
  const complete = goal.status === 'completed';
  const overdue = Boolean(goal.deadline && Date.parse(goal.deadline) < Date.now() && !complete);
  const paidOut = goal.paidOutPlayerIds.length > 0;

  // Evidence already spent on this goal can't be logged twice.
  const usedEvidence = new Set(contributions.map((c) => c.evidenceId));
  const availableEvidence = myEvidence.filter((e) => !usedEvidence.has(e.id));

  const contribute = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/group-goals/${goal.id}/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), evidenceId, note }),
      });
      const data = await res.json();
      if (res.ok) {
        setAmount('');
        setEvidenceId('');
        setNote('');
        onFlash(data.goal?.status === 'completed' ? 'Goal complete! 🎯' : 'Logged.');
        onChanged();
      } else {
        onError(data.error || 'Failed to log contribution');
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to log contribution');
    } finally {
      setBusy(false);
    }
  };

  const strike = async (contributionId: string, striking: boolean) => {
    const reason = striking ? prompt('Why are you challenging this contribution?') : null;
    if (striking && !reason?.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/group-goals/${goal.id}/strike`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contributionId, strike: striking, reason }),
      });
      const data = await res.json();
      if (res.ok) onChanged();
      else onError(data.error || 'Failed to update contribution');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update contribution');
    } finally {
      setBusy(false);
    }
  };

  const payout = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/group-goals/${goal.id}/payout`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error || 'Failed to file payout');
        return;
      }
      const filed = data.filed?.length || 0;
      const outstanding = data.skipped?.length || 0;
      onFlash(
        filed > 0
          ? `Filed ${filed} award${filed === 1 ? '' : 's'} for the vote.${
              outstanding > 0 ? ` ${outstanding} still need${outstanding === 1 ? 's' : ''} someone else to file it.` : ''
            }`
          : 'Nothing left for you to file — a crewmate has to file the rest.'
      );
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to file payout');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass card-shadow overflow-hidden animate-rise">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-lg font-bold text-white">{goal.title}</h2>
              {complete && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(52,211,153,0.15)', color: 'var(--accent-green)' }}
                >
                  Complete
                </span>
              )}
              {overdue && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)' }}
                >
                  Deadline passed
                </span>
              )}
            </div>
            {goal.detail && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {goal.detail}
              </p>
            )}
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              set by {goal.createdByName}
              {goal.deadline && ` · by ${new Date(goal.deadline).toLocaleDateString('en-GB')}`}
              {' · '}
              {goal.rewardMode === 'proportional'
                ? `${goal.rewardPool} pts of ${goal.statLabel} split by contribution`
                : `${goal.rewardFirst}/${goal.rewardSecond}/${goal.rewardThird} pts of ${goal.statLabel} for the podium`}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="font-display text-2xl font-bold text-white">
            <CountUp value={goal.progress} />
            <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>
              / {goal.target.toLocaleString()} {goal.unit}
            </span>
          </p>
          <p className="text-sm font-bold" style={{ color: complete ? 'var(--accent-green)' : 'var(--accent-cyan)' }}>
            {Math.round(pct)}%
          </p>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: complete
                ? 'linear-gradient(90deg, #34d399, #22d3ee)'
                : 'linear-gradient(90deg, #22d3ee, #a855f7)',
            }}
          />
        </div>

        {/* Standings */}
        {goal.standings.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {goal.standings.map((s) => (
              <div key={s.playerId} className="flex items-center gap-2.5">
                <span className="w-6 text-center text-sm shrink-0">
                  {goal.rewardMode === 'podium' && s.rank <= 3 ? MEDAL[s.rank - 1] : s.rank}
                </span>
                <Avatar id={s.playerId} name={s.playerName} size={24} />
                <span className="text-sm text-neutral-200 min-w-0 truncate flex-1">{s.playerName}</span>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  {Math.round(s.share * 100)}%
                </span>
                <span
                  className="text-sm font-bold tabular-nums shrink-0 w-20 text-right"
                  style={{ color: getUserColorHex(s.playerId) }}
                >
                  {s.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Log a contribution */}
        {!complete && goal.status === 'active' && !overdue && (
          <div className="rounded-xl border p-3.5 mb-3" style={{ borderColor: 'var(--surface-border)' }}>
            <p className="text-sm font-semibold text-white mb-2">Log your contribution</p>
            {availableEvidence.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Every contribution needs one of your own evidence posts attached.{' '}
                <Link href="/evidence" className="underline" style={{ color: 'var(--accent-cyan)' }}>
                  Post the proof
                </Link>{' '}
                and it&apos;ll show up here.
              </p>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="field py-2 w-28"
                    placeholder={goal.unit}
                  />
                  <select
                    value={evidenceId}
                    onChange={(e) => setEvidenceId(e.target.value)}
                    className="field py-2 flex-1 min-w-[180px]"
                  >
                    <option value="">Attach evidence…</option>
                    {availableEvidence.map((e) => (
                      <option key={e.id} value={e.id}>
                        {/* A hidden or missing caption falls back to when the
                            post was made, not to today. */}
                        {(e.captionHidden ? '' : e.caption) ||
                          new Date(e.createdAt).toLocaleDateString('en-GB')}{' '}
                        — {e.mediaType || 'post'}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={contribute}
                    disabled={busy || !amount || Number(amount) < 1 || !evidenceId}
                    className="btn-gradient px-4 py-2 disabled:opacity-50"
                  >
                    Log it
                  </button>
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="field py-2 mt-2 text-sm"
                  placeholder="Note (optional)"
                />
              </>
            )}
          </div>
        )}

        {/* Payout */}
        {complete && (
          <div
            className="rounded-xl border p-3.5 mb-3 flex items-center gap-3 flex-wrap"
            style={{ borderColor: 'rgba(52,211,153,0.35)', background: 'rgba(52,211,153,0.06)' }}
          >
            <TrophyIcon size={18} className="text-emerald-400 shrink-0" />
            <p className="text-xs flex-1 min-w-[180px]" style={{ color: 'var(--text-secondary)' }}>
              {paidOut
                ? `Payout filed for ${goal.paidOutPlayerIds.length} of ${goal.standings.length}. Anyone can file the rest — you can never file your own.`
                : 'Ready to settle up. Awards go to the crew as normal suggestions — nobody awards themselves.'}
            </p>
            <button onClick={payout} disabled={busy} className="btn-gradient text-sm px-4 py-2">
              {paidOut ? 'File the rest' : 'File the payout'}
            </button>
          </div>
        )}

        <button
          onClick={onToggle}
          className="text-xs font-semibold hover:underline"
          style={{ color: 'var(--accent-cyan)' }}
        >
          {expanded ? 'Hide' : `Show`} the {contributions.length} logged contribution
          {contributions.length === 1 ? '' : 's'}
        </button>
      </div>

      {/* Contribution log — the receipts */}
      {expanded && (
        <div className="border-t px-5 py-4 space-y-2" style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.015)' }}>
          {contributions.length === 0 ? (
            <p className="text-sm py-2" style={{ color: 'var(--text-secondary)' }}>
              Nothing logged yet.
            </p>
          ) : (
            contributions.map((c) => {
              const struck = c.status === 'struck';
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${struck ? 'opacity-60' : ''}`}
                  style={{ borderColor: struck ? 'rgba(239,68,68,0.35)' : 'var(--surface-border)' }}
                >
                  {c.evidenceUrl ? (
                    <img
                      src={cldThumb(c.evidenceUrl, 72)}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-white/5 shrink-0" />
                  )}
                  <Avatar id={c.playerId} name={c.playerName} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${struck ? 'line-through text-neutral-500' : 'text-neutral-200'}`}>
                      {c.playerName} · {c.amount.toLocaleString()} {goal.unit}
                    </p>
                    {(c.note || struck) && (
                      <p className="text-[11px]" style={{ color: struck ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                        {struck ? `Challenged by ${c.struckByName}: ${c.struckReason}` : c.note}
                      </p>
                    )}
                  </div>
                  {!paidOut && (
                    <button
                      onClick={() => strike(c.id, !struck)}
                      disabled={busy || (!struck && c.playerId === currentPlayerId)}
                      className="text-xs shrink-0 px-2 py-1 rounded-lg transition disabled:opacity-30 hover:bg-white/5"
                      style={{ color: struck ? 'var(--accent-green)' : 'var(--accent-red)' }}
                      title={
                        !struck && c.playerId === currentPlayerId
                          ? "You can't strike your own contribution"
                          : struck
                          ? 'Restore this contribution'
                          : 'Challenge this contribution'
                      }
                    >
                      {struck ? <CheckIcon size={13} /> : <WarningIcon size={13} />}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

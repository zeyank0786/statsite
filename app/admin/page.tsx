'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { getCategoryMeta, orderCategories, orderStats } from '@/lib/categories';
import {
  WarningIcon,
  CheckIcon,
  PlusIcon,
  XIcon,
  PencilIcon,
  TrashIcon,
  LockIcon,
  UnlockIcon,
  EyeOffIcon,
  ShieldIcon,
} from '@/components/icons';

interface AdminPlayer {
  id: string;
  username: string;
  active: boolean;
  archivedAt: string | null;
  email: string | null;
  isAdmin: boolean;
}

interface CatalogData {
  categories: { id: string; code: string; label: string; emoji: string }[];
  stats: { id: string; code: string; label: string; categoryId: string }[];
  visibility: { id: string; statId: string; playerId: string; hidden: number }[];
  prereqs: {
    id: string;
    statId: string;
    requiredStatId: string | null;
    requiredCategoryId: string | null;
    comparator: string;
    thresholdValue: number;
    requiredStatLabel: string | null;
    requiredCategoryLabel: string | null;
  }[];
  overrides: { id: string; statId: string; playerId: string; forcedState: string }[];
  players: { id: string; username: string; active: number }[];
}

type Tab = 'roster' | 'catalog' | 'gating' | 'danger';

export default function AdminPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('roster');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [roster, setRoster] = useState<AdminPlayer[]>([]);
  const [catalog, setCatalog] = useState<CatalogData | null>(null);

  const isAdmin = Boolean((session?.user as any)?.isAdmin);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated' && isAdmin) {
      refresh();
    }
  }, [status, router, isAdmin]);

  const refresh = async () => {
    try {
      const [rosterRes, catalogRes] = await Promise.all([
        fetch('/api/admin/players'),
        fetch('/api/admin/catalog'),
      ]);
      if (rosterRes.ok) setRoster(await rosterRes.json());
      if (catalogRes.ok) setCatalog(await catalogRes.json());
    } catch (error) {
      console.error('Failed to load admin data:', error);
    }
  };

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const call = async (url: string, method: string, body: any): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('err', data.error || 'Action failed');
        return false;
      }
      await refresh();
      return true;
    } catch (error: any) {
      flash('err', error.message || 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return (
      <AppShell width="wide">
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="glass card-shadow text-center py-20 px-6 max-w-lg mx-auto">
          <span className="inline-flex mb-4 text-neutral-500">
            <ShieldIcon size={40} />
          </span>
          <h1 className="font-display text-2xl font-bold text-white mb-2">Admins only</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Roster, stat catalog and lock management are restricted. Ask an admin if you think
            you should have access.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell width="wide">
      <PageHeader
        title="Admin Panel"
        subtitle="Roster, stat catalog, visibility and locking — changes apply to everyone instantly."
        eyebrow="Admin"
        eyebrowColor="var(--accent-red)"
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

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl border w-fit mb-6 flex-wrap" style={{ borderColor: 'var(--surface-border)' }}>
        {(
          [
            { key: 'roster', label: 'Roster' },
            { key: 'catalog', label: 'Categories & Stats' },
            { key: 'gating', label: 'Locks & Prereqs' },
            { key: 'danger', label: 'Danger Zone' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key ? 'text-white' : 'text-neutral-400 hover:text-white'
            }`}
            style={
              tab === t.key
                ? { background: t.key === 'danger' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.1)' }
                : {}
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'roster' && <RosterTab roster={roster} busy={busy} call={call} />}
      {tab === 'catalog' && catalog && <CatalogTab catalog={catalog} busy={busy} call={call} />}
      {tab === 'gating' && catalog && <GatingTab catalog={catalog} busy={busy} call={call} />}
      {tab === 'danger' && <DangerTab />}
    </AppShell>
  );
}

/* ============================== Roster ============================== */

function RosterTab({
  roster,
  busy,
  call,
}: {
  roster: AdminPlayer[];
  busy: boolean;
  call: (url: string, method: string, body: any) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState('');

  const addPlayer = async () => {
    if (!newName.trim()) return;
    const ok = await call('/api/admin/players', 'POST', { username: newName.trim() });
    if (ok) setNewName('');
  };

  return (
    <div className="space-y-5 animate-rise">
      <section className="glass card-shadow p-5">
        <h2 className="font-display text-lg font-bold text-white mb-3">Add a player</h2>
        <div className="flex gap-2 max-w-md">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Username"
            className="field"
            onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
          />
          <button onClick={addPlayer} disabled={busy || !newName.trim()} className="btn-gradient shrink-0">
            <PlusIcon size={16} /> Add
          </button>
        </div>
        <p className="text-xs mt-2.5" style={{ color: 'var(--text-secondary)' }}>
          Stats start at the default of 5 across the board. They claim their account at
          /claim-profile with email + password.
        </p>
      </section>

      <section className="glass card-shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: 'var(--surface-border)' }}>
              {['Player', 'Email', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.id} className="border-b last:border-0" style={{ borderColor: 'var(--surface-border)' }}>
                <td className="px-4 py-3.5">
                  <span className="flex items-center gap-2.5">
                    <Avatar id={p.id} name={p.username} size={30} />
                    <span className={`font-semibold ${p.active ? 'text-white' : 'text-neutral-500 line-through'}`}>
                      {p.username}
                    </span>
                    {p.isAdmin && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)' }}>
                        admin
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3.5" style={{ color: 'var(--text-secondary)' }}>
                  {p.email || <span className="italic">unclaimed</span>}
                </td>
                <td className="px-4 py-3.5">
                  {p.active ? (
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>Active</span>
                  ) : (
                    <span className="text-xs font-semibold text-neutral-500">
                      Archived {p.archivedAt ? new Date(p.archivedAt).toLocaleDateString() : ''}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={() => {
                      if (
                        p.active &&
                        !confirm(
                          `Deactivate ${p.username}? Their history, evidence and suggestions stay visible, but they drop out of active rosters and vote counts.`
                        )
                      )
                        return;
                      call('/api/admin/players', 'PATCH', { playerId: p.id, active: !p.active });
                    }}
                    disabled={busy}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      p.active
                        ? 'text-red-400 border-red-500/30 hover:bg-red-500/10'
                        : 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'
                    }`}
                  >
                    {p.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ============================== Catalog ============================== */

function CatalogTab({
  catalog,
  busy,
  call,
}: {
  catalog: CatalogData;
  busy: boolean;
  call: (url: string, method: string, body: any) => Promise<boolean>;
}) {
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newStatLabel, setNewStatLabel] = useState('');
  const [editing, setEditing] = useState<{ kind: 'cat' | 'stat'; id: string; label: string } | null>(null);

  const orderedCategories = orderCategories(catalog.categories);
  const activePlayers = catalog.players.filter((p) => Number(p.active));

  const hiddenSet = new Set(
    catalog.visibility.filter((v) => Number(v.hidden)).map((v) => `${v.statId}:${v.playerId}`)
  );

  return (
    <div className="space-y-5 animate-rise">
      <section className="glass card-shadow p-5">
        <h2 className="font-display text-lg font-bold text-white mb-3">Add a category</h2>
        <div className="flex gap-2 max-w-lg flex-wrap">
          <input
            value={newCatLabel}
            onChange={(e) => setNewCatLabel(e.target.value)}
            placeholder="Label (e.g. Discipline)"
            className="field flex-1 min-w-[180px]"
          />
          <input
            value={newCatEmoji}
            onChange={(e) => setNewCatEmoji(e.target.value)}
            placeholder="Emoji"
            className="field w-20 text-center"
            maxLength={4}
          />
          <button
            onClick={async () => {
              const ok = await call('/api/admin/catalog', 'POST', {
                action: 'createCategory',
                label: newCatLabel,
                emoji: newCatEmoji || '⭐',
              });
              if (ok) {
                setNewCatLabel('');
                setNewCatEmoji('');
              }
            }}
            disabled={busy || !newCatLabel.trim()}
            className="btn-gradient shrink-0"
          >
            <PlusIcon size={16} /> Add
          </button>
        </div>
      </section>

      {orderedCategories.map((cat) => {
        const meta = getCategoryMeta(cat.code, cat.label);
        const catStats = orderStats(catalog.stats.filter((s) => s.categoryId === cat.id));
        const isOpen = expanded === cat.id;

        return (
          <section key={cat.id} className="glass card-shadow overflow-hidden">
            {/* Category header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition"
              onClick={() => setExpanded(isOpen ? null : cat.id)}
            >
              <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: meta.hex }} />
              <span className="text-xl">{cat.emoji}</span>
              {editing?.kind === 'cat' && editing.id === cat.id ? (
                <span className="flex gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={editing.label}
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    className="field py-1.5 max-w-[240px]"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      const ok = await call('/api/admin/catalog', 'POST', {
                        action: 'updateCategory',
                        categoryId: cat.id,
                        label: editing.label,
                      });
                      if (ok) setEditing(null);
                    }}
                    className="btn-primary py-1.5 px-2.5"
                  >
                    <CheckIcon size={14} />
                  </button>
                  <button onClick={() => setEditing(null)} className="btn-ghost py-1.5 px-2.5">
                    <XIcon size={14} />
                  </button>
                </span>
              ) : (
                <span className="flex-1 min-w-0">
                  <span className="font-display font-bold text-white">{cat.label}</span>
                  <span className="text-xs ml-2" style={{ color: 'var(--text-secondary)' }}>
                    {catStats.length} stats
                  </span>
                </span>
              )}
              <span className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setEditing({ kind: 'cat', id: cat.id, label: cat.label })}
                  className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                  title="Rename category"
                >
                  <PencilIcon size={14} />
                </button>
                <button
                  onClick={() => {
                    if (catStats.length > 0) {
                      alert('Category still has stats — move or delete them first.');
                      return;
                    }
                    if (confirm(`Delete empty category "${cat.label}"?`)) {
                      call('/api/admin/catalog', 'POST', { action: 'deleteCategory', categoryId: cat.id });
                    }
                  }}
                  className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  title="Delete category (must be empty)"
                >
                  <TrashIcon size={14} />
                </button>
              </span>
            </div>

            {isOpen && (
              <div className="border-t px-5 py-4" style={{ borderColor: 'var(--surface-border)' }}>
                {/* Add stat */}
                <div className="flex gap-2 mb-4 max-w-lg">
                  <input
                    value={newStatLabel}
                    onChange={(e) => setNewStatLabel(e.target.value)}
                    placeholder={`New stat in ${cat.label}...`}
                    className="field py-2"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newStatLabel.trim()) {
                        const ok = await call('/api/admin/catalog', 'POST', {
                          action: 'createStat',
                          categoryId: cat.id,
                          label: newStatLabel.trim(),
                        });
                        if (ok) setNewStatLabel('');
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      const ok = await call('/api/admin/catalog', 'POST', {
                        action: 'createStat',
                        categoryId: cat.id,
                        label: newStatLabel.trim(),
                      });
                      if (ok) setNewStatLabel('');
                    }}
                    disabled={busy || !newStatLabel.trim()}
                    className="btn-ghost py-2 shrink-0"
                  >
                    <PlusIcon size={14} /> Stat
                  </button>
                </div>

                {/* Per-category visibility bulk row */}
                <div className="flex items-center gap-2 mb-4 flex-wrap text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <EyeOffIcon size={13} />
                  Hide whole category for:
                  {activePlayers.map((p) => {
                    const allHidden =
                      catStats.length > 0 && catStats.every((s) => hiddenSet.has(`${s.id}:${p.id}`));
                    return (
                      <button
                        key={p.id}
                        onClick={() =>
                          call('/api/admin/gating', 'POST', {
                            action: 'setCategoryVisibility',
                            categoryId: cat.id,
                            playerId: p.id,
                            hidden: !allHidden,
                          })
                        }
                        disabled={busy}
                        className={`px-2 py-1 rounded-lg border font-semibold transition ${
                          allHidden ? 'text-red-300' : 'text-neutral-400 hover:text-white'
                        }`}
                        style={{
                          borderColor: allHidden ? 'rgba(239,68,68,0.5)' : 'var(--surface-border)',
                          background: allHidden ? 'rgba(239,68,68,0.12)' : 'transparent',
                        }}
                      >
                        {p.username}
                      </button>
                    );
                  })}
                </div>

                {/* Stat rows */}
                <div className="space-y-1.5">
                  {catStats.map((stat) => (
                    <div
                      key={stat.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border flex-wrap"
                      style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.015)' }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider w-14 shrink-0" style={{ color: meta.hex }}>
                        {stat.code}
                      </span>
                      {editing?.kind === 'stat' && editing.id === stat.id ? (
                        <span className="flex gap-2 flex-1 min-w-[200px]">
                          <input
                            value={editing.label}
                            onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                            className="field py-1.5"
                            autoFocus
                          />
                          <button
                            onClick={async () => {
                              const ok = await call('/api/admin/catalog', 'POST', {
                                action: 'updateStat',
                                statId: stat.id,
                                label: editing.label,
                              });
                              if (ok) setEditing(null);
                            }}
                            className="btn-primary py-1.5 px-2.5"
                          >
                            <CheckIcon size={14} />
                          </button>
                          <button onClick={() => setEditing(null)} className="btn-ghost py-1.5 px-2.5">
                            <XIcon size={14} />
                          </button>
                        </span>
                      ) : (
                        <span className="flex-1 text-sm text-white min-w-[140px]">{stat.label}</span>
                      )}

                      {/* Per-player hide chips */}
                      <span className="flex gap-1 flex-wrap">
                        {activePlayers.map((p) => {
                          const hidden = hiddenSet.has(`${stat.id}:${p.id}`);
                          return (
                            <button
                              key={p.id}
                              onClick={() =>
                                call('/api/admin/gating', 'POST', {
                                  action: 'setVisibility',
                                  statId: stat.id,
                                  playerId: p.id,
                                  hidden: !hidden,
                                })
                              }
                              disabled={busy}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                                hidden ? 'text-red-300 line-through' : 'text-neutral-500 hover:text-white'
                              }`}
                              style={{ background: hidden ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)' }}
                              title={hidden ? `Hidden for ${p.username} — click to show` : `Visible for ${p.username} — click to hide`}
                            >
                              {p.username.slice(0, 4)}
                            </button>
                          );
                        })}
                      </span>

                      <span className="flex gap-1 ml-auto shrink-0">
                        <button
                          onClick={() => setEditing({ kind: 'stat', id: stat.id, label: stat.label })}
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                          title="Rename stat"
                        >
                          <PencilIcon size={13} />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `DELETE "${stat.label}" globally?\n\nThis permanently destroys every player's value AND history for this stat. If you just want it gone for someone, hide it instead.`
                              ) &&
                              confirm('Really sure? This cannot be undone.')
                            ) {
                              call('/api/admin/catalog', 'POST', { action: 'deleteStat', statId: stat.id });
                            }
                          }}
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                          title="Delete stat everywhere (destroys history!)"
                        >
                          <TrashIcon size={13} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ============================== Gating ============================== */

function GatingTab({
  catalog,
  busy,
  call,
}: {
  catalog: CatalogData;
  busy: boolean;
  call: (url: string, method: string, body: any) => Promise<boolean>;
}) {
  const [selectedStatId, setSelectedStatId] = useState('');
  const [ruleType, setRuleType] = useState<'stat' | 'category'>('category');
  const [ruleTargetId, setRuleTargetId] = useState('');
  const [threshold, setThreshold] = useState(15);

  const orderedCategories = orderCategories(catalog.categories);
  const statById = new Map(catalog.stats.map((s) => [s.id, s]));
  const activePlayers = catalog.players.filter((p) => Number(p.active));

  const selectedStat = statById.get(selectedStatId);
  const statPrereqs = catalog.prereqs.filter((p) => p.statId === selectedStatId);
  const statOverrides = catalog.overrides.filter((o) => o.statId === selectedStatId);
  const gatedStatIds = new Set([
    ...catalog.prereqs.map((p) => p.statId),
    ...catalog.overrides.map((o) => o.statId),
  ]);

  return (
    <div className="space-y-5 animate-rise">
      <section className="glass card-shadow p-5">
        <h2 className="font-display text-lg font-bold text-white mb-1">Stat locking</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Pick a stat, then add prerequisite rules ("locked until X reaches N" — AND logic) or set
          per-player manual overrides. Locked stats can't receive suggestions but stay visible so
          people see what they're working toward.
        </p>

        <select value={selectedStatId} onChange={(e) => setSelectedStatId(e.target.value)} className="field max-w-md">
          <option value="">Choose a stat to gate...</option>
          {orderedCategories.map((cat) => (
            <optgroup key={cat.id} label={cat.label}>
              {orderStats(catalog.stats.filter((s) => s.categoryId === cat.id)).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.code}){gatedStatIds.has(s.id) ? ' 🔒' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </section>

      {selectedStat && (
        <>
          {/* Prerequisite rules */}
          <section className="glass card-shadow p-5">
            <h3 className="font-display font-bold text-white mb-3 flex items-center gap-2">
              <LockIcon size={16} />
              Prerequisites for {selectedStat.label}
            </h3>

            {statPrereqs.length > 0 ? (
              <div className="space-y-2 mb-4">
                {statPrereqs.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border"
                    style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.05)' }}
                  >
                    <span className="text-sm text-white">
                      {rule.requiredStatId ? 'Stat' : 'Category'}{' '}
                      <strong>{rule.requiredStatLabel || rule.requiredCategoryLabel}</strong>{' '}
                      {rule.comparator} {rule.thresholdValue}
                    </span>
                    <button
                      onClick={() => call('/api/admin/gating', 'POST', { action: 'deletePrereq', prereqId: rule.id })}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                ))}
                {statPrereqs.length > 1 && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    All rules must be met (AND).
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                No rules yet — this stat is unlocked for everyone (unless overridden below).
              </p>
            )}

            <div className="flex gap-2 flex-wrap items-center">
              <select
                value={ruleType}
                onChange={(e) => {
                  setRuleType(e.target.value as any);
                  setRuleTargetId('');
                }}
                className="field w-auto py-2"
              >
                <option value="category">Category total</option>
                <option value="stat">Single stat</option>
              </select>
              <select value={ruleTargetId} onChange={(e) => setRuleTargetId(e.target.value)} className="field flex-1 min-w-[180px] py-2">
                <option value="">Pick {ruleType === 'stat' ? 'a stat' : 'a category'}...</option>
                {ruleType === 'category'
                  ? orderedCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))
                  : catalog.stats
                      .filter((s) => s.id !== selectedStatId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} ({s.code})
                        </option>
                      ))}
              </select>
              <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                ≥
              </span>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="field w-24 py-2 text-center"
              />
              <button
                onClick={() =>
                  call('/api/admin/gating', 'POST', {
                    action: 'addPrereq',
                    statId: selectedStatId,
                    requiredStatId: ruleType === 'stat' ? ruleTargetId : undefined,
                    requiredCategoryId: ruleType === 'category' ? ruleTargetId : undefined,
                    thresholdValue: threshold,
                  })
                }
                disabled={busy || !ruleTargetId}
                className="btn-gradient py-2 shrink-0"
              >
                <PlusIcon size={14} /> Add rule
              </button>
            </div>
          </section>

          {/* Manual overrides */}
          <section className="glass card-shadow p-5">
            <h3 className="font-display font-bold text-white mb-1 flex items-center gap-2">
              <UnlockIcon size={16} />
              Manual overrides
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Force lock/unlock per player — always beats the computed rules.
            </p>
            <div className="space-y-2">
              {activePlayers.map((p) => {
                const override = statOverrides.find((o) => o.playerId === p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border flex-wrap"
                    style={{ borderColor: 'var(--surface-border)' }}
                  >
                    <span className="flex items-center gap-2.5">
                      <Avatar id={p.id} name={p.username} size={26} />
                      <span className="text-sm font-medium text-white">{p.username}</span>
                    </span>
                    <span className="flex gap-1.5">
                      {(
                        [
                          { state: 'locked', label: 'Force lock', color: 'var(--accent-red)' },
                          { state: 'unlocked', label: 'Force unlock', color: 'var(--accent-green)' },
                          { state: null, label: 'Auto (rules)', color: 'var(--accent-cyan)' },
                        ] as const
                      ).map((opt) => {
                        const active = (override?.forcedState || null) === opt.state;
                        return (
                          <button
                            key={String(opt.state)}
                            onClick={() =>
                              call('/api/admin/gating', 'POST', {
                                action: 'setOverride',
                                statId: selectedStatId,
                                playerId: p.id,
                                forcedState: opt.state,
                              })
                            }
                            disabled={busy}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              active ? 'text-white' : 'text-neutral-400 hover:text-white'
                            }`}
                            style={{
                              borderColor: active ? opt.color : 'var(--surface-border)',
                              background: active ? `color-mix(in srgb, ${opt.color} 20%, transparent)` : 'transparent',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ============================== Danger ============================== */

function DangerTab() {
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const handleSeed = async () => {
    if (!password) {
      setPasswordError('Password is required');
      return;
    }
    setSeeding(true);
    setPasswordError('');
    setSeedSuccess(false);
    try {
      const res = await fetch('/api/admin/seed-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setSeedSuccess(true);
        setPassword('');
      } else {
        const data = await res.json();
        setPasswordError(data.error || 'Failed to seed database');
      }
    } catch (error: any) {
      setPasswordError(error.message || 'An error occurred');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div
      className="rounded-3xl border-2 p-6 md:p-8 animate-rise"
      style={{ borderColor: 'rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.05)' }}
    >
      <div className="flex items-start gap-4 mb-6">
        <span className="text-red-400 shrink-0 mt-1">
          <WarningIcon size={32} />
        </span>
        <div>
          <h3 className="font-display text-xl font-bold text-red-400 mb-1">Danger Zone</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            This action will <strong className="text-white">delete all data</strong> and reset the
            database to its initial state. It cannot be undone.
          </p>
        </div>
      </div>

      <div className="space-y-4 max-w-xl">
        <div>
          <label className="text-sm font-semibold text-white block mb-2">Admin password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError('');
            }}
            placeholder="Enter admin password to proceed"
            className="field"
            onKeyDown={(e) => e.key === 'Enter' && handleSeed()}
            disabled={seeding}
          />
          {passwordError && <p className="text-red-400 text-sm mt-2">{passwordError}</p>}
        </div>

        {seedSuccess && (
          <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 flex items-center gap-2">
            <CheckIcon size={15} />
            Database seeded successfully. All data has been reset.
          </div>
        )}

        <button
          onClick={handleSeed}
          disabled={seeding}
          className="w-full py-3 px-6 rounded-xl font-bold text-white transition disabled:opacity-50 bg-red-600 hover:bg-red-500"
        >
          {seeding ? 'Seeding...' : 'Reset database & seed data'}
        </button>
      </div>
    </div>
  );
}

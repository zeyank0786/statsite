'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { BellIcon, ClockIcon, PlusIcon, PencilIcon, TrashIcon, CheckIcon, XIcon } from '@/components/icons';

type Frequency = 'once' | 'daily' | 'weekly' | 'monthly';

interface Reminder {
  id: string;
  playerId: string;
  title: string;
  body: string | null;
  frequency: Frequency;
  timeMinutes: number;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  onceDate: string | null;
  isAdminSet: boolean;
  enabled: boolean;
}

interface ReminderData {
  reminders: Reminder[];
  timezone: string;
  targetId: string;
  targetName: string;
  isAdmin: boolean;
  isSelf: boolean;
  players?: { id: string; username: string }[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COMMON_TZS = [
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Athens',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const pad = (n: number) => String(n).padStart(2, '0');
const minutesToHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const hhmmToMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
function formatTime12(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 || 12;
  return `${hr}:${pad(min)} ${ampm}`;
}
function describe(r: Reminder) {
  const t = formatTime12(r.timeMinutes);
  if (r.frequency === 'daily') return `Every day at ${t}`;
  if (r.frequency === 'weekly') return `${r.daysOfWeek.map((d) => WEEKDAYS[d]).join(', ') || '—'} at ${t}`;
  if (r.frequency === 'monthly') return `Day ${r.dayOfMonth} of each month at ${t}`;
  if (r.frequency === 'once') return `Once on ${r.onceDate} at ${t}`;
  return t;
}

interface FormState {
  title: string;
  body: string;
  frequency: Frequency;
  time: string;
  daysOfWeek: number[];
  dayOfMonth: number;
  onceDate: string;
}

const emptyForm = (): FormState => ({
  title: '',
  body: '',
  frequency: 'daily',
  time: '09:00',
  daysOfWeek: [],
  dayOfMonth: 1,
  onceDate: '',
});

export default function RemindersPage() {
  const { status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<ReminderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const [tzDraft, setTzDraft] = useState('');
  const [tzSaving, setTzSaving] = useState(false);
  const [tzSaved, setTzSaved] = useState(false);

  const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

  const load = useCallback(async (targetId?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = targetId ? `?playerId=${encodeURIComponent(targetId)}` : '';
      const res = await fetch(`/api/reminders${qs}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setData(d);
      setTzDraft(d.timezone);
    } catch (e: any) {
      setError(e.message || 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    else if (status === 'authenticated') load();
  }, [status, router, load]);

  const canManage = (r: Reminder) => !!data && (data.isAdmin || (data.isSelf && !r.isAdminSet));

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (r: Reminder) => {
    setForm({
      title: r.title,
      body: r.body || '',
      frequency: r.frequency,
      time: minutesToHHMM(r.timeMinutes),
      daysOfWeek: [...r.daysOfWeek],
      dayOfMonth: r.dayOfMonth || 1,
      onceDate: r.onceDate || '',
    });
    setEditingId(r.id);
    setShowForm(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleDay = (d: number) =>
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter((x) => x !== d) : [...f.daysOfWeek, d].sort(),
    }));

  const submit = async () => {
    if (!data) return;
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        playerId: data.targetId,
        title: form.title,
        body: form.body,
        frequency: form.frequency,
        timeMinutes: hhmmToMinutes(form.time),
        daysOfWeek: form.frequency === 'weekly' ? form.daysOfWeek : [],
        dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth : null,
        onceDate: form.frequency === 'once' ? form.onceDate : null,
      };
      let res: Response;
      if (editingId) {
        res = await fetch('/api/reminders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
      } else {
        res = await fetch('/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save');
      resetForm();
      await load(data.isSelf ? undefined : data.targetId);
    } catch (e: any) {
      setError(e.message || 'Failed to save reminder');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: Reminder) => {
    if (!data) return;
    try {
      const res = await fetch('/api/reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, enabled: !r.enabled }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      await load(data.isSelf ? undefined : data.targetId);
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  };

  const remove = async (r: Reminder) => {
    if (!data) return;
    if (!confirm(`Delete "${r.title}"?`)) return;
    try {
      const res = await fetch('/api/reminders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      await load(data.isSelf ? undefined : data.targetId);
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  };

  const saveTimezone = async () => {
    if (!data) return;
    setTzSaving(true);
    setTzSaved(false);
    setError('');
    try {
      const res = await fetch('/api/reminders/timezone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: data.targetId, timezone: tzDraft }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setTzSaved(true);
      setTimeout(() => setTzSaved(false), 2500);
      await load(data.isSelf ? undefined : data.targetId);
    } catch (e: any) {
      setError(e.message || 'Failed to save timezone');
    } finally {
      setTzSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell width="narrow">
        <PageHeader title="Reminders" eyebrow="Notifications" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell width="narrow">
        <PageHeader title="Reminders" eyebrow="Notifications" />
        <div className="glass card-shadow p-6 text-sm text-red-400">{error || 'Could not load reminders.'}</div>
      </AppShell>
    );
  }

  const tzOptions = Array.from(new Set([browserTz, data.timezone, ...COMMON_TZS])).filter(Boolean);
  const managingOther = data.isAdmin && !data.isSelf;

  return (
    <AppShell width="narrow">
      <PageHeader
        title="Reminders"
        eyebrow="Notifications"
        subtitle={
          managingOther
            ? `Managing reminders for ${data.targetName}. These are marked admin-set — they'll see them but can't change them.`
            : 'Set custom push reminders — daily, on certain weekdays, monthly, or one-off.'
        }
        actions={
          !showForm ? (
            <button onClick={() => { setForm(emptyForm()); setEditingId(null); setShowForm(true); }} className="btn-gradient flex items-center gap-2 px-4 py-2.5">
              <PlusIcon size={16} /> New reminder
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10 mb-5">
          {error}
        </div>
      )}

      {/* Admin: choose whose reminders to manage */}
      {data.isAdmin && data.players && (
        <div className="glass card-shadow p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-sm font-semibold text-white whitespace-nowrap">Manage reminders for</label>
          <select
            className="field"
            value={data.targetId}
            onChange={(e) => { resetForm(); load(e.target.value); }}
          >
            {data.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.username}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Timezone */}
      <div className="glass card-shadow p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <ClockIcon size={16} className="text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">
            Timezone {managingOther ? `for ${data.targetName}` : ''}
          </h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Every reminder fires in this timezone. Currently <span className="text-white font-medium">{data.timezone}</span>.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select className="field" value={tzDraft} onChange={(e) => setTzDraft(e.target.value)}>
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz === browserTz ? `${tz} (your device)` : tz}
              </option>
            ))}
          </select>
          <button
            onClick={saveTimezone}
            disabled={tzSaving || tzDraft === data.timezone}
            className="btn-gradient px-4 py-2.5 whitespace-nowrap disabled:opacity-50"
          >
            {tzSaving ? 'Saving…' : tzSaved ? 'Saved ✓' : 'Save timezone'}
          </button>
        </div>
      </div>

      {/* Create / edit form */}
      {showForm && (
        <div className="glass card-shadow p-5 md:p-6 mb-6 animate-rise">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">{editingId ? 'Edit reminder' : 'New reminder'}</h2>
            <button onClick={resetForm} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5">
              <XIcon size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-white">Title</label>
              <input
                className="field"
                value={form.title}
                maxLength={100}
                placeholder="e.g. Log today's workout"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5 text-white">Message <span className="font-normal text-neutral-500">(optional)</span></label>
              <textarea
                className="field min-h-[70px]"
                value={form.body}
                maxLength={500}
                placeholder="Anything you want the reminder to say."
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-white">Repeats</label>
                <select
                  className="field"
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Certain weekdays</option>
                  <option value="monthly">Monthly</option>
                  <option value="once">Once</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-white">Time</label>
                <input type="time" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
            </div>

            {form.frequency === 'weekly' && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-white">On these days</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((label, d) => {
                    const on = form.daysOfWeek.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                          on ? 'text-white' : 'text-neutral-400 hover:text-white'
                        }`}
                        style={on ? { background: 'var(--brand-gradient)', borderColor: 'transparent' } : { borderColor: 'var(--surface-border)' }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {form.frequency === 'monthly' && (
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-white">Day of month</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="field max-w-[8rem]"
                  value={form.dayOfMonth}
                  onChange={(e) => setForm({ ...form, dayOfMonth: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
                />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Months shorter than this fire on their last day (e.g. 31 → Feb 28).
                </p>
              </div>
            )}

            {form.frequency === 'once' && (
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-white">Date</label>
                <input type="date" className="field max-w-[14rem]" value={form.onceDate} onChange={(e) => setForm({ ...form, onceDate: e.target.value })} />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={submit} disabled={saving} className="btn-gradient flex items-center gap-2 px-5 py-2.5 disabled:opacity-50">
                <CheckIcon size={16} /> {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create reminder'}
              </button>
              <button onClick={resetForm} className="px-4 py-2.5 rounded-xl text-sm font-medium text-neutral-300 border hover:text-white transition" style={{ borderColor: 'var(--surface-border)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {data.reminders.length === 0 ? (
        <div className="glass card-shadow p-8 text-center">
          <BellIcon size={28} className="mx-auto text-neutral-500 mb-3" />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No reminders yet. Create one to get a nudge at just the right time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.reminders.map((r) => (
            <div
              key={r.id}
              className={`glass card-shadow p-4 flex items-start gap-3 ${r.enabled ? '' : 'opacity-60'}`}
            >
              <div className="mt-0.5 shrink-0">
                <BellIcon size={18} className={r.enabled ? 'text-cyan-400' : 'text-neutral-500'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white truncate">{r.title}</span>
                  {r.isAdminSet && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      Admin-set
                    </span>
                  )}
                  {!r.enabled && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-neutral-500/15 text-neutral-400 border border-neutral-500/30">
                      Paused
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{describe(r)}</p>
                {r.body && <p className="text-sm mt-1.5 text-neutral-300">{r.body}</p>}
              </div>
              {canManage(r) && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggle(r)}
                    title={r.enabled ? 'Pause' : 'Resume'}
                    className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition text-xs font-medium"
                  >
                    {r.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => startEdit(r)} title="Edit" className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition">
                    <PencilIcon size={15} />
                  </button>
                  <button onClick={() => remove(r)} title="Delete" className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition">
                    <TrashIcon size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

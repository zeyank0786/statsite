import { query, queryAll } from './db';
import { firePush } from './push';
import { v4 as uuid } from 'uuid';
import { ensureOnce } from './ensureOnce';

/**
 * Custom reminders — user- (or admin-) defined notifications that fire on a
 * schedule. Four shapes, all evaluated against the OWNER'S timezone so "4pm"
 * means their local 4pm:
 *   daily    — every day at a time
 *   weekly   — chosen weekdays at a time (e.g. Tue & Wed 16:00)
 *   monthly  — a day-of-month at a time (clamped to the month's last day)
 *   once     — a single date + time, then auto-disables
 *
 * Firing is driven by a cron hitting /api/cron/reminders frequently (~15 min).
 * Vercel's Hobby plan cron only runs once a day, so real time-of-day precision
 * comes from a free external pinger (see REMINDERS-SETUP.md). The daily Vercel
 * cron also calls runDueReminders() as a once-a-day backstop.
 *
 * Dedup: each fire stamps lastFiredKey with the local date it fired on, so a
 * reminder fires at most once per matching day no matter how often the cron
 * runs. A late cron still fires (just late); it never double-fires.
 */

export const FREQUENCIES = ['once', 'daily', 'weekly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const DEFAULT_TIMEZONE = 'Europe/London';

export interface Reminder {
  id: string;
  playerId: string;
  title: string;
  body: string | null;
  frequency: Frequency;
  /** Minutes since local midnight (0–1439). 16:00 → 960. */
  timeMinutes: number;
  /** Weekly only: 0=Sun … 6=Sat. */
  daysOfWeek: number[];
  /** Monthly only: 1–31 (clamped to the month's last day when firing). */
  dayOfMonth: number | null;
  /** Once only: 'YYYY-MM-DD' in the owner's timezone. */
  onceDate: string | null;
  createdById: string;
  isAdminSet: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Additive tables + column — created on first use, no manual migration. */
export async function ensureReminderTables(): Promise<void> {
  return ensureOnce('reminders', ensureReminderTablesUncached);
}

async function ensureReminderTablesUncached(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS Reminder (
       id           TEXT PRIMARY KEY,
       playerId     TEXT NOT NULL,
       title        TEXT NOT NULL,
       body         TEXT,
       frequency    TEXT NOT NULL,
       timeMinutes  INTEGER NOT NULL,
       daysOfWeek   TEXT,
       dayOfMonth   INTEGER,
       onceDate     TEXT,
       createdById  TEXT NOT NULL,
       isAdminSet   INTEGER NOT NULL DEFAULT 0,
       enabled      INTEGER NOT NULL DEFAULT 1,
       lastFiredKey TEXT,
       createdAt    TEXT NOT NULL,
       updatedAt    TEXT NOT NULL
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS ReminderFire (
       id         TEXT PRIMARY KEY,
       reminderId TEXT NOT NULL,
       playerId   TEXT NOT NULL,
       title      TEXT NOT NULL,
       body       TEXT,
       firedAt    TEXT NOT NULL
     )`
  );
  // Per-user timezone lives on Player; older DBs won't have the column.
  try {
    await query('ALTER TABLE Player ADD COLUMN timezone TEXT');
  } catch {
    /* column already exists */
  }
}

// ---------------------------------------------------------------------------
// Timezone
// ---------------------------------------------------------------------------

export async function getPlayerTimezone(playerId: string): Promise<string> {
  try {
    const row = await queryAll('SELECT timezone FROM Player WHERE id = ?', [playerId]);
    const tz = (row as any[])[0]?.timezone;
    return tz ? String(tz) : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export async function setPlayerTimezone(playerId: string, timezone: string): Promise<void> {
  await ensureReminderTables();
  await query('UPDATE Player SET timezone = ? WHERE id = ?', [timezone, playerId]);
}

/** True if a string is a valid IANA timezone this runtime accepts. */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number; // 0–59
  /** 'YYYY-MM-DD' */
  dateKey: string;
  /** 0=Sun … 6=Sat */
  weekday: number;
  /** hour*60 + minute */
  minutesSinceMidnight: number;
}

/** Break an instant into calendar parts in a given timezone (DST-correct). */
export function localNowParts(tz: string, now: Date = new Date()): LocalParts {
  let zone = isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };
  // en-CA renders as YYYY-MM-DD / 24-hour, easiest to parse deterministically.
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0; // some ICU builds emit 24 at midnight
  const minute = Number(get('minute'));
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateKey = `${year}-${pad(month)}-${pad(day)}`;
  // Weekday is calendar-date-derived, so it's timezone-independent here.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, dateKey, weekday, minutesSinceMidnight: hour * 60 + minute };
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/** Days in a given month (month is 1–12). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Is this reminder due to fire at the given local moment? */
export function isDue(r: Reminder, p: LocalParts): boolean {
  if (p.minutesSinceMidnight < r.timeMinutes) return false; // its time hasn't arrived today
  switch (r.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return r.daysOfWeek.includes(p.weekday);
    case 'monthly': {
      const dom = r.dayOfMonth || 1;
      const target = Math.min(dom, daysInMonth(p.year, p.month)); // 31st in Feb → last day
      return p.day === target;
    }
    case 'once':
      return r.onceDate === p.dateKey;
    default:
      return false;
  }
}

export function mapReminderRow(row: any): Reminder {
  return {
    id: String(row.id),
    playerId: String(row.playerId),
    title: String(row.title),
    body: row.body != null ? String(row.body) : null,
    frequency: String(row.frequency) as Frequency,
    timeMinutes: Number(row.timeMinutes),
    daysOfWeek: row.daysOfWeek
      ? String(row.daysOfWeek)
          .split(',')
          .filter((s: string) => s !== '')
          .map(Number)
      : [],
    dayOfMonth: row.dayOfMonth != null ? Number(row.dayOfMonth) : null,
    onceDate: row.onceDate != null ? String(row.onceDate) : null,
    createdById: String(row.createdById),
    isAdminSet: Boolean(Number(row.isAdminSet)),
    enabled: Boolean(Number(row.enabled)),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export async function listRemindersForPlayer(playerId: string): Promise<Reminder[]> {
  await ensureReminderTables();
  const rows = await queryAll(
    'SELECT * FROM Reminder WHERE playerId = ? ORDER BY enabled DESC, timeMinutes ASC, createdAt DESC',
    [playerId]
  );
  return (rows as any[]).map(mapReminderRow);
}

// ---------------------------------------------------------------------------
// Validation (shared by create + edit)
// ---------------------------------------------------------------------------

export interface ReminderInput {
  title: string;
  body: string | null;
  frequency: Frequency;
  timeMinutes: number;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  onceDate: string | null;
}

/** Parse + validate an incoming reminder payload. `todayKey` is the creator's
 *  local date, used to reject one-off reminders set in the past. */
export function validateReminderInput(
  body: any,
  todayKey: string
): { ok: true; value: ReminderInput } | { ok: false; error: string } {
  const title = String(body?.title ?? '').trim();
  if (!title) return { ok: false, error: 'Give the reminder a title' };
  if (title.length > 100) return { ok: false, error: 'Title is too long (max 100 characters)' };

  const rawBody = body?.body != null ? String(body.body).trim() : '';
  if (rawBody.length > 500) return { ok: false, error: 'Message is too long (max 500 characters)' };
  const message = rawBody || null;

  const frequency = String(body?.frequency ?? '') as Frequency;
  if (!FREQUENCIES.includes(frequency)) return { ok: false, error: 'Pick a valid frequency' };

  const timeMinutes = Number(body?.timeMinutes);
  if (!Number.isInteger(timeMinutes) || timeMinutes < 0 || timeMinutes > 1439) {
    return { ok: false, error: 'Pick a valid time of day' };
  }

  let daysOfWeek: number[] = [];
  let dayOfMonth: number | null = null;
  let onceDate: string | null = null;

  if (frequency === 'weekly') {
    const raw: any[] = Array.isArray(body?.daysOfWeek) ? body.daysOfWeek : [];
    const nums = raw.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    daysOfWeek = [...new Set<number>(nums)].sort((a, b) => a - b);
    if (daysOfWeek.length === 0) return { ok: false, error: 'Pick at least one weekday' };
  } else if (frequency === 'monthly') {
    dayOfMonth = Number(body?.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return { ok: false, error: 'Pick a day of the month (1–31)' };
    }
  } else if (frequency === 'once') {
    onceDate = String(body?.onceDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(onceDate)) return { ok: false, error: 'Pick a date' };
    if (onceDate < todayKey) return { ok: false, error: 'That date is in the past' };
  }

  return { ok: true, value: { title, body: message, frequency, timeMinutes, daysOfWeek, dayOfMonth, onceDate } };
}

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------

async function logFire(r: Reminder): Promise<void> {
  await query(
    'INSERT INTO ReminderFire (id, reminderId, playerId, title, body, firedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid(), r.id, r.playerId, r.title, r.body, new Date().toISOString()]
  );
}

/**
 * Fire every reminder that's due right now (and hasn't already fired for
 * today's occurrence). Safe to call as often as you like — dedup by
 * lastFiredKey guarantees at most one fire per matching local day.
 */
export async function runDueReminders(now: Date = new Date()): Promise<{ checked: number; fired: number }> {
  await ensureReminderTables();

  const rows = await queryAll('SELECT * FROM Reminder WHERE enabled = 1');
  if (rows.length === 0) return { checked: 0, fired: 0 };

  // Timezone per owner (missing column / null → default).
  let tzById = new Map<string, string>();
  try {
    const tzRows = await queryAll('SELECT id, timezone FROM Player');
    tzById = new Map(
      (tzRows as any[]).map((r) => [String(r.id), r.timezone ? String(r.timezone) : DEFAULT_TIMEZONE])
    );
  } catch {
    /* no timezone column yet — everyone defaults */
  }

  let fired = 0;
  for (const row of rows as any[]) {
    const r = mapReminderRow(row);
    const tz = tzById.get(r.playerId) || DEFAULT_TIMEZONE;
    const p = localNowParts(tz, now);
    if (!isDue(r, p)) continue;
    if (String(row.lastFiredKey ?? '') === p.dateKey) continue; // already fired this occurrence

    firePush([r.playerId], {
      title: `⏰ ${r.title}`,
      body: r.body || 'You asked to be reminded.',
      url: '/reminders',
      tag: `reminder-${r.id}`,
    });

    try {
      await logFire(r);
    } catch (e) {
      console.error('Reminder fire log failed (continuing):', e);
    }

    const nowIso = new Date().toISOString();
    if (r.frequency === 'once') {
      // One-offs auto-complete so they never fire again.
      await query('UPDATE Reminder SET enabled = 0, lastFiredKey = ?, updatedAt = ? WHERE id = ?', [
        p.dateKey,
        nowIso,
        r.id,
      ]);
    } else {
      await query('UPDATE Reminder SET lastFiredKey = ?, updatedAt = ? WHERE id = ?', [p.dateKey, nowIso, r.id]);
    }
    fired++;
  }

  return { checked: rows.length, fired };
}

export interface ReminderFire {
  id: string;
  reminderId: string;
  title: string;
  body: string | null;
  firedAt: string;
}

/** Reminder fires delivered TO this player, newest first (for the feed). */
export async function getReminderFiresFor(playerId: string, limit = 20): Promise<ReminderFire[]> {
  await ensureReminderTables();
  const rows = await queryAll(
    `SELECT id, reminderId, title, body, firedAt FROM ReminderFire
     WHERE playerId = ? ORDER BY firedAt DESC LIMIT ${Number(limit)}`,
    [playerId]
  );
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    reminderId: String(r.reminderId),
    title: String(r.title),
    body: r.body != null ? String(r.body) : null,
    firedAt: String(r.firedAt),
  }));
}

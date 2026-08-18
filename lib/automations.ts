import { query, queryOne, queryAll } from './db';
import { announceStatMilestones } from './milestones';
import { getStatTier } from './categories';
import { sendPushToPlayers } from './push';
import { afterStatChange } from './statsWrite';
import { v4 as uuid } from 'uuid';
import { ensureOnce } from './ensureOnce';

/**
 * Automatic stat changes — standing rules that move stats on a schedule.
 *
 * The model is *entitlement*, not task: a rule exists globally, and players are
 * added to it as qualifiers. While you qualify, the rule's deltas land on your
 * stats every cycle; when you're removed you keep everything already earned and
 * simply stop receiving new cycles. That's why the crew-facing language is
 * "you now qualify for X" / "you are disqualified from X" rather than anything
 * about jobs or timers.
 *
 * Deliberate choices, all of them asked for:
 * - **Applies directly, no vote.** Approving the rule *is* the approval; making
 *   the crew re-vote the same recurring change every week is busywork. Each
 *   application lands in StatHistory with `source = 'automation'`, so it's
 *   still fully auditable next to suggestion- and review-sourced changes.
 * - **Never catches up.** At most one cycle fires per player per run, and the
 *   next slot is computed from *now*, not from the slot that was missed. A rule
 *   paused for three weeks resumes at its next natural slot instead of dumping
 *   three weeks of points at once — which also makes a cron outage harmless.
 * - **Removal is not a clawback.** Disqualifying stops future cycles and leaves
 *   history alone.
 *
 * Scheduling granularity is one calendar day (slots are 00:00 UTC), which is
 * exactly what the existing daily Vercel cron can deliver without the external
 * pinger that sub-daily reminders would need.
 */

export const ALLOWED_DELTAS = [-2, -1, 1, 2] as const;

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'interval';
export type AutomationStatus = 'active' | 'paused';
export type QualifierStatus = 'active' | 'removed';
export type RequestKind = 'join' | 'new';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface AutomationStatRow {
  statId: string;
  statLabel: string;
  categoryId: string | null;
  delta: number;
}

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  cadence: Cadence;
  intervalDays: number | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  startImmediately: boolean;
  status: AutomationStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  stats: AutomationStatRow[];
  qualifiers: Qualifier[];
}

export interface Qualifier {
  id: string;
  automationId: string;
  playerId: string;
  username: string;
  status: QualifierStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  qualifiedAt: string;
  removedAt: string | null;
}

export interface AutomationRequest {
  id: string;
  kind: RequestKind;
  automationId: string | null;
  automationName: string | null;
  playerId: string;
  playerName: string;
  requestedById: string;
  requestedByName: string;
  reason: string | null;
  payload: NewRuleDraft | null;
  status: RequestStatus;
  decidedById: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface NewRuleDraft {
  name: string;
  description?: string | null;
  cadence: Cadence;
  intervalDays?: number | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
  startImmediately?: boolean;
  stats: { statId: string; delta: number }[];
}

export interface AppliedChange {
  statId: string;
  statLabel: string;
  delta: number;
  oldValue: number;
  newValue: number;
  rankedUp: boolean;
  newTierName: string;
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

/** Additive tables — created on first use, no manual migration. */
export async function ensureAutomationTables(): Promise<void> {
  return ensureOnce('automations', ensureAutomationTablesUncached);
}

async function ensureAutomationTablesUncached(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS Automation (
       id               TEXT PRIMARY KEY,
       name             TEXT NOT NULL,
       description      TEXT,
       cadence          TEXT NOT NULL,
       intervalDays     INTEGER,
       dayOfWeek        INTEGER,
       dayOfMonth       INTEGER,
       startDate        TEXT NOT NULL,
       endDate          TEXT,
       startImmediately INTEGER NOT NULL DEFAULT 0,
       status           TEXT NOT NULL DEFAULT 'active',
       createdById      TEXT NOT NULL,
       createdAt        TEXT NOT NULL,
       updatedAt        TEXT NOT NULL
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS AutomationStat (
       automationId TEXT NOT NULL,
       statId       TEXT NOT NULL,
       delta        INTEGER NOT NULL,
       PRIMARY KEY (automationId, statId)
     )`
  );
  // nextRunAt is per-qualifier, not per-rule: people join at different times and
  // each waits their own full interval from the moment they qualified.
  await query(
    `CREATE TABLE IF NOT EXISTS AutomationQualifier (
       id           TEXT PRIMARY KEY,
       automationId TEXT NOT NULL,
       playerId     TEXT NOT NULL,
       status       TEXT NOT NULL DEFAULT 'active',
       nextRunAt    TEXT,
       lastRunAt    TEXT,
       runCount     INTEGER NOT NULL DEFAULT 0,
       qualifiedAt  TEXT NOT NULL,
       removedAt    TEXT,
       UNIQUE(automationId, playerId)
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS AutomationRequest (
       id            TEXT PRIMARY KEY,
       kind          TEXT NOT NULL,
       automationId  TEXT,
       playerId      TEXT NOT NULL,
       requestedById TEXT NOT NULL,
       reason        TEXT,
       payload       TEXT,
       status        TEXT NOT NULL DEFAULT 'pending',
       decidedById   TEXT,
       decidedAt     TEXT,
       decisionNote  TEXT,
       createdAt     TEXT NOT NULL
     )`
  );
  // One row per firing. Powers "last fired" in the UI and is the audit trail for
  // what a rule has actually handed out.
  await query(
    `CREATE TABLE IF NOT EXISTS AutomationRun (
       id           TEXT PRIMARY KEY,
       automationId TEXT NOT NULL,
       playerId     TEXT NOT NULL,
       ranAt        TEXT NOT NULL,
       changes      TEXT NOT NULL
     )`
  );
}

/* ------------------------------------------------------------------ */
/* Cadence arithmetic                                                  */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/** Midnight UTC of the day containing `value`. Slots always land on a day boundary. */
function startOfUtcDay(value: string | Date): Date {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isValidCadence(c: unknown): c is Cadence {
  return c === 'daily' || c === 'weekly' || c === 'monthly' || c === 'interval';
}

/**
 * The first slot strictly after `after`, honouring the rule's start/end dates.
 * `null` means the rule has run out of road — its end date has passed.
 *
 * Callers pass `after = now` (never the missed slot), which is what makes a
 * resumed or long-unrun rule pick up at its next natural slot instead of
 * replaying everything it missed.
 */
export function nextRunAfter(
  rule: Pick<Automation, 'cadence' | 'intervalDays' | 'dayOfWeek' | 'dayOfMonth' | 'startDate' | 'endDate'>,
  after: string | Date
): string | null {
  const start = startOfUtcDay(rule.startDate);
  // The day after `after`, but never earlier than the rule's start date — so a
  // rule starting next month first fires next month, not tomorrow.
  let candidate = new Date(Math.max(startOfUtcDay(after).getTime() + DAY_MS, start.getTime()));

  switch (rule.cadence) {
    case 'daily':
      break;

    case 'interval': {
      const n = Math.max(1, Number(rule.intervalDays) || 1);
      const spanDays = Math.ceil((candidate.getTime() - start.getTime()) / (n * DAY_MS));
      candidate = new Date(start.getTime() + Math.max(0, spanDays) * n * DAY_MS);
      break;
    }

    case 'weekly': {
      const target = Number(rule.dayOfWeek) || 0;
      // At most 6 hops — the loop can't fail to find a matching weekday.
      for (let i = 0; i < 7 && candidate.getUTCDay() !== target; i++) {
        candidate = new Date(candidate.getTime() + DAY_MS);
      }
      break;
    }

    case 'monthly': {
      // dayOfMonth is capped at 28 on input, so every month contains it and
      // this always terminates — no February special-casing needed.
      const target = Math.min(28, Math.max(1, Number(rule.dayOfMonth) || 1));
      for (let i = 0; i < 62 && candidate.getUTCDate() !== target; i++) {
        candidate = new Date(candidate.getTime() + DAY_MS);
      }
      break;
    }
  }

  if (rule.endDate && candidate.getTime() > startOfUtcDay(rule.endDate).getTime()) return null;
  return candidate.toISOString();
}

/** Human-readable cadence, e.g. "every 3 days", "weekly on Monday". */
export function describeCadence(
  rule: Pick<Automation, 'cadence' | 'intervalDays' | 'dayOfWeek' | 'dayOfMonth'>
): string {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  switch (rule.cadence) {
    case 'daily':
      return 'every day';
    case 'weekly':
      return `weekly on ${DAYS[Number(rule.dayOfWeek) || 0]}`;
    case 'monthly': {
      const d = Math.min(28, Math.max(1, Number(rule.dayOfMonth) || 1));
      const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
      return `monthly on the ${d}${suffix}`;
    }
    case 'interval': {
      const n = Math.max(1, Number(rule.intervalDays) || 1);
      return n === 1 ? 'every day' : `every ${n} days`;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

function mapAutomation(row: any, stats: AutomationStatRow[], qualifiers: Qualifier[]): Automation {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    cadence: String(row.cadence) as Cadence,
    intervalDays: row.intervalDays == null ? null : Number(row.intervalDays),
    dayOfWeek: row.dayOfWeek == null ? null : Number(row.dayOfWeek),
    dayOfMonth: row.dayOfMonth == null ? null : Number(row.dayOfMonth),
    startDate: String(row.startDate),
    endDate: row.endDate ? String(row.endDate) : null,
    startImmediately: Boolean(Number(row.startImmediately)),
    status: String(row.status) as AutomationStatus,
    createdById: String(row.createdById),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    stats,
    qualifiers,
  };
}

/** Every rule, with its stats and qualifiers attached. Three queries, not N+1. */
export async function listAutomations(): Promise<Automation[]> {
  await ensureAutomationTables();

  const [rules, statRows, qualifierRows] = await Promise.all([
    queryAll('SELECT * FROM Automation ORDER BY createdAt DESC'),
    queryAll(
      `SELECT a.automationId, a.statId, a.delta, s.label, s.categoryId
       FROM AutomationStat a LEFT JOIN Stat s ON a.statId = s.id`
    ),
    queryAll(
      `SELECT q.*, p.username
       FROM AutomationQualifier q LEFT JOIN Player p ON q.playerId = p.id
       ORDER BY p.username ASC`
    ),
  ]);

  const statsByRule = new Map<string, AutomationStatRow[]>();
  for (const r of statRows as any[]) {
    // A stat deleted from the catalog takes its AutomationStat row with it, so a
    // null label here means the row outlived its stat — skip rather than render
    // a blank line.
    if (!r.label) continue;
    const list = statsByRule.get(String(r.automationId)) ?? [];
    list.push({
      statId: String(r.statId),
      statLabel: String(r.label),
      categoryId: r.categoryId ? String(r.categoryId) : null,
      delta: Number(r.delta),
    });
    statsByRule.set(String(r.automationId), list);
  }

  const qualifiersByRule = new Map<string, Qualifier[]>();
  for (const q of qualifierRows as any[]) {
    const list = qualifiersByRule.get(String(q.automationId)) ?? [];
    list.push({
      id: String(q.id),
      automationId: String(q.automationId),
      playerId: String(q.playerId),
      username: q.username ? String(q.username) : 'Unknown',
      status: String(q.status) as QualifierStatus,
      nextRunAt: q.nextRunAt ? String(q.nextRunAt) : null,
      lastRunAt: q.lastRunAt ? String(q.lastRunAt) : null,
      runCount: Number(q.runCount) || 0,
      qualifiedAt: String(q.qualifiedAt),
      removedAt: q.removedAt ? String(q.removedAt) : null,
    });
    qualifiersByRule.set(String(q.automationId), list);
  }

  return (rules as any[]).map((r) =>
    mapAutomation(r, statsByRule.get(String(r.id)) ?? [], qualifiersByRule.get(String(r.id)) ?? [])
  );
}

export async function getAutomation(id: string): Promise<Automation | null> {
  const all = await listAutomations();
  return all.find((a) => a.id === id) ?? null;
}

/** Pending first, then most recently decided. */
export async function listRequests(): Promise<AutomationRequest[]> {
  await ensureAutomationTables();
  const rows = await queryAll(
    `SELECT r.*, a.name AS automationName, p.username AS playerName, rb.username AS requestedByName
     FROM AutomationRequest r
     LEFT JOIN Automation a ON r.automationId = a.id
     LEFT JOIN Player p     ON r.playerId = p.id
     LEFT JOIN Player rb    ON r.requestedById = rb.id
     ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.createdAt DESC`
  );

  return (rows as any[]).map((r) => {
    let payload: NewRuleDraft | null = null;
    if (r.payload) {
      try {
        payload = JSON.parse(String(r.payload));
      } catch {
        payload = null;
      }
    }
    return {
      id: String(r.id),
      kind: String(r.kind) as RequestKind,
      automationId: r.automationId ? String(r.automationId) : null,
      automationName: r.automationName ? String(r.automationName) : null,
      playerId: String(r.playerId),
      playerName: r.playerName ? String(r.playerName) : 'Unknown',
      requestedById: String(r.requestedById),
      requestedByName: r.requestedByName ? String(r.requestedByName) : 'Unknown',
      reason: r.reason ? String(r.reason) : null,
      payload,
      status: String(r.status) as RequestStatus,
      decidedById: r.decidedById ? String(r.decidedById) : null,
      decidedAt: r.decidedAt ? String(r.decidedAt) : null,
      decisionNote: r.decisionNote ? String(r.decisionNote) : null,
      createdAt: String(r.createdAt),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Writing — rules                                                     */
/* ------------------------------------------------------------------ */

/** Normalise + validate a draft. Returns an error string, or null when valid. */
export function validateDraft(draft: Partial<NewRuleDraft>): string | null {
  if (!draft.name?.trim()) return 'Name is required';
  if (!isValidCadence(draft.cadence)) return 'Pick a valid cadence';
  if (!draft.startDate) return 'Start date is required';
  if (Number.isNaN(new Date(draft.startDate).getTime())) return 'Start date is invalid';
  if (draft.endDate) {
    if (Number.isNaN(new Date(draft.endDate).getTime())) return 'End date is invalid';
    if (startOfUtcDay(draft.endDate) < startOfUtcDay(draft.startDate)) {
      return 'End date is before the start date';
    }
  }
  if (draft.cadence === 'interval') {
    const n = Number(draft.intervalDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) return 'Interval must be 1–365 days';
  }
  if (draft.cadence === 'weekly') {
    const d = Number(draft.dayOfWeek);
    if (!Number.isInteger(d) || d < 0 || d > 6) return 'Pick a day of the week';
  }
  if (draft.cadence === 'monthly') {
    const d = Number(draft.dayOfMonth);
    // Capped at 28 so every month has the day — no "31st of February" holes.
    if (!Number.isInteger(d) || d < 1 || d > 28) return 'Day of month must be 1–28';
  }
  if (!Array.isArray(draft.stats) || draft.stats.length === 0) return 'Pick at least one stat';
  const seen = new Set<string>();
  for (const s of draft.stats) {
    if (!s?.statId) return 'A stat is missing';
    if (seen.has(s.statId)) return 'The same stat is listed twice';
    seen.add(s.statId);
    if (!ALLOWED_DELTAS.includes(Number(s.delta) as any)) return 'Each change must be ±1 or ±2';
  }
  return null;
}

export async function createAutomation(draft: NewRuleDraft, createdById: string): Promise<string> {
  await ensureAutomationTables();
  const now = new Date().toISOString();
  const id = uuid();

  await query(
    `INSERT INTO Automation
       (id, name, description, cadence, intervalDays, dayOfWeek, dayOfMonth,
        startDate, endDate, startImmediately, status, createdById, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [
      id,
      draft.name.trim(),
      draft.description?.trim() || null,
      draft.cadence,
      draft.cadence === 'interval' ? Number(draft.intervalDays) : null,
      draft.cadence === 'weekly' ? Number(draft.dayOfWeek) : null,
      draft.cadence === 'monthly' ? Number(draft.dayOfMonth) : null,
      draft.startDate,
      draft.endDate || null,
      draft.startImmediately ? 1 : 0,
      createdById,
      now,
      now,
    ]
  );

  for (const s of draft.stats) {
    await query('INSERT INTO AutomationStat (automationId, statId, delta) VALUES (?, ?, ?)', [
      id,
      s.statId,
      Number(s.delta),
    ]);
  }

  return id;
}

export async function updateAutomation(id: string, draft: NewRuleDraft): Promise<void> {
  await ensureAutomationTables();
  const now = new Date().toISOString();

  await query(
    `UPDATE Automation SET name = ?, description = ?, cadence = ?, intervalDays = ?,
       dayOfWeek = ?, dayOfMonth = ?, startDate = ?, endDate = ?, startImmediately = ?, updatedAt = ?
     WHERE id = ?`,
    [
      draft.name.trim(),
      draft.description?.trim() || null,
      draft.cadence,
      draft.cadence === 'interval' ? Number(draft.intervalDays) : null,
      draft.cadence === 'weekly' ? Number(draft.dayOfWeek) : null,
      draft.cadence === 'monthly' ? Number(draft.dayOfMonth) : null,
      draft.startDate,
      draft.endDate || null,
      draft.startImmediately ? 1 : 0,
      now,
      id,
    ]
  );

  await query('DELETE FROM AutomationStat WHERE automationId = ?', [id]);
  for (const s of draft.stats) {
    await query('INSERT INTO AutomationStat (automationId, statId, delta) VALUES (?, ?, ?)', [
      id,
      s.statId,
      Number(s.delta),
    ]);
  }

  // The schedule may have moved under everyone's feet, so re-seat every active
  // qualifier on the new cadence rather than leaving them on stale slots.
  const rule = await getAutomation(id);
  if (rule) {
    const next = nextRunAfter(rule, new Date());
    await query(
      "UPDATE AutomationQualifier SET nextRunAt = ? WHERE automationId = ? AND status = 'active'",
      [next, id]
    );
  }
}

export async function setAutomationStatus(id: string, status: AutomationStatus): Promise<void> {
  await ensureAutomationTables();
  const now = new Date().toISOString();
  await query('UPDATE Automation SET status = ?, updatedAt = ? WHERE id = ?', [status, now, id]);

  if (status === 'active') {
    // Resuming skips whatever was missed: everyone is re-seated at the next slot
    // from now, so nobody is handed a backlog of cycles for a paused period.
    const rule = await getAutomation(id);
    if (rule) {
      const next = nextRunAfter(rule, new Date());
      await query(
        "UPDATE AutomationQualifier SET nextRunAt = ? WHERE automationId = ? AND status = 'active'",
        [next, id]
      );
    }
  }
}

/** Deleting a rule stops it everywhere. Applied history is deliberately kept. */
export async function deleteAutomation(id: string): Promise<string[]> {
  await ensureAutomationTables();
  const affected = (
    await queryAll(
      "SELECT playerId FROM AutomationQualifier WHERE automationId = ? AND status = 'active'",
      [id]
    )
  ).map((r: any) => String(r.playerId));

  await query('DELETE FROM AutomationStat WHERE automationId = ?', [id]);
  await query('DELETE FROM AutomationQualifier WHERE automationId = ?', [id]);
  await query('DELETE FROM AutomationRun WHERE automationId = ?', [id]);
  await query("UPDATE AutomationRequest SET status = 'rejected' WHERE automationId = ? AND status = 'pending'", [id]);
  await query('DELETE FROM Automation WHERE id = ?', [id]);

  return affected;
}

/* ------------------------------------------------------------------ */
/* Writing — qualifiers                                                */
/* ------------------------------------------------------------------ */

/**
 * Add a player to a rule. When the rule is marked "start immediately" the first
 * cycle is applied right now, so the "you now qualify" push arrives with a
 * visible result attached rather than a promise about next week.
 */
export async function addQualifier(
  automationId: string,
  playerId: string
): Promise<{ applied: AppliedChange[]; alreadyQualified: boolean }> {
  await ensureAutomationTables();
  const rule = await getAutomation(automationId);
  if (!rule) throw new Error('Automation not found');

  const now = new Date();
  const nowIso = now.toISOString();

  const existing = await queryOne(
    'SELECT id, status FROM AutomationQualifier WHERE automationId = ? AND playerId = ?',
    [automationId, playerId]
  );
  if (existing && String(existing.status) === 'active') {
    return { applied: [], alreadyQualified: true };
  }

  let applied: AppliedChange[] = [];
  if (rule.startImmediately) {
    applied = await applyRuleToPlayer(rule, playerId, nowIso);
  }

  const next = nextRunAfter(rule, now);

  if (existing) {
    // Re-qualifying resets the clock but keeps the historical run count.
    await query(
      `UPDATE AutomationQualifier
       SET status = 'active', qualifiedAt = ?, removedAt = NULL, nextRunAt = ?,
           lastRunAt = CASE WHEN ? = 1 THEN ? ELSE lastRunAt END,
           runCount = runCount + ?
       WHERE id = ?`,
      [nowIso, next, applied.length > 0 ? 1 : 0, nowIso, applied.length > 0 ? 1 : 0, String(existing.id)]
    );
  } else {
    await query(
      `INSERT INTO AutomationQualifier
         (id, automationId, playerId, status, nextRunAt, lastRunAt, runCount, qualifiedAt, removedAt)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, NULL)`,
      [uuid(), automationId, playerId, next, applied.length > 0 ? nowIso : null, applied.length > 0 ? 1 : 0, nowIso]
    );
  }

  if (applied.length > 0) await recordRun(automationId, playerId, nowIso, applied);
  await notifyQualified(playerId, rule, applied);

  return { applied, alreadyQualified: false };
}

/** Stop future cycles. Everything already applied stays exactly as it is. */
export async function removeQualifier(automationId: string, playerId: string): Promise<void> {
  await ensureAutomationTables();
  const now = new Date().toISOString();
  await query(
    `UPDATE AutomationQualifier SET status = 'removed', removedAt = ?, nextRunAt = NULL
     WHERE automationId = ? AND playerId = ?`,
    [now, automationId, playerId]
  );

  const rule = await getAutomation(automationId);
  if (rule) await notifyDisqualified(playerId, rule);
}

/* ------------------------------------------------------------------ */
/* Writing — requests                                                  */
/* ------------------------------------------------------------------ */

export async function createRequest(params: {
  kind: RequestKind;
  automationId?: string | null;
  playerId: string;
  requestedById: string;
  reason?: string | null;
  payload?: NewRuleDraft | null;
}): Promise<string> {
  await ensureAutomationTables();
  const id = uuid();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO AutomationRequest
       (id, kind, automationId, playerId, requestedById, reason, payload, status, decidedById, decidedAt, decisionNote, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?)`,
    [
      id,
      params.kind,
      params.automationId || null,
      params.playerId,
      params.requestedById,
      params.reason?.trim() || null,
      params.payload ? JSON.stringify(params.payload) : null,
      now,
    ]
  );

  await notifyAdminsOfRequest(params.requestedById, params.kind);
  return id;
}

/**
 * Approve or reject. Approving a `join` adds the qualifier; approving a `new`
 * creates the rule and qualifies whoever it was requested for.
 *
 * `decidedById` becomes the new rule's owner so `StatHistory.changedById` always
 * points at a real player — the admin who allowed it, not the requester.
 */
export async function decideRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  decidedById: string,
  note?: string | null
): Promise<{ automationId: string | null }> {
  await ensureAutomationTables();
  const row = await queryOne('SELECT * FROM AutomationRequest WHERE id = ?', [requestId]);
  if (!row) throw new Error('Request not found');
  if (String(row.status) !== 'pending') throw new Error('That request has already been decided');

  const now = new Date().toISOString();
  let automationId: string | null = row.automationId ? String(row.automationId) : null;

  if (decision === 'approved') {
    if (String(row.kind) === 'new') {
      let draft: NewRuleDraft | null = null;
      try {
        draft = JSON.parse(String(row.payload));
      } catch {
        throw new Error('That request is missing a readable rule draft');
      }
      const invalid = draft ? validateDraft(draft) : 'Draft is empty';
      if (invalid || !draft) throw new Error(invalid || 'Draft is empty');

      automationId = await createAutomation(draft, decidedById);
    }
    if (!automationId) throw new Error('That request has no rule attached');
    await addQualifier(automationId, String(row.playerId));
  }

  await query(
    'UPDATE AutomationRequest SET status = ?, decidedById = ?, decidedAt = ?, decisionNote = ?, automationId = ? WHERE id = ?',
    [decision, decidedById, now, note?.trim() || null, automationId, requestId]
  );

  await notifyRequestDecision(String(row.requestedById), String(row.kind) as RequestKind, decision, automationId);
  return { automationId };
}

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

/**
 * Write one cycle of a rule onto one player's stats.
 *
 * Mirrors the suggestion engine's application (lazy StatValue at 5, floored at
 * 0, unbounded above) so an automatic change is indistinguishable from any
 * other in history apart from `source = 'automation'`.
 */
async function applyRuleToPlayer(
  rule: Automation,
  playerId: string,
  now: string
): Promise<AppliedChange[]> {
  const applied: AppliedChange[] = [];

  for (const stat of rule.stats) {
    let statValue = await queryOne('SELECT id, value FROM StatValue WHERE statId = ? AND playerId = ?', [
      stat.statId,
      playerId,
    ]);
    if (!statValue) {
      const svId = uuid();
      await query(
        'INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt) VALUES (?, ?, ?, 5, ?, ?)',
        [svId, stat.statId, playerId, now, now]
      );
      statValue = { id: svId, value: 5 } as any;
    }

    const oldValue = Number(statValue!.value);
    const newValue = Math.max(0, oldValue + stat.delta);

    await query('UPDATE StatValue SET value = ?, updatedAt = ? WHERE id = ?', [
      newValue,
      now,
      String(statValue!.id),
    ]);
    await query(
      `INSERT INTO StatHistory (id, statValueId, oldValue, newValue, reason, changedById, source, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'automation', ?)`,
      [uuid(), String(statValue!.id), oldValue, newValue, `${rule.name} (automatic)`, rule.createdById, now]
    );

    const oldTier = getStatTier(oldValue);
    const newTier = getStatTier(newValue);
    applied.push({
      statId: stat.statId,
      statLabel: stat.statLabel,
      delta: stat.delta,
      oldValue,
      newValue,
      rankedUp: newValue > oldValue && newTier.name !== oldTier.name,
      newTierName: newTier.name,
    });

    // Never let a celebration failure undo an applied stat change.
    try {
      await announceStatMilestones({ playerId, statId: stat.statId, oldValue, newValue, delta: stat.delta });
    } catch (e) {
      console.error('Automation milestone announcement failed (change still applied):', e);
    }
  }

  if (applied.length > 0) await afterStatChange();
  return applied;
}

async function recordRun(
  automationId: string,
  playerId: string,
  ranAt: string,
  changes: AppliedChange[]
): Promise<void> {
  await query('INSERT INTO AutomationRun (id, automationId, playerId, ranAt, changes) VALUES (?, ?, ?, ?, ?)', [
    uuid(),
    automationId,
    playerId,
    ranAt,
    JSON.stringify(changes),
  ]);
}

/**
 * Fire every cycle that is due. The cron entry point.
 *
 * At most ONE cycle per qualifier per invocation, and the next slot is computed
 * from now — so a cron that missed a week resumes cleanly instead of paying out
 * a week of arrears.
 */
export async function runDueAutomations(): Promise<{ fired: number; players: number; rules: number }> {
  await ensureAutomationTables();
  const now = new Date();
  const nowIso = now.toISOString();

  const due = await queryAll(
    `SELECT q.id AS qualifierId, q.automationId, q.playerId
     FROM AutomationQualifier q
     JOIN Automation a ON q.automationId = a.id
     JOIN Player p     ON q.playerId = p.id
     WHERE q.status = 'active'
       AND a.status = 'active'
       AND p.active = 1
       AND q.nextRunAt IS NOT NULL
       AND q.nextRunAt <= ?`,
    [nowIso]
  );

  let fired = 0;
  const players = new Set<string>();
  const rules = new Set<string>();
  // Rules are re-read per due row but cached here — a crew-wide rule would
  // otherwise reload its stats and qualifiers once per player.
  const ruleCache = new Map<string, Automation | null>();

  for (const row of due as any[]) {
    const automationId = String(row.automationId);
    const playerId = String(row.playerId);

    if (!ruleCache.has(automationId)) ruleCache.set(automationId, await getAutomation(automationId));
    const rule = ruleCache.get(automationId);
    if (!rule || rule.stats.length === 0) continue;

    try {
      const applied = await applyRuleToPlayer(rule, playerId, nowIso);
      const next = nextRunAfter(rule, now);

      await query(
        'UPDATE AutomationQualifier SET lastRunAt = ?, runCount = runCount + 1, nextRunAt = ? WHERE id = ?',
        [nowIso, next, String(row.qualifierId)]
      );

      if (applied.length > 0) {
        await recordRun(automationId, playerId, nowIso, applied);
        await notifyApplied(playerId, rule, applied);
        fired++;
        players.add(playerId);
        rules.add(automationId);
      }
    } catch (e) {
      // One player's failure must not stop the rest of the run.
      console.error(`Automation ${automationId} failed for player ${playerId}:`, e);
    }
  }

  return { fired, players: players.size, rules: rules.size };
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

/** Pushes are awaited, never fire-and-forget: a serverless function that
 *  returns first takes the unsent push down with it. */

function summarise(changes: AppliedChange[]): string {
  return changes.map((c) => `${c.delta > 0 ? '+' : ''}${c.delta} ${c.statLabel}`).join(', ');
}

async function adminPlayerIds(): Promise<string[]> {
  const rows = await queryAll(
    'SELECT playerId FROM User WHERE isAdmin = 1 AND playerId IS NOT NULL'
  );
  return (rows as any[]).map((r) => String(r.playerId)).filter(Boolean);
}

async function notifyQualified(playerId: string, rule: Automation, applied: AppliedChange[]): Promise<void> {
  try {
    const deltas = rule.stats.map((s) => `${s.delta > 0 ? '+' : ''}${s.delta} ${s.statLabel}`).join(', ');
    await sendPushToPlayers([playerId], {
      title: `✅ You now qualify for ${rule.name}`,
      body:
        applied.length > 0
          ? `${summarise(applied)} applied now, then ${describeCadence(rule)}.`
          : `${deltas} — ${describeCadence(rule)}.`,
      url: '/automations',
      tag: `automation-qualify-${rule.id}`,
    });
  } catch (e) {
    console.error('Qualify push failed (ignored):', e);
  }
}

async function notifyDisqualified(playerId: string, rule: Automation): Promise<void> {
  try {
    await sendPushToPlayers([playerId], {
      title: `You're disqualified from ${rule.name}`,
      body: 'No further automatic changes from this one. Everything it already gave you stands.',
      url: '/automations',
      tag: `automation-disqualify-${rule.id}`,
    });
  } catch (e) {
    console.error('Disqualify push failed (ignored):', e);
  }
}

async function notifyApplied(playerId: string, rule: Automation, applied: AppliedChange[]): Promise<void> {
  try {
    await sendPushToPlayers([playerId], {
      title: `${rule.name} — ${summarise(applied)}`,
      body:
        applied.length === 1
          ? `${applied[0].statLabel}: ${applied[0].oldValue} → ${applied[0].newValue} pts, automatically.`
          : `${applied.length} stats updated automatically.`,
      url: `/players/${playerId}`,
      tag: `automation-run-${rule.id}`,
    });

    for (const c of applied.filter((c) => c.rankedUp)) {
      await sendPushToPlayers([playerId], {
        title: `🏆 ${c.newTierName}!`,
        body: `${c.statLabel} reached ${c.newTierName} — now ${c.newValue} pts.`,
        url: `/players/${playerId}`,
        tag: `tier-${c.statId}`,
      });
    }
  } catch (e) {
    console.error('Automation run push failed (ignored):', e);
  }
}

async function notifyAdminsOfRequest(requestedById: string, kind: RequestKind): Promise<void> {
  try {
    const admins = (await adminPlayerIds()).filter((id) => id !== requestedById);
    if (admins.length === 0) return;
    const who = await queryOne('SELECT username FROM Player WHERE id = ?', [requestedById]);
    const name = who ? String(who.username) : 'Someone';
    await sendPushToPlayers(admins, {
      title: '🔔 Automation request',
      body:
        kind === 'new'
          ? `${name} proposed a new automatic stat rule.`
          : `${name} asked to qualify for an automatic stat.`,
      url: '/automations',
      tag: 'automation-request',
    });
  } catch (e) {
    console.error('Admin request push failed (ignored):', e);
  }
}

async function notifyRequestDecision(
  requestedById: string,
  kind: RequestKind,
  decision: 'approved' | 'rejected',
  automationId: string | null
): Promise<void> {
  try {
    let name = 'an automatic stat';
    if (automationId) {
      const rule = await queryOne('SELECT name FROM Automation WHERE id = ?', [automationId]);
      if (rule) name = String(rule.name);
    }
    await sendPushToPlayers([requestedById], {
      title: decision === 'approved' ? '✅ Automation request approved' : 'Automation request declined',
      body:
        decision === 'approved'
          ? kind === 'new'
            ? `Your proposed rule "${name}" is live and you qualify for it.`
            : `You now qualify for ${name}.`
          : kind === 'new'
            ? 'Your proposed automatic stat rule was declined.'
            : `Your request to qualify for ${name} was declined.`,
      url: '/automations',
      tag: 'automation-decision',
    });
  } catch (e) {
    console.error('Request decision push failed (ignored):', e);
  }
}

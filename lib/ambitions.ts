import { query, queryAll } from './db';
import { ensureOnce } from './ensureOnce';

/**
 * Ambitions — long-term goals each crew member declares on a shared board.
 * Unlike Targets (pick 3 stats to focus on), an ambition is free text: "run a
 * marathon", "ship the app", "read 24 books". The owner SELF-DECLARES when it's
 * done, which fires a crew-wide dashboard takeover for a day. The reward — a
 * one-off stat boost far past the normal ±2 cap — is a separate suggestion
 * someone else proposes and the crew votes on (points are never self-awarded).
 *
 * Reward linkage rides on Suggestion via an additive `ambitionId` column, so a
 * reward is just a normal suggestion (uncapped delta) that resolves through the
 * existing vote engine. That column is created here on first use.
 */

export const CELEBRATION_WINDOW_HOURS = 24;
/** Anti-typo guard only — the design is "no hard cap", this never binds in practice. */
export const MAX_REWARD_DELTA = 100;

export type AmbitionStatus = 'active' | 'completed' | 'archived';

export interface Ambition {
  id: string;
  playerId: string;
  ownerName: string;
  ownerActive: boolean;
  title: string;
  detail: string | null;
  statId: string | null;
  statLabel: string | null;
  status: AmbitionStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Status of the most recent reward suggestion for this ambition, if any. */
  rewardStatus: 'pending' | 'approved' | 'rejected' | null;
  rewardDelta: number | null;
}

/** Additive tables/columns — created on first use, no manual migration. */
export async function ensureAmbitionTables(): Promise<void> {
  return ensureOnce('ambitions', ensureAmbitionTablesUncached);
}

async function ensureAmbitionTablesUncached(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS Ambition (
       id          TEXT PRIMARY KEY,
       playerId    TEXT NOT NULL,
       title       TEXT NOT NULL,
       detail      TEXT,
       statId      TEXT,
       statLabel   TEXT,
       status      TEXT NOT NULL DEFAULT 'active',
       completedAt TEXT,
       createdAt   TEXT NOT NULL,
       updatedAt   TEXT NOT NULL
     )`
  );
  // Reward suggestions point back at their ambition. Safe if it already exists.
  try {
    await query('ALTER TABLE Suggestion ADD COLUMN ambitionId TEXT');
  } catch {
    /* column already exists */
  }
}

function mapRow(r: any): Ambition {
  return {
    id: String(r.id),
    playerId: String(r.playerId),
    ownerName: String(r.ownerName || 'Unknown'),
    ownerActive: Boolean(Number(r.ownerActive)),
    title: String(r.title),
    detail: r.detail != null ? String(r.detail) : null,
    statId: r.statId != null ? String(r.statId) : null,
    statLabel: r.statLabel != null ? String(r.statLabel) : null,
    status: (String(r.status) as AmbitionStatus) || 'active',
    completedAt: r.completedAt != null ? String(r.completedAt) : null,
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
    rewardStatus: r.rewardStatus != null ? (String(r.rewardStatus) as any) : null,
    rewardDelta: r.rewardDelta != null ? Number(r.rewardDelta) : null,
  };
}

/** The whole board — everyone's ambitions, with owner + latest reward status. */
export async function listAmbitions(): Promise<Ambition[]> {
  await ensureAmbitionTables();
  const rows = await queryAll(
    `SELECT a.id, a.playerId, a.title, a.detail, a.statId, a.statLabel, a.status,
            a.completedAt, a.createdAt, a.updatedAt,
            p.username AS ownerName, p.active AS ownerActive,
            (SELECT s.status FROM Suggestion s WHERE s.ambitionId = a.id ORDER BY s.createdAt DESC LIMIT 1) AS rewardStatus,
            (SELECT s.delta  FROM Suggestion s WHERE s.ambitionId = a.id ORDER BY s.createdAt DESC LIMIT 1) AS rewardDelta
     FROM Ambition a
     JOIN Player p ON a.playerId = p.id
     ORDER BY (a.status = 'active') DESC, COALESCE(a.completedAt, a.updatedAt) DESC`
  );
  return (rows as any[]).map(mapRow);
}

/** Completions still inside the celebration window — powers the takeover. */
export async function getActiveCelebrations(): Promise<Ambition[]> {
  await ensureAmbitionTables();
  const cutoff = new Date(Date.now() - CELEBRATION_WINDOW_HOURS * 3600_000).toISOString();
  const rows = await queryAll(
    `SELECT a.id, a.playerId, a.title, a.detail, a.statId, a.statLabel, a.status,
            a.completedAt, a.createdAt, a.updatedAt,
            p.username AS ownerName, p.active AS ownerActive,
            NULL AS rewardStatus, NULL AS rewardDelta
     FROM Ambition a
     JOIN Player p ON a.playerId = p.id
     WHERE a.status = 'completed' AND a.completedAt > ?
     ORDER BY a.completedAt DESC`,
    [cutoff]
  );
  return (rows as any[]).map(mapRow);
}

/** Recent completions for the notification feed (any age, capped). */
export async function getRecentCompletions(limit = 30): Promise<Ambition[]> {
  await ensureAmbitionTables();
  const rows = await queryAll(
    `SELECT a.id, a.playerId, a.title, a.detail, a.statId, a.statLabel, a.status,
            a.completedAt, a.createdAt, a.updatedAt,
            p.username AS ownerName, p.active AS ownerActive,
            NULL AS rewardStatus, NULL AS rewardDelta
     FROM Ambition a
     JOIN Player p ON a.playerId = p.id
     WHERE a.status = 'completed' AND a.completedAt IS NOT NULL
     ORDER BY a.completedAt DESC LIMIT ${Number(limit)}`
  );
  return (rows as any[]).map(mapRow);
}

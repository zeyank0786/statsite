import { query, queryOne, queryAll } from './db';
import { v4 as uuid } from 'uuid';

/**
 * Nudges — a lightweight poke between crew members ("post some evidence",
 * "you've got votes waiting"). Deliberately low-stakes: no stat effect, no
 * vote, just a push plus an entry in the target's notification feed.
 *
 * Rate limited per sender→target pair so it stays a nudge rather than a
 * weapon.
 */

export const NUDGE_KINDS = [
  {
    key: 'evidence',
    label: 'Post some evidence',
    title: 'nudged you',
    body: 'Where are the receipts? Get something on the evidence board.',
    url: '/evidence',
  },
  {
    key: 'vote',
    label: 'Vote on suggestions',
    title: 'nudged you to vote',
    body: 'There are suggestions waiting on your vote.',
    url: '/suggestions',
  },
  {
    key: 'general',
    label: 'Get moving',
    title: 'nudged you',
    body: 'Consider this your reminder to do something worth posting about.',
    url: '/',
  },
] as const;

export type NudgeKind = (typeof NUDGE_KINDS)[number]['key'];

const KIND_KEYS = new Set<string>(NUDGE_KINDS.map((k) => k.key));
export function isValidNudgeKind(kind: string): kind is NudgeKind {
  return KIND_KEYS.has(kind);
}

/** One nudge per sender→target pair per this many hours. */
export const NUDGE_COOLDOWN_HOURS = 12;

/** Additive table — created on first use, no manual migration. */
export async function ensureNudgeTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS Nudge (
       id           TEXT PRIMARY KEY,
       fromPlayerId TEXT NOT NULL,
       toPlayerId   TEXT NOT NULL,
       kind         TEXT NOT NULL,
       createdAt    TEXT NOT NULL
     )`
  );
}

/** Milliseconds until this sender may nudge this target again (0 = now). */
export async function nudgeCooldownRemaining(fromPlayerId: string, toPlayerId: string): Promise<number> {
  await ensureNudgeTable();
  const last = await queryOne(
    'SELECT createdAt FROM Nudge WHERE fromPlayerId = ? AND toPlayerId = ? ORDER BY createdAt DESC LIMIT 1',
    [fromPlayerId, toPlayerId]
  );
  if (!last) return 0;
  const elapsed = Date.now() - new Date(String(last.createdAt)).getTime();
  const window = NUDGE_COOLDOWN_HOURS * 3600_000;
  return elapsed >= window ? 0 : window - elapsed;
}

export async function recordNudge(fromPlayerId: string, toPlayerId: string, kind: NudgeKind): Promise<void> {
  await ensureNudgeTable();
  await query('INSERT INTO Nudge (id, fromPlayerId, toPlayerId, kind, createdAt) VALUES (?, ?, ?, ?, ?)', [
    uuid(),
    fromPlayerId,
    toPlayerId,
    kind,
    new Date().toISOString(),
  ]);
}

export interface ReceivedNudge {
  id: string;
  fromPlayerId: string;
  fromName: string;
  kind: string;
  createdAt: string;
}

/** Nudges sent TO this player, newest first (for the notification feed). */
export async function getNudgesFor(playerId: string, limit = 20): Promise<ReceivedNudge[]> {
  await ensureNudgeTable();
  const rows = await queryAll(
    `SELECT n.id, n.fromPlayerId, n.kind, n.createdAt, p.username as fromName
     FROM Nudge n JOIN Player p ON n.fromPlayerId = p.id
     WHERE n.toPlayerId = ?
     ORDER BY n.createdAt DESC LIMIT ${Number(limit)}`,
    [playerId]
  );
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    fromPlayerId: String(r.fromPlayerId),
    fromName: String(r.fromName),
    kind: String(r.kind),
    createdAt: String(r.createdAt),
  }));
}

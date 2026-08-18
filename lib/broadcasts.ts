import { query, queryAll } from './db';
import { v4 as uuid } from 'uuid';
import { ensureOnce } from './ensureOnce';

/**
 * Broadcasts — an admin "mass nudge" to the whole crew. Unlike a Nudge (one
 * sender → one target), a broadcast is a single row that shows up in EVERY
 * member's notification feed and fires one push to everyone. Used for
 * announcements: "new feature shipped", "season resets Sunday", etc.
 *
 * Deliberately global (not per-recipient rows): the feed reads recent
 * broadcasts and emits them to whoever is looking, so there's nothing to
 * fan-out or mark per person.
 */

export interface Broadcast {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** Additive table — created on first use, no manual migration. */
export async function ensureBroadcastTable(): Promise<void> {
  return ensureOnce('broadcasts', ensureBroadcastTableUncached);
}

async function ensureBroadcastTableUncached(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS Broadcast (
       id          TEXT PRIMARY KEY,
       title       TEXT NOT NULL,
       body        TEXT,
       url         TEXT,
       createdById TEXT,
       createdAt   TEXT NOT NULL
     )`
  );
}

export async function createBroadcast(input: {
  title: string;
  body?: string | null;
  url?: string | null;
  createdById?: string | null;
}): Promise<{ id: string; createdAt: string }> {
  await ensureBroadcastTable();
  const id = uuid();
  const createdAt = new Date().toISOString();
  await query(
    'INSERT INTO Broadcast (id, title, body, url, createdById, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, input.title, input.body || null, input.url || null, input.createdById || null, createdAt]
  );
  return { id, createdAt };
}

export async function getRecentBroadcasts(limit = 20): Promise<Broadcast[]> {
  await ensureBroadcastTable();
  const rows = await queryAll(
    `SELECT b.id, b.title, b.body, b.url, b.createdById, b.createdAt, p.username AS createdByName
     FROM Broadcast b
     LEFT JOIN Player p ON b.createdById = p.id
     ORDER BY b.createdAt DESC LIMIT ${Number(limit)}`
  );
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    body: r.body != null ? String(r.body) : null,
    url: r.url != null ? String(r.url) : null,
    createdById: r.createdById != null ? String(r.createdById) : null,
    createdByName: r.createdByName != null ? String(r.createdByName) : null,
    createdAt: String(r.createdAt),
  }));
}

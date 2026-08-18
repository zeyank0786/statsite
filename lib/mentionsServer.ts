import { query, queryAll } from './db';
import { firePush } from './push';
import { mentionedPlayerIds, MentionablePlayer } from './mentions';
import { v4 as uuid } from 'uuid';
import { ensureOnce } from './ensureOnce';

/**
 * Server side of @mentions: record who was mentioned where (for the bell feed)
 * and push them. Works for any text surface — messages, replies, suggestions,
 * commitments, review notes — via a single call.
 *
 * Fire-and-forget by design: a mention never blocks the thing it's attached
 * to (posting a message, making a suggestion), so callers don't await it and
 * failures are swallowed.
 */

let tableReady = false;
async function ensureTable(): Promise<void> {
  return ensureOnce('mentions', ensureTableUncached);
}

async function ensureTableUncached() {
  if (tableReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS Mention (
       id           TEXT PRIMARY KEY,
       mentionedId  TEXT NOT NULL,
       byId         TEXT NOT NULL,
       context      TEXT NOT NULL,
       url          TEXT NOT NULL,
       snippet      TEXT,
       createdAt    TEXT NOT NULL
     )`
  );
  tableReady = true;
}

async function roster(): Promise<MentionablePlayer[]> {
  const rows = await queryAll('SELECT id, username FROM Player WHERE active = 1');
  return (rows as any[]).map((r) => ({ id: String(r.id), username: String(r.username) }));
}

const CONTEXT_LABEL: Record<string, string> = {
  message: 'a message',
  reply: 'a reply',
  suggestion: 'a suggestion',
  commitment: 'a commitment',
  checkin: 'a check-in',
  review: 'a review note',
};

/**
 * Record + push every @mention in `content`. Never notifies the author for
 * mentioning themselves. Returns the ids that were notified.
 */
export async function recordMentions(params: {
  content: string;
  byId: string;
  byName: string;
  context: 'message' | 'reply' | 'suggestion' | 'commitment' | 'checkin' | 'review';
  url: string;
}): Promise<string[]> {
  const { content, byId, byName, context, url } = params;
  if (!content?.trim()) return [];

  try {
    const players = await roster();
    const ids = mentionedPlayerIds(content, players).filter((id) => id !== byId);
    if (ids.length === 0) return [];

    await ensureTable();
    const now = new Date().toISOString();
    const snippet = content.trim().slice(0, 120);

    for (const mentionedId of ids) {
      await query(
        'INSERT INTO Mention (id, mentionedId, byId, context, url, snippet, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), mentionedId, byId, context, url, snippet, now]
      );
    }

    firePush(ids, {
      title: `💬 ${byName} mentioned you`,
      body: `${byName} mentioned you in ${CONTEXT_LABEL[context] || 'a post'}: ${snippet}`,
      url,
      tag: `mention-${context}`,
    });

    return ids;
  } catch (e) {
    console.error('recordMentions failed (ignored):', e);
    return [];
  }
}

export interface MentionEvent {
  id: string;
  byId: string;
  byName: string;
  context: string;
  url: string;
  snippet: string | null;
  createdAt: string;
}

/** Mentions of this player, newest first — for the notification feed. */
export async function getMentionsFor(playerId: string, limit = 20): Promise<MentionEvent[]> {
  try {
    await ensureTable();
    const rows = await queryAll(
      `SELECT m.id, m.byId, m.context, m.url, m.snippet, m.createdAt, p.username as byName
       FROM Mention m LEFT JOIN Player p ON m.byId = p.id
       WHERE m.mentionedId = ? ORDER BY m.createdAt DESC LIMIT ${Number(limit)}`,
      [playerId]
    );
    return (rows as any[]).map((r) => ({
      id: String(r.id),
      byId: String(r.byId),
      byName: r.byName ? String(r.byName) : 'Someone',
      context: String(r.context),
      url: String(r.url),
      snippet: r.snippet ? String(r.snippet) : null,
      createdAt: String(r.createdAt),
    }));
  } catch {
    return [];
  }
}

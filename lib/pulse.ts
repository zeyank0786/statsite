import { queryOne } from './db';
import { getLocksForPlayer } from './featureLocks';

/**
 * The three nav badge counts, as cheaply as they can honestly be computed.
 *
 * This runs every 15 seconds for every open tab, so it is the most frequently
 * executed code in the app and its shape matters more than its length.
 *
 * Two things were expensive before:
 *
 * 1. `WHERE id NOT IN (SELECT ... FROM MessageRead WHERE userId = ?)`.
 *    SQLite materialises the subquery, so this read all of Message AND the
 *    reader's whole slice of MessageRead, every time. A LEFT JOIN with an
 *    `IS NULL` test uses the (messageId, userId) index for a single probe per
 *    candidate row instead.
 *
 * 2. No time bound at all, so the cost grew with the archive forever. Unread
 *    counts are only meaningful for recent activity — an item nobody has
 *    opened in two months is not something a badge should still be nagging
 *    about — so the window below bounds the work permanently.
 *
 * The per-item read tables are still the source of truth (a plain "everything
 * before T is read" watermark would be wrong now that the boards are paged:
 * loading 20 messages must not mark the 200 behind them as read).
 */

/** How far back an item can be and still count toward a badge. */
const UNREAD_WINDOW_DAYS = 60;

export interface PulseCounts {
  messages: number;
  evidence: number;
  suggestions: number;
}

function windowStart(): string {
  return new Date(Date.now() - UNREAD_WINDOW_DAYS * 86_400_000).toISOString();
}

/**
 * Each count is isolated. Folding them together would mean one failure — a
 * table that doesn't exist yet on a given deployment, say — takes down every
 * badge in the nav at once, where before it only broke its own.
 */
async function safely(fn: () => Promise<number>, label: string): Promise<number> {
  try {
    return await fn();
  } catch (error) {
    console.error(`pulse: ${label} count failed`, error);
    return 0;
  }
}

export async function getPulseCounts(playerId: string): Promise<PulseCounts> {
  const since = windowStart();

  const [messages, evidence, suggestions] = await Promise.all([
    safely(async () => {
      const row = await queryOne(
        `SELECT COUNT(*) as c
           FROM Message m
           LEFT JOIN MessageRead r ON r.messageId = m.id AND r.userId = ?
          WHERE m.createdAt >= ? AND r.messageId IS NULL`,
        [playerId, since]
      );
      return Number(row?.c) || 0;
    }, 'messages'),

    // Own posts never count as unread. EvidenceRead is created on demand by
    // /api/evidence/unread, so it may not exist on a fresh database.
    safely(async () => {
      const row = await queryOne(
        `SELECT COUNT(*) as c
           FROM Evidence e
           LEFT JOIN EvidenceRead r ON r.evidenceId = e.id AND r.userId = ?
          WHERE e.createdAt >= ? AND e.playerId != ? AND r.evidenceId IS NULL`,
        [playerId, since, playerId]
      );
      return Number(row?.c) || 0;
    }, 'evidence'),

    // You owe a vote when the suggestion is pending, isn't about you, and you
    // are active and not vote-locked. `status = 'pending'` is indexed, so this
    // no longer scans resolved history to find the handful that are live.
    safely(async () => {
      const me = await queryOne('SELECT active FROM Player WHERE id = ?', [playerId]);
      if (!me || !Number(me.active)) return 0;

      const locks = await getLocksForPlayer(playerId).catch(() => new Set<string>());
      if (locks.has('vote')) return 0;

      const row = await queryOne(
        `SELECT COUNT(*) as c
           FROM Suggestion s
           LEFT JOIN Vote v ON v.suggestionId = s.id AND v.userId = ?
          WHERE s.status = 'pending' AND s.playerId != ? AND v.suggestionId IS NULL`,
        [playerId, playerId]
      );
      return Number(row?.c) || 0;
    }, 'suggestions'),
  ]);

  return { messages, evidence, suggestions };
}

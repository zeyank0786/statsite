import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { getLocksForPlayer } from '@/lib/featureLocks';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * One round trip for everything the app shell polls.
 *
 * The shell previously fired three requests every 15s (/messages/unread,
 * /evidence/unread, /suggestions/unvoted) on every page, with the notification
 * bell and activity ticker adding two more on their own timers — roughly 16
 * requests a minute per open tab before the page itself did anything.
 *
 * Every count below is a single indexed COUNT(*) against the same libsql
 * connection, so serving them together costs barely more than serving one, and
 * the client gets a consistent snapshot instead of three interleaved ones.
 *
 * The original endpoints are intentionally left in place: they also carry the
 * POST handlers that mark things read, and other callers still use them.
 */
export async function GET() {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playerId = (session.user as { playerId?: string })?.playerId;
    if (!playerId) {
      return NextResponse.json({ messages: 0, evidence: 0, suggestions: 0 });
    }

    // Each count is isolated. Folding three endpoints into one would otherwise
    // mean a single failure — a table that doesn't exist yet on a given
    // deployment, say — takes down every badge in the nav at once, where
    // before it only broke its own. A count that can't be computed reads 0.
    const count = async (fn: () => Promise<number>, label: string): Promise<number> => {
      try {
        return await fn();
      } catch (error) {
        console.error(`pulse: ${label} count failed`, error);
        return 0;
      }
    };

    const [messages, evidence, suggestions] = await Promise.all([
      count(async () => {
        const row = await queryOne(
          `SELECT COUNT(*) as c FROM Message m
           WHERE m.id NOT IN (SELECT messageId FROM MessageRead WHERE userId = ?)`,
          [playerId]
        );
        return Number(row?.c) || 0;
      }, 'messages'),

      // Own posts never count as unread. EvidenceRead is created on demand by
      // /api/evidence/unread, so it may not exist on a fresh database.
      count(async () => {
        const row = await queryOne(
          `SELECT COUNT(*) as c FROM Evidence e
           WHERE e.playerId != ?
             AND e.id NOT IN (SELECT evidenceId FROM EvidenceRead WHERE userId = ?)`,
          [playerId, playerId]
        );
        return Number(row?.c) || 0;
      }, 'evidence'),

      // You owe a vote when the suggestion is pending, isn't about you, and
      // you are active and not vote-locked.
      count(async () => {
        const me = await queryOne('SELECT active FROM Player WHERE id = ?', [playerId]);
        if (!me || !Number(me.active)) return 0;

        const locks = await getLocksForPlayer(String(playerId)).catch(() => new Set<string>());
        if (locks.has('vote')) return 0;

        const row = await queryOne(
          `SELECT COUNT(*) as c FROM Suggestion s
           WHERE s.status = 'pending'
             AND s.playerId != ?
             AND NOT EXISTS (SELECT 1 FROM Vote v WHERE v.suggestionId = s.id AND v.userId = ?)`,
          [playerId, playerId]
        );
        return Number(row?.c) || 0;
      }, 'suggestions'),
    ]);

    return NextResponse.json({ messages, evidence, suggestions });
  } catch (error: unknown) {
    console.error('Error building pulse:', error);
    return NextResponse.json(errorPayload('Failed to load pulse', error), { status: 500 });
  }
}

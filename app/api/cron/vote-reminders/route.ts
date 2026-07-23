import { NextResponse } from 'next/server';
import { query, queryAll, queryOne } from '@/lib/db';
import { getEligibleVoterIds } from '@/lib/suggestionEngine';
import { sendPushToPlayers } from '@/lib/push';
import { runCommitmentUpkeep } from '@/lib/commitments';

export const dynamic = 'force-dynamic';

/**
 * Scheduled nudge for suggestions that have gone quiet.
 *
 * Runs from a Vercel cron (see vercel.json). Aggregates per PERSON rather
 * than per suggestion — "3 suggestions are waiting on you" is one useful
 * push, where one-per-suggestion would be spam.
 *
 * Protected by CRON_SECRET when set: Vercel automatically sends it as a
 * bearer token on scheduled invocations. Safe to hit manually for testing
 * while unset.
 */

/** Only chase suggestions that have been sitting this long. */
const STALE_HOURS = 48;
/** Never remind the same person more than once per this window. */
const REMINDER_COOLDOWN_HOURS = 20;

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS VoteReminder (
       playerId   TEXT PRIMARY KEY,
       lastSentAt TEXT NOT NULL
     )`
  );
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Commitments upkeep rides along with this job — Vercel's Hobby plan allows
  // very few cron entries, and a failure here must not stop vote reminders.
  let commitments: { swept: number; nudged: number; chased: number } | null = null;
  try {
    commitments = await runCommitmentUpkeep();
  } catch (e) {
    console.error('Commitment upkeep failed (vote reminders continue):', e);
  }

  try {
    await ensureTable();
    const cutoff = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();

    const pending = await queryAll(
      "SELECT id, playerId FROM Suggestion WHERE status = 'pending' AND createdAt < ?",
      [cutoff]
    );
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, stale: 0, reminded: 0, commitments });
    }

    const votes = await queryAll('SELECT suggestionId, userId FROM Vote');
    const votedBy = new Map<string, Set<string>>();
    for (const v of votes as any[]) {
      const key = String(v.suggestionId);
      if (!votedBy.has(key)) votedBy.set(key, new Set());
      votedBy.get(key)!.add(String(v.userId));
    }

    // Count outstanding suggestions per eligible voter
    const owedBy = new Map<string, number>();
    const eligibleCache = new Map<string, string[]>();
    for (const sg of pending as any[]) {
      const subjectId = String(sg.playerId);
      if (!eligibleCache.has(subjectId)) {
        eligibleCache.set(subjectId, await getEligibleVoterIds(subjectId));
      }
      const voted = votedBy.get(String(sg.id)) || new Set<string>();
      for (const voterId of eligibleCache.get(subjectId)!) {
        if (!voted.has(voterId)) owedBy.set(voterId, (owedBy.get(voterId) || 0) + 1);
      }
    }

    const cooldownCutoff = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 3600_000).toISOString();
    const now = new Date().toISOString();
    let reminded = 0;

    for (const [playerId, count] of owedBy) {
      const last = await queryOne('SELECT lastSentAt FROM VoteReminder WHERE playerId = ?', [playerId]);
      if (last && String(last.lastSentAt) > cooldownCutoff) continue;

      const sent = await sendPushToPlayers([playerId], {
        title: count > 1 ? `${count} suggestions need your vote` : 'A suggestion needs your vote',
        body:
          count > 1
            ? `They've been waiting a couple of days. Two taps each and they're done.`
            : `It's been waiting a couple of days — the crew can't resolve it without you.`,
        url: '/suggestions',
        tag: 'vote-reminder',
      });

      // Record regardless of delivery: someone with notifications off
      // shouldn't be retried every run either.
      await query(
        `INSERT INTO VoteReminder (playerId, lastSentAt) VALUES (?, ?)
         ON CONFLICT(playerId) DO UPDATE SET lastSentAt = excluded.lastSentAt`,
        [playerId, now]
      );
      if (sent > 0) reminded++;
    }

    return NextResponse.json({
      ok: true,
      stale: pending.length,
      owed: owedBy.size,
      reminded,
      commitments,
    });
  } catch (error: any) {
    console.error('Vote reminder cron failed:', error);
    return NextResponse.json({ error: 'Cron failed', details: error.message }, { status: 500 });
  }
}

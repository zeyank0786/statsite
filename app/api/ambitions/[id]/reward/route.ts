import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import {
  getEligibleVoterIds,
  resolveSuggestion,
  notifyApprovedChanges,
} from '@/lib/suggestionEngine';
import { featureLockMessage, getPlayersLockedFrom } from '@/lib/featureLocks';
import { ensureAmbitionTables, MAX_REWARD_DELTA } from '@/lib/ambitions';
import { sendPushToPlayers } from '@/lib/push';
import { recordMentions } from '@/lib/mentionsServer';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Propose the completion reward for an ambition — a suggestion with an UNCAPPED
 * positive delta (the whole point: past the normal ±2). Someone other than the
 * ambition's owner proposes it, and it resolves through the ordinary vote
 * engine, so the big boost is still crew-decided, never self-awarded.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ambitionId } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const proposerId = (session.user as any)?.playerId;
    if (!proposerId) return NextResponse.json({ error: 'No player linked to this account' }, { status: 400 });

    await ensureAmbitionTables();
    const ambition = await queryOne(
      'SELECT id, playerId, title, statId, status FROM Ambition WHERE id = ?',
      [ambitionId]
    );
    if (!ambition) return NextResponse.json({ error: 'Ambition not found' }, { status: 404 });
    if (String(ambition.status) !== 'completed') {
      return NextResponse.json({ error: 'The ambition must be completed before a reward can be proposed' }, { status: 400 });
    }

    const subjectId = String(ambition.playerId);
    if (subjectId === String(proposerId)) {
      return NextResponse.json({ error: "You can't propose your own reward — a crewmate does that" }, { status: 403 });
    }

    const lockMsg = await featureLockMessage(String(proposerId), 'suggest');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const eligible = await getEligibleVoterIds(subjectId);
    if (!eligible.includes(String(proposerId))) {
      return NextResponse.json({ error: "You're not eligible to weigh in on this player" }, { status: 403 });
    }

    // Only one live reward per ambition — a pending or already-approved one blocks another.
    const existing = await queryOne(
      "SELECT id, status FROM Suggestion WHERE ambitionId = ? AND status IN ('pending','approved') LIMIT 1",
      [ambitionId]
    );
    if (existing) {
      return NextResponse.json(
        { error: `A reward is already ${String(existing.status)} for this ambition` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const delta = Math.floor(Number(body?.delta));
    if (!Number.isInteger(delta) || delta < 1) {
      return NextResponse.json({ error: 'Reward must be a positive whole number' }, { status: 400 });
    }
    if (delta > MAX_REWARD_DELTA) {
      return NextResponse.json({ error: `Keep it under ${MAX_REWARD_DELTA} — sanity guard, not a design cap` }, { status: 400 });
    }

    // Which stat gets the boost — the ambition's linked stat by default, else the caller's pick.
    const statId = typeof body?.statId === 'string' && body.statId ? body.statId : ambition.statId ? String(ambition.statId) : '';
    if (!statId) {
      return NextResponse.json({ error: 'Pick which stat the reward lands on' }, { status: 400 });
    }
    const stat = await queryOne('SELECT id, label FROM Stat WHERE id = ?', [statId]);
    if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

    const hidden = await queryOne(
      'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
      [statId, subjectId]
    );
    if (hidden) {
      return NextResponse.json({ error: `"${String(stat.label)}" isn't tracked for this player` }, { status: 400 });
    }
    const lock = await isStatLockedForPlayer(String(statId), subjectId);
    if (lock.locked) {
      return NextResponse.json(
        { error: `"${String(stat.label)}" is locked for this player. ${describeLock(lock)}` },
        { status: 400 }
      );
    }

    const userReason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!userReason) return NextResponse.json({ error: 'Add a reason for the crew' }, { status: 400 });
    const reason = `🏆 Ambition reward — "${String(ambition.title)}". ${userReason}`;

    const suggestionId = uuid();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO Suggestion (id, playerId, proposedById, statId, delta, reason, batchId, ambitionId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [suggestionId, subjectId, String(proposerId), String(statId), delta, reason, suggestionId, ambitionId, now, now]
    );

    // Proposing counts as an implicit yes.
    await query('INSERT INTO Vote (id, suggestionId, userId, choice, createdAt) VALUES (?, ?, ?, ?, ?)', [
      uuid(),
      suggestionId,
      String(proposerId),
      'yes',
      now,
    ]);

    const resolution = await resolveSuggestion(suggestionId);

    // If it's still pending, ping the other eligible voters (awaited so it sends).
    if (resolution?.status === 'pending') {
      const voters = eligible.filter((pid) => pid !== String(proposerId));
      if (voters.length > 0) {
        const [proposerRow, subjectRow] = await Promise.all([
          queryOne('SELECT username FROM Player WHERE id = ?', [String(proposerId)]),
          queryOne('SELECT username FROM Player WHERE id = ?', [subjectId]),
        ]);
        await sendPushToPlayers(voters, {
          title: 'An ambition reward needs your vote',
          body: `${String(proposerRow?.username || 'Someone')} proposed +${delta} ${String(
            stat.label
          )} for ${String(subjectRow?.username || 'a player')} completing "${String(ambition.title)}".`,
          url: '/suggestions',
          tag: 'vote-needed',
        });
      }
    } else if (resolution?.applied) {
      // Cleared instantly (small roster) — tell the subject.
      await notifyApprovedChanges(resolution.applied.playerId, [resolution.applied]);
    }

    // @mentions in the reason
    const proposerRow = await queryOne('SELECT username FROM Player WHERE id = ?', [String(proposerId)]);
    recordMentions({
      content: userReason,
      byId: String(proposerId),
      byName: String(proposerRow?.username || 'Someone'),
      context: 'suggestion',
      url: '/suggestions',
    });

    return NextResponse.json({ success: true, id: suggestionId, resolution });
  } catch (error: any) {
    console.error('Error proposing ambition reward:', error);
    return NextResponse.json(errorPayload('Failed to propose reward', error), { status: 500 });
  }
}

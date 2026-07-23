import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { featureLockMessage } from '@/lib/featureLocks';
import { isStatLockedForPlayer, describeLock } from '@/lib/locks';
import { firePush } from '@/lib/push';
import {
  ensureCommitmentTables,
  sweepDeadlines,
  tallyVotes,
  MIN_DEADLINE_HOURS,
  MAX_DEADLINE_DAYS,
  completionRate,
} from '@/lib/commitments';
import { getEligibleVoterIds } from '@/lib/suggestionEngine';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const ALLOWED_DELTAS = [-2, -1, 1, 2];

async function getPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  return playerId ? String(playerId) : null;
}

/** GET: every commitment with stats, tallies and per-player completion rates. */
export async function GET() {
  const currentPlayerId = await getPlayerId();
  if (!currentPlayerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureCommitmentTables();
    // Lazy housekeeping so overdue commitments advance even without cron
    try {
      await sweepDeadlines();
    } catch (e) {
      console.error('Deadline sweep failed (listing continues):', e);
    }

    const rows = await queryAll(
      `SELECT c.*, p.username as playerName, p.active as playerActive
       FROM Commitment c JOIN Player p ON c.playerId = p.id
       ORDER BY
         CASE c.status WHEN 'awaiting_verdict' THEN 0 WHEN 'withdraw_pending' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
         COALESCE(c.resolvedAt, c.deadline) ASC`
    );

    const [statRows, checkInRows] = await Promise.all([
      queryAll(
        `SELECT cs.commitmentId, cs.statId, cs.delta, s.code, s.label, cat.code as categoryCode, cat.label as categoryLabel
         FROM CommitmentStat cs
         JOIN Stat s ON cs.statId = s.id
         JOIN Category cat ON s.categoryId = cat.id`
      ),
      queryAll('SELECT commitmentId, COUNT(*) as n, MAX(createdAt) as last FROM CommitmentCheckIn GROUP BY commitmentId'),
    ]);

    const statsByCommitment = new Map<string, any[]>();
    for (const r of statRows as any[]) {
      const key = String(r.commitmentId);
      if (!statsByCommitment.has(key)) statsByCommitment.set(key, []);
      statsByCommitment.get(key)!.push({
        statId: String(r.statId),
        delta: Number(r.delta),
        code: String(r.code),
        label: String(r.label),
        categoryCode: String(r.categoryCode),
        categoryLabel: String(r.categoryLabel),
      });
    }
    const checkInsByCommitment = new Map<string, { n: number; last: string }>();
    for (const r of checkInRows as any[]) {
      checkInsByCommitment.set(String(r.commitmentId), { n: Number(r.n), last: String(r.last) });
    }

    const payload = [];
    for (const c of rows as any[]) {
      const id = String(c.id);
      const subjectId = String(c.playerId);
      const status = String(c.status);
      const isSubject = subjectId === currentPlayerId;

      let tally = null;
      if (status === 'awaiting_verdict' || status === 'withdraw_pending') {
        const kind = status === 'withdraw_pending' ? 'withdrawal' : 'verdict';
        const t = await tallyVotes(id, subjectId, kind);
        const mine = t.voters.find((v) => v.playerId === currentPlayerId);
        tally = {
          kind,
          eligibleCount: t.eligibleCount,
          votesNeeded: t.votesNeeded,
          yes: t.yes,
          no: t.no,
          waitingOn: t.waitingOn,
          yourVote: mine ? mine.choice : null,
          canVote: !isSubject && (await getEligibleVoterIds(subjectId)).includes(currentPlayerId),
        };
      }

      const checkIns = checkInsByCommitment.get(id);
      payload.push({
        id,
        playerId: subjectId,
        playerName: String(c.playerName),
        playerActive: Boolean(Number(c.playerActive)),
        title: String(c.title),
        detail: c.detail ? String(c.detail) : null,
        cadence: String(c.cadence),
        deadline: String(c.deadline),
        status,
        withdrawReason: c.withdrawReason ? String(c.withdrawReason) : null,
        createdAt: String(c.createdAt),
        resolvedAt: c.resolvedAt ? String(c.resolvedAt) : null,
        stats: statsByCommitment.get(id) || [],
        checkInCount: checkIns?.n || 0,
        lastCheckInAt: checkIns?.last || null,
        isSubject,
        tally,
      });
    }

    // Per-player record for the leaderboard-style summary
    const recordRows = await queryAll(
      `SELECT playerId, status, COUNT(*) as n FROM Commitment
       WHERE status IN ('kept','missed','withdrawn') GROUP BY playerId, status`
    );
    const records: Record<string, { kept: number; missed: number; withdrawn: number; rate: number | null }> = {};
    for (const r of recordRows as any[]) {
      const pid = String(r.playerId);
      if (!records[pid]) records[pid] = { kept: 0, missed: 0, withdrawn: 0, rate: null };
      (records[pid] as any)[String(r.status)] = Number(r.n);
    }
    for (const pid of Object.keys(records)) {
      records[pid].rate = completionRate(records[pid].kept, records[pid].missed);
    }

    return NextResponse.json({ commitments: payload, records });
  } catch (error: any) {
    console.error('Error listing commitments:', error);
    return NextResponse.json({ error: 'Failed to list commitments', details: error.message }, { status: 500 });
  }
}

/** POST: make a commitment. Only ever for yourself. */
export async function POST(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lockMsg = await featureLockMessage(playerId, 'commit');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { title, detail, deadline, cadence, stats } = await request.json();
    if (!title?.trim()) return NextResponse.json({ error: 'Give the commitment a title' }, { status: 400 });
    if (!deadline) return NextResponse.json({ error: 'Pick a deadline' }, { status: 400 });

    const when = new Date(deadline).getTime();
    if (Number.isNaN(when)) return NextResponse.json({ error: 'That deadline is not a valid date' }, { status: 400 });
    const hoursOut = (when - Date.now()) / 3600_000;
    if (hoursOut < MIN_DEADLINE_HOURS) {
      return NextResponse.json(
        { error: `Deadline must be at least ${MIN_DEADLINE_HOURS} hours away — give yourself a real window.` },
        { status: 400 }
      );
    }
    if (hoursOut > MAX_DEADLINE_DAYS * 24) {
      return NextResponse.json({ error: `Deadline can't be more than ${MAX_DEADLINE_DAYS} days out.` }, { status: 400 });
    }

    const player = await queryOne('SELECT active FROM Player WHERE id = ?', [playerId]);
    if (!player || !Number(player.active)) {
      return NextResponse.json({ error: 'Only active players can make commitments' }, { status: 403 });
    }

    // Stat rewards are optional, but if present they follow suggestion rules
    const parsed: { statId: string; delta: number }[] = [];
    if (Array.isArray(stats)) {
      const seen = new Set<string>();
      for (const s of stats) {
        const statId = String(s?.statId || '');
        const delta = Number(s?.delta);
        if (!statId || seen.has(statId)) {
          return NextResponse.json({ error: 'Each stat can only be listed once' }, { status: 400 });
        }
        if (!ALLOWED_DELTAS.includes(delta)) {
          return NextResponse.json({ error: 'Deltas must be -2, -1, +1 or +2' }, { status: 400 });
        }
        seen.add(statId);
        parsed.push({ statId, delta });
      }
    }

    for (const change of parsed) {
      const stat = await queryOne('SELECT id, label FROM Stat WHERE id = ?', [change.statId]);
      if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

      const hidden = await queryOne(
        'SELECT hidden FROM StatVisibility WHERE statId = ? AND playerId = ? AND hidden = 1',
        [change.statId, playerId]
      );
      if (hidden) {
        return NextResponse.json({ error: `"${String(stat.label)}" isn't tracked for you` }, { status: 400 });
      }
      const lock = await isStatLockedForPlayer(change.statId, playerId);
      if (lock.locked) {
        return NextResponse.json(
          { error: `"${String(stat.label)}" is locked. ${describeLock(lock)}` },
          { status: 400 }
        );
      }
    }

    await ensureCommitmentTables();
    const id = uuid();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO Commitment (id, playerId, title, detail, cadence, deadline, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        id,
        playerId,
        title.trim(),
        detail?.trim() || null,
        cadence === 'weekly' ? 'weekly' : 'none',
        new Date(when).toISOString(),
        now,
        now,
      ]
    );
    for (const change of parsed) {
      await query('INSERT INTO CommitmentStat (commitmentId, statId, delta) VALUES (?, ?, ?)', [
        id,
        change.statId,
        change.delta,
      ]);
    }

    // Tell the crew — a commitment nobody knows about isn't a commitment
    const subject = await queryOne('SELECT username FROM Player WHERE id = ?', [playerId]);
    const others = (await queryAll('SELECT id FROM Player WHERE active = 1 AND id != ?', [playerId])).map((r: any) =>
      String(r.id)
    );
    firePush(others, {
      title: `📌 ${String(subject?.username || 'Someone')} made a commitment`,
      body: title.trim(),
      url: `/commitments/${id}`,
      tag: `commitment-${id}`,
    });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error creating commitment:', error);
    return NextResponse.json({ error: 'Failed to create commitment', details: error.message }, { status: 500 });
  }
}

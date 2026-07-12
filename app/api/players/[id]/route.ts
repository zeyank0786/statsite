import { NextResponse } from 'next/server';
import { queryOne, queryAll, query } from '@/lib/db';
import { computeLocksForPlayer } from '@/lib/locks';
import { getNextTier } from '@/lib/categories';
import { computeStreakWeeks } from '@/lib/streaks';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const RANKUP_WINDOW_DAYS = 60;

/**
 * "At your recent pace you'll hit <next tier> in ~N weeks" for the stats
 * climbing fastest toward their next tier. Velocity = net gain over the last
 * RANKUP_WINDOW_DAYS, expressed per week; purely derived from StatHistory.
 */
async function computeRankUp(
  playerId: string,
  currentStats: { statId: string; code: string; label: string; value: number; locked: boolean }[]
) {
  const since = new Date(Date.now() - RANKUP_WINDOW_DAYS * 86400000).toISOString();
  const rows = await queryAll(
    `SELECT sv.statId as statId, SUM(sh.newValue - sh.oldValue) as netChange
     FROM StatHistory sh
     JOIN StatValue sv ON sh.statValueId = sv.id
     WHERE sv.playerId = ? AND sh.createdAt >= ?
     GROUP BY sv.statId`,
    [playerId, since]
  );
  const netByStat = new Map<string, number>();
  for (const r of rows as any[]) netByStat.set(String(r.statId), Number(r.netChange));

  const projections = currentStats
    .filter((s) => !s.locked)
    .map((s) => {
      const net = netByStat.get(s.statId) ?? 0;
      const perWeek = (net / RANKUP_WINDOW_DAYS) * 7;
      const nextTier = getNextTier(s.value);
      if (!nextTier || perWeek <= 0) return null;
      const ptsToGo = nextTier.min - s.value;
      if (ptsToGo <= 0) return null;
      const weeks = Math.ceil(ptsToGo / perWeek);
      return {
        statId: s.statId,
        code: s.code,
        label: s.label,
        current: s.value,
        nextTier: nextTier.name,
        nextTierHex: nextTier.hex,
        ptsToGo,
        weeks,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && p.weeks <= 104) // hide >2yr noise
    .sort((a, b) => a.weeks - b.weeks)
    .slice(0, 3);

  return projections;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const player = await queryOne(
      'SELECT p.id, p.username, p.active, p.archivedAt, p.createdAt, u.email FROM Player p LEFT JOIN User u ON p.id = u.playerId WHERE p.id = ?',
      [id]
    );

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Stats visible for this player (StatVisibility row with hidden=1 excludes)
    const stats = await queryAll(
      `SELECT
        s.id as statId,
        s.code,
        s.label,
        c.code as categoryCode,
        c.label as categoryLabel,
        COALESCE(sv.value, 0) as value,
        (sv.id IS NULL) as missingValue
      FROM Stat s
      JOIN Category c ON s.categoryId = c.id
      LEFT JOIN StatValue sv ON s.id = sv.statId AND sv.playerId = ?
      LEFT JOIN StatVisibility vis ON vis.statId = s.id AND vis.playerId = ?
      WHERE (vis.hidden IS NULL OR vis.hidden = 0)
      ORDER BY c.id, s.id`,
      [id, id]
    );

    // Lazily create missing StatValue rows at the default of 5
    for (const row of stats as any[]) {
      if (Number(row.missingValue)) {
        const now = new Date().toISOString();
        await query(
          'INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid(), row.statId, id, 5, now, now]
        );
        row.value = 5;
      }
    }

    const locks = await computeLocksForPlayer(id);

    const statMap: Record<string, any> = {};
    for (const row of stats as any[]) {
      const categoryCode = String(row.categoryCode);
      if (!statMap[categoryCode]) {
        statMap[categoryCode] = {
          code: categoryCode,
          label: String(row.categoryLabel),
          stats: [],
        };
      }
      const lock = locks.get(String(row.statId));
      statMap[categoryCode].stats.push({
        id: String(row.statId),
        code: String(row.code),
        label: String(row.label),
        value: Number(row.value),
        locked: lock?.locked || false,
        lockSource: lock?.source || null,
        lockReasons: lock?.reasons || [],
      });
    }

    const categories = Object.values(statMap) as any[];
    const categoryTotals = categories.map((cat) =>
      cat.stats.reduce((sum: number, s: any) => sum + s.value, 0)
    );
    const totalSum = categoryTotals.reduce((sum: number, total: number) => sum + total, 0);
    const overallScore = categories.length > 0 ? (totalSum / categories.length).toFixed(1) : 0;

    const history = await queryAll(
      `SELECT sh.oldValue, sh.newValue, s.code, s.label, sh.createdAt, p2.username as changedBy
      FROM StatHistory sh
      JOIN StatValue sv ON sh.statValueId = sv.id
      JOIN Stat s ON sv.statId = s.id
      JOIN Player p2 ON sh.changedById = p2.id
      WHERE sv.playerId = ?
      ORDER BY sh.createdAt DESC
      LIMIT 10`,
      [id]
    );

    const recentReviews = await queryAll(
      `SELECT rs.id, rs.createdAt, COUNT(DISTINCT rp.playerId) as participantCount
      FROM ReviewSession rs
      LEFT JOIN ReviewParticipant rp ON rs.id = rp.sessionId
      WHERE rs.targetPlayerId = ?
      GROUP BY rs.id, rs.createdAt
      ORDER BY rs.createdAt DESC
      LIMIT 5`,
      [id]
    );

    const otherPlayers = await queryAll(
      'SELECT id, username FROM Player WHERE id != ? AND active = 1 ORDER BY username ASC',
      [id]
    );

    // Rank-up ETA over the visible, unlocked stats
    const flatStats = (categories as any[]).flatMap((cat) =>
      cat.stats.map((s: any) => ({
        statId: String(s.id),
        code: String(s.code),
        label: String(s.label),
        value: Number(s.value),
        locked: Boolean(s.locked),
      }))
    );
    const rankUp = await computeRankUp(id, flatStats);

    // Activity streak: consecutive weeks with a stat change or evidence post
    const [changeDates, evidenceDates] = await Promise.all([
      queryAll(
        `SELECT sh.createdAt FROM StatHistory sh JOIN StatValue sv ON sh.statValueId = sv.id WHERE sv.playerId = ?`,
        [id]
      ),
      queryAll('SELECT createdAt FROM Evidence WHERE playerId = ?', [id]),
    ]);
    const streakWeeks = computeStreakWeeks(
      [...(changeDates as any[]), ...(evidenceDates as any[])].map((r) => String(r.createdAt))
    );

    return NextResponse.json({
      player: {
        id: player.id,
        username: player.username,
        active: Boolean(Number(player.active)),
        archivedAt: player.archivedAt || null,
        email: player.email || 'No email set',
        createdAt: player.createdAt,
      },
      categories,
      overallScore,
      history,
      recentReviews,
      otherPlayers,
      rankUp,
      streakWeeks,
    });
  } catch (error: any) {
    console.error('Error fetching player:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { username } = await request.json();

    if (!username || username.trim().length === 0) {
      return NextResponse.json({ error: 'Username cannot be empty' }, { status: 400 });
    }

    await query(
      'UPDATE Player SET username = ? WHERE id = ?',
      [username.trim(), id]
    );

    return NextResponse.json({ success: true, username: username.trim() });
  } catch (error: any) {
    console.error('Error updating player:', error);
    return NextResponse.json(
      { error: 'Failed to update player', details: error.message },
      { status: 500 }
    );
  }
}

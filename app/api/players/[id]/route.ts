import { NextResponse } from 'next/server';
import { queryOne, queryAll, query } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const player = await queryOne(
      'SELECT p.id, p.username, p.createdAt, u.email FROM Player p LEFT JOIN User u ON p.id = u.playerId WHERE p.id = ?',
      [id]
    );

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const stats = await queryAll(
      `SELECT
        s.id as statId,
        s.code,
        s.label,
        c.code as categoryCode,
        c.label as categoryLabel,
        COALESCE(sv.value, 0) as value
      FROM Stat s
      JOIN Category c ON s.categoryId = c.id
      LEFT JOIN StatValue sv ON s.id = sv.statId AND sv.playerId = ?
      ORDER BY c.id, s.id`,
      [id]
    );

    const existingStatIds = new Set(
      (await queryAll('SELECT statId FROM StatValue WHERE playerId = ?', [id]))
        .map((sv: any) => sv.statId)
    );

    for (const row of stats) {
      if (!existingStatIds.has(row.statId) && row.value === 0) {
        const now = new Date().toISOString();
        await query(
          'INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid(), row.statId, id, 5, now, now]
        );
      }
    }

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
      statMap[categoryCode].stats.push({
        id: String(row.statId),
        code: String(row.code),
        label: String(row.label),
        value: Number(row.value),
      });
    }

    const categories = Object.values(statMap) as any[];
    const categoryTotals = categories.map((cat) =>
      cat.stats.reduce((sum: number, s: any) => sum + s.value, 0)
    );
    const totalSum = categoryTotals.reduce((sum: number, total: number) => sum + total, 0);
    const overallScore = categories.length > 1 ? (totalSum / (categories.length - 1)).toFixed(1) : 0;

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
      'SELECT id, username FROM Player WHERE id != ? ORDER BY username ASC',
      [id]
    );

    return NextResponse.json({
      player: {
        id: player.id,
        username: player.username,
        email: player.email || 'No email set',
        createdAt: player.createdAt,
      },
      categories,
      overallScore,
      history,
      recentReviews,
      otherPlayers,
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

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Admin manual stat override — the deliberate escape hatch from the
 * suggestion/vote flow, for extenuating circumstances only. Sets a player's
 * stat to an absolute value (floored at 0), logs it to StatHistory with
 * source='admin_edit' + the admin as changedBy so every override is visible
 * on the History page. Deliberately does NOT fire tier-up announcements —
 * these are corrections, not celebrated grind.
 *
 * GET  ?playerId=X          → every stat with that player's current value
 * POST { playerId, statId, value, reason? }
 */

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const playerId = new URL(request.url).searchParams.get('playerId');
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });

    const player = await queryOne('SELECT id, username FROM Player WHERE id = ?', [playerId]);
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    // All stats (incl. hidden) with this player's value; lazy default of 5.
    const rows = await queryAll(
      `SELECT s.id as statId, s.code, s.label,
              c.id as categoryId, c.code as categoryCode, c.label as categoryLabel,
              COALESCE(sv.value, 5) as value,
              (SELECT COUNT(*) FROM StatVisibility v WHERE v.statId = s.id AND v.playerId = ? AND v.hidden = 1) as hidden
       FROM Stat s
       JOIN Category c ON s.categoryId = c.id
       LEFT JOIN StatValue sv ON sv.statId = s.id AND sv.playerId = ?
       ORDER BY s.code ASC`,
      [playerId, playerId]
    );

    return NextResponse.json({
      player: { id: String(player.id), username: String(player.username) },
      stats: (rows as any[]).map((r) => ({
        statId: String(r.statId),
        code: String(r.code),
        label: String(r.label),
        categoryId: String(r.categoryId),
        categoryCode: String(r.categoryCode),
        categoryLabel: String(r.categoryLabel),
        value: Number(r.value),
        hidden: Number(r.hidden) > 0,
      })),
    });
  } catch (error: any) {
    console.error('Error loading player stat values:', error);
    return NextResponse.json({ error: 'Failed to load stat values', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { playerId, statId, value, reason } = await request.json();
    if (!playerId || !statId || value === undefined || value === null) {
      return NextResponse.json({ error: 'playerId, statId and value are required' }, { status: 400 });
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ error: 'value must be a number' }, { status: 400 });
    }
    const newValue = Math.max(0, Math.floor(num)); // unbounded above, floored at 0

    const [player, stat] = await Promise.all([
      queryOne('SELECT id FROM Player WHERE id = ?', [playerId]),
      queryOne('SELECT id FROM Stat WHERE id = ?', [statId]),
    ]);
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

    const now = new Date().toISOString();
    // changedBy is the admin (falls back to the subject so the FK always holds)
    const adminPlayerId = (session.user as any)?.playerId
      ? String((session.user as any).playerId)
      : String(playerId);

    const existing = await queryOne(
      'SELECT id, value FROM StatValue WHERE statId = ? AND playerId = ?',
      [statId, playerId]
    );
    const oldValue = existing ? Number(existing.value) : 5;

    let statValueId: string;
    if (existing) {
      statValueId = String(existing.id);
      await query('UPDATE StatValue SET value = ?, updatedAt = ? WHERE id = ?', [newValue, now, statValueId]);
    } else {
      statValueId = uuid();
      await query(
        'INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [statValueId, statId, playerId, newValue, now, now]
      );
    }

    if (newValue !== oldValue) {
      await query(
        `INSERT INTO StatHistory (id, statValueId, oldValue, newValue, reason, changedById, source, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'admin_edit', ?)`,
        [uuid(), statValueId, oldValue, newValue, reason?.trim() || 'Admin manual adjustment', adminPlayerId, now]
      );
    }

    return NextResponse.json({ success: true, oldValue, newValue });
  } catch (error: any) {
    console.error('Error setting stat value:', error);
    return NextResponse.json({ error: 'Failed to set stat value', details: error.message }, { status: 500 });
  }
}

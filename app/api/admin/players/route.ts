import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/** GET: full roster including archived players (admin view). */
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const players = await queryAll(
      `SELECT p.id, p.username, p.active, p.archivedAt, p.createdAt, u.email, u.isAdmin
       FROM Player p
       LEFT JOIN User u ON u.playerId = p.id
       ORDER BY p.active DESC, p.username ASC`
    );
    return NextResponse.json(
      players.map((p: any) => ({
        id: String(p.id),
        username: String(p.username),
        active: Boolean(Number(p.active)),
        archivedAt: p.archivedAt || null,
        createdAt: p.createdAt,
        email: p.email || null,
        isAdmin: Boolean(Number(p.isAdmin || 0)),
      }))
    );
  } catch (error: any) {
    console.error('Error listing players:', error);
    return NextResponse.json({ error: 'Failed to list players', details: error.message }, { status: 500 });
  }
}

/** POST: add a new player to the roster. */
export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { username } = await request.json();
    if (!username?.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const existing = await queryOne('SELECT id FROM Player WHERE username = ?', [username.trim()]);
    if (existing) {
      return NextResponse.json({ error: 'A player with that username already exists' }, { status: 409 });
    }

    const id = uuid();
    const now = new Date().toISOString();
    await query(
      'INSERT INTO Player (id, username, active, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?)',
      [id, username.trim(), now, now]
    );

    // Stat values are lazily created at default 5 on first profile load,
    // so no per-stat seeding is needed here.
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error creating player:', error);
    return NextResponse.json({ error: 'Failed to create player', details: error.message }, { status: 500 });
  }
}

/** PATCH: deactivate or reactivate a player (never hard-deletes). */
export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { playerId, active } = await request.json();
    if (!playerId || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'playerId and active(boolean) are required' }, { status: 400 });
    }

    const player = await queryOne('SELECT id FROM Player WHERE id = ?', [playerId]);
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    const now = new Date().toISOString();
    await query(
      'UPDATE Player SET active = ?, archivedAt = ?, updatedAt = ? WHERE id = ?',
      [active ? 1 : 0, active ? null : now, now, playerId]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating player:', error);
    return NextResponse.json({ error: 'Failed to update player', details: error.message }, { status: 500 });
  }
}

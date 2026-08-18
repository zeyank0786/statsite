import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { featureLockMessage } from '@/lib/featureLocks';
import { query, queryOne, queryAll } from '@/lib/db';
import { ensureAmbitionTables, listAmbitions, getActiveCelebrations } from '@/lib/ambitions';
import { sendPushToPlayers } from '@/lib/push';
import { v4 as uuid } from 'uuid';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 120;
const DETAIL_MAX = 600;

async function getActor(): Promise<{ playerId: string; isAdmin: boolean } | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  const userId = (session?.user as any)?.id;
  if (!playerId) return null;
  let isAdmin = false;
  if (userId) {
    const row = await queryOne('SELECT isAdmin FROM User WHERE id = ?', [userId]);
    isAdmin = Boolean(row && Number(row.isAdmin));
  }
  return { playerId: String(playerId), isAdmin };
}

/** Validate an optional linked stat, returning its canonical label. */
async function resolveStat(statId: unknown): Promise<{ statId: string | null; statLabel: string | null }> {
  if (!statId || typeof statId !== 'string') return { statId: null, statLabel: null };
  const stat = await queryOne('SELECT id, label FROM Stat WHERE id = ?', [statId]);
  if (!stat) return { statId: null, statLabel: null };
  return { statId: String(stat.id), statLabel: String(stat.label) };
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [ambitions, celebrations] = await Promise.all([listAmbitions(), getActiveCelebrations()]);
    return NextResponse.json({
      ambitions,
      celebrations,
      playerId: actor.playerId,
      isAdmin: actor.isAdmin,
    });
  } catch (error: any) {
    console.error('Error listing ambitions:', error);
    return NextResponse.json(errorPayload('Failed to load ambitions', error), { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lockMsg = await featureLockMessage(actor.playerId, 'ambitions');
  if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

  try {
    await ensureAmbitionTables();
    const body = await request.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const detail = typeof body?.detail === 'string' ? body.detail.trim() : '';
    if (!title) return NextResponse.json({ error: 'Give your ambition a title' }, { status: 400 });
    if (title.length > TITLE_MAX) {
      return NextResponse.json({ error: `Title must be ${TITLE_MAX} characters or fewer` }, { status: 400 });
    }
    if (detail.length > DETAIL_MAX) {
      return NextResponse.json({ error: `Detail must be ${DETAIL_MAX} characters or fewer` }, { status: 400 });
    }

    // Admins can file an ambition for someone else; everyone else, only their own.
    const owner = actor.isAdmin && typeof body?.playerId === 'string' ? String(body.playerId) : actor.playerId;
    const player = await queryOne('SELECT active FROM Player WHERE id = ?', [owner]);
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    const { statId, statLabel } = await resolveStat(body?.statId);

    const id = uuid();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO Ambition (id, playerId, title, detail, statId, statLabel, status, completedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
      [id, owner, title, detail || null, statId, statLabel, now, now]
    );

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error creating ambition:', error);
    return NextResponse.json(errorPayload('Failed to create ambition', error), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureAmbitionTables();
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const ambition = await queryOne('SELECT id, playerId, title, status FROM Ambition WHERE id = ?', [id]);
    if (!ambition) return NextResponse.json({ error: 'Ambition not found' }, { status: 404 });

    const canManage = actor.isAdmin || String(ambition.playerId) === actor.playerId;
    if (!canManage) {
      return NextResponse.json({ error: 'You can only change your own ambitions' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const action = typeof body?.action === 'string' ? body.action : null;

    // Self-declared completion — fires the crew-wide celebration.
    if (action === 'complete') {
      if (String(ambition.status) === 'completed') {
        return NextResponse.json({ error: 'Already completed' }, { status: 400 });
      }
      await query("UPDATE Ambition SET status = 'completed', completedAt = ?, updatedAt = ? WHERE id = ?", [
        now,
        now,
        id,
      ]);

      // Tell the whole crew — this is a big moment, everyone celebrates.
      try {
        const owner = await queryOne('SELECT username FROM Player WHERE id = ?', [String(ambition.playerId)]);
        const players = await queryAll('SELECT id FROM Player WHERE active = 1');
        const ids = (players as any[]).map((p) => String(p.id));
        await sendPushToPlayers(ids, {
          title: `🎉 ${String(owner?.username || 'Someone')} completed an ambition!`,
          body: String(ambition.title),
          url: '/ambitions',
          tag: `ambition-complete-${id}`,
        });
      } catch (e) {
        console.error('Ambition completion push failed (ignored):', e);
      }

      return NextResponse.json({ success: true, completed: true });
    }

    if (action === 'reopen') {
      await query("UPDATE Ambition SET status = 'active', completedAt = NULL, updatedAt = ? WHERE id = ?", [now, id]);
      return NextResponse.json({ success: true, reopened: true });
    }

    // Otherwise it's an edit of the fields.
    const title = typeof body?.title === 'string' ? body.title.trim() : null;
    const detail = typeof body?.detail === 'string' ? body.detail.trim() : null;
    if (title !== null) {
      if (!title) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      if (title.length > TITLE_MAX) {
        return NextResponse.json({ error: `Title must be ${TITLE_MAX} characters or fewer` }, { status: 400 });
      }
      await query('UPDATE Ambition SET title = ?, updatedAt = ? WHERE id = ?', [title, now, id]);
    }
    if (detail !== null) {
      if (detail.length > DETAIL_MAX) {
        return NextResponse.json({ error: `Detail must be ${DETAIL_MAX} characters or fewer` }, { status: 400 });
      }
      await query('UPDATE Ambition SET detail = ?, updatedAt = ? WHERE id = ?', [detail || null, now, id]);
    }
    if (body?.statId !== undefined) {
      const { statId, statLabel } = await resolveStat(body?.statId);
      await query('UPDATE Ambition SET statId = ?, statLabel = ?, updatedAt = ? WHERE id = ?', [
        statId,
        statLabel,
        now,
        id,
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating ambition:', error);
    return NextResponse.json(errorPayload('Failed to update ambition', error), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureAmbitionTables();
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const ambition = await queryOne('SELECT playerId FROM Ambition WHERE id = ?', [id]);
    if (!ambition) return NextResponse.json({ error: 'Ambition not found' }, { status: 404 });

    const canManage = actor.isAdmin || String(ambition.playerId) === actor.playerId;
    if (!canManage) {
      return NextResponse.json({ error: 'You can only delete your own ambitions' }, { status: 403 });
    }

    // Unlink any reward suggestion but leave its vote history intact.
    await query('UPDATE Suggestion SET ambitionId = NULL WHERE ambitionId = ?', [id]).catch(() => {});
    await query('DELETE FROM Ambition WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting ambition:', error);
    return NextResponse.json(errorPayload('Failed to delete ambition', error), { status: 500 });
  }
}

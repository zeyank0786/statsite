import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import {
  ensureReminderTables,
  listRemindersForPlayer,
  validateReminderInput,
  getPlayerTimezone,
  localNowParts,
  mapReminderRow,
} from '@/lib/reminders';
import { firePush } from '@/lib/push';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Reminders CRUD.
 *
 * A player manages their own reminders. An admin can also manage reminders
 * for anyone else (pass ?playerId= / playerId in the body); those are flagged
 * isAdminSet so the recipient sees them but can't edit or delete them.
 */

async function getActor(): Promise<{ playerId: string; isAdmin: boolean } | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return null;
  return { playerId: String(playerId), isAdmin: Boolean((session?.user as any)?.isAdmin) };
}

/** Can `actor` manage the reminder row? Owner for their own, admin for anything. */
function canManage(actor: { playerId: string; isAdmin: boolean }, r: { playerId: string; isAdminSet: boolean }) {
  if (actor.isAdmin) return true;
  if (r.isAdminSet) return false; // recipient can't touch admin-set reminders
  return r.playerId === actor.playerId;
}

/** GET — list reminders for a target (default self). Admin may target anyone. */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureReminderTables();
    const requested = new URL(request.url).searchParams.get('playerId');
    const targetId = requested && requested !== actor.playerId ? requested : actor.playerId;

    if (targetId !== actor.playerId && !actor.isAdmin) {
      return NextResponse.json({ error: 'Admins only' }, { status: 403 });
    }

    const reminders = await listRemindersForPlayer(targetId);
    const timezone = await getPlayerTimezone(targetId);
    const target = await queryOne('SELECT username FROM Player WHERE id = ?', [targetId]);

    // Admins get the roster so the UI can offer a "manage for…" picker.
    let players: { id: string; username: string }[] | undefined;
    if (actor.isAdmin) {
      const rows = await queryAll('SELECT id, username FROM Player WHERE active = 1 ORDER BY username ASC');
      players = (rows as any[]).map((p) => ({ id: String(p.id), username: String(p.username) }));
    }

    return NextResponse.json({
      reminders,
      timezone,
      targetId,
      targetName: target ? String(target.username) : 'Unknown',
      isAdmin: actor.isAdmin,
      isSelf: targetId === actor.playerId,
      players,
    });
  } catch (error: any) {
    console.error('Error listing reminders:', error);
    return NextResponse.json({ error: 'Failed to load reminders', details: error.message }, { status: 500 });
  }
}

/** POST — create a reminder for self, or (admin) for another player. */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const requestedTarget = body?.playerId ? String(body.playerId) : actor.playerId;
    const forSomeoneElse = requestedTarget !== actor.playerId;

    if (forSomeoneElse && !actor.isAdmin) {
      return NextResponse.json({ error: 'Only admins can set reminders for others' }, { status: 403 });
    }

    const target = await queryOne('SELECT id, username FROM Player WHERE id = ?', [requestedTarget]);
    if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    // Validate against the TARGET's timezone (so "in the past" is judged locally).
    const tz = await getPlayerTimezone(requestedTarget);
    const todayKey = localNowParts(tz).dateKey;
    const parsed = validateReminderInput(body, todayKey);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const v = parsed.value;

    await ensureReminderTables();
    const id = uuid();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO Reminder
         (id, playerId, title, body, frequency, timeMinutes, daysOfWeek, dayOfMonth, onceDate,
          createdById, isAdminSet, enabled, lastFiredKey, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
      [
        id,
        requestedTarget,
        v.title,
        v.body,
        v.frequency,
        v.timeMinutes,
        v.daysOfWeek.length ? v.daysOfWeek.join(',') : null,
        v.dayOfMonth,
        v.onceDate,
        actor.playerId,
        forSomeoneElse ? 1 : 0,
        now,
        now,
      ]
    );

    // Let the recipient know an admin scheduled something for them.
    if (forSomeoneElse) {
      firePush([requestedTarget], {
        title: '🔔 New reminder set for you',
        body: `An admin scheduled "${v.title}".`,
        url: '/reminders',
        tag: 'reminder-admin-set',
      });
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error creating reminder:', error);
    return NextResponse.json({ error: 'Failed to create reminder', details: error.message }, { status: 500 });
  }
}

/** PATCH — edit a reminder, or quick-toggle its enabled flag. */
export async function PATCH(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const id = String(body?.id ?? '');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await ensureReminderTables();
    const row = await queryOne('SELECT * FROM Reminder WHERE id = ?', [id]);
    if (!row) return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    const existing = mapReminderRow(row);
    if (!canManage(actor, existing)) {
      return NextResponse.json({ error: 'You can’t edit this reminder' }, { status: 403 });
    }

    const now = new Date().toISOString();

    // Quick enable/disable toggle (no full payload required).
    if (typeof body.enabled === 'boolean' && body.frequency === undefined) {
      await query('UPDATE Reminder SET enabled = ?, updatedAt = ? WHERE id = ?', [
        body.enabled ? 1 : 0,
        now,
        id,
      ]);
      return NextResponse.json({ success: true });
    }

    // Full edit — revalidate the whole schedule against the owner's timezone.
    const tz = await getPlayerTimezone(existing.playerId);
    const todayKey = localNowParts(tz).dateKey;
    const parsed = validateReminderInput(body, todayKey);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const v = parsed.value;
    const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled ? 1 : 0;

    await query(
      `UPDATE Reminder SET
         title = ?, body = ?, frequency = ?, timeMinutes = ?, daysOfWeek = ?, dayOfMonth = ?, onceDate = ?,
         enabled = ?, updatedAt = ?
       WHERE id = ?`,
      [
        v.title,
        v.body,
        v.frequency,
        v.timeMinutes,
        v.daysOfWeek.length ? v.daysOfWeek.join(',') : null,
        v.dayOfMonth,
        v.onceDate,
        enabled,
        now,
        id,
      ]
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating reminder:', error);
    return NextResponse.json({ error: 'Failed to update reminder', details: error.message }, { status: 500 });
  }
}

/** DELETE — remove a reminder. */
export async function DELETE(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const id = String(body?.id ?? '');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await ensureReminderTables();
    const row = await queryOne('SELECT * FROM Reminder WHERE id = ?', [id]);
    if (!row) return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    const existing = mapReminderRow(row);
    if (!canManage(actor, existing)) {
      return NextResponse.json({ error: 'You can’t delete this reminder' }, { status: 403 });
    }

    await query('DELETE FROM Reminder WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting reminder:', error);
    return NextResponse.json({ error: 'Failed to delete reminder', details: error.message }, { status: 500 });
  }
}

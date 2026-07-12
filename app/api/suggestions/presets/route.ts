import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { featureLockMessage } from '@/lib/featureLocks';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

const ALLOWED_DELTAS = [-2, -1, 1, 2];

/**
 * Suggestion presets — reusable templates for changes the crew hands out
 * regularly (e.g. "Gym session: +1 Discipline, +1 Physical Endurance").
 * A preset stores stats+deltas and a reason; the subject (and any tweaks)
 * are chosen fresh on every use, so using one never mutates the preset.
 * Any active player can create; creator or an admin can edit/delete.
 */

async function getSessionActor(): Promise<{ playerId: string; isAdmin: boolean } | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return null;
  return { playerId: String(playerId), isAdmin: Boolean((session?.user as any)?.isAdmin) };
}

/** The table is additive — create it on first use, no manual migration. */
async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS SuggestionPreset (
       id          TEXT PRIMARY KEY,
       name        TEXT NOT NULL,
       createdById TEXT NOT NULL,
       reason      TEXT NOT NULL,
       changes     TEXT NOT NULL,
       createdAt   TEXT NOT NULL,
       updatedAt   TEXT NOT NULL
     )`
  );
}

function parseChanges(raw: unknown): { statId: string; delta: number }[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set<string>();
  const out: { statId: string; delta: number }[] = [];
  for (const c of raw) {
    const statId = String((c as any)?.statId || '');
    const delta = Number((c as any)?.delta);
    if (!statId || seen.has(statId) || !ALLOWED_DELTAS.includes(delta)) return null;
    seen.add(statId);
    out.push({ statId, delta });
  }
  return out;
}

/** GET: all presets, changes enriched with current stat labels. */
export async function GET() {
  const actor = await getSessionActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureTable();
    const [presets, stats, players] = await Promise.all([
      queryAll('SELECT * FROM SuggestionPreset ORDER BY name ASC'),
      queryAll('SELECT id, code, label FROM Stat'),
      queryAll('SELECT id, username FROM Player'),
    ]);
    const statById = new Map((stats as any[]).map((s) => [String(s.id), s]));
    const nameById = new Map((players as any[]).map((p) => [String(p.id), String(p.username)]));

    return NextResponse.json(
      (presets as any[]).map((p) => {
        let changes: any[] = [];
        try {
          changes = JSON.parse(String(p.changes));
        } catch {
          /* corrupt row — show empty */
        }
        return {
          id: String(p.id),
          name: String(p.name),
          reason: String(p.reason),
          createdById: String(p.createdById),
          createdByName: nameById.get(String(p.createdById)) || 'Unknown',
          canManage: actor.isAdmin || String(p.createdById) === actor.playerId,
          changes: changes.map((c: any) => ({
            statId: String(c.statId),
            delta: Number(c.delta),
            label: statById.get(String(c.statId))?.label
              ? String(statById.get(String(c.statId)).label)
              : 'Deleted stat',
            code: statById.get(String(c.statId))?.code
              ? String(statById.get(String(c.statId)).code)
              : '?',
          })),
        };
      })
    );
  } catch (error: any) {
    console.error('Error listing presets:', error);
    return NextResponse.json({ error: 'Failed to list presets', details: error.message }, { status: 500 });
  }
}

/** POST: create a preset. Any active player. */
export async function POST(request: Request) {
  const actor = await getSessionActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lockMsg = await featureLockMessage(actor.playerId, 'suggest');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { name, reason, changes } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Give the preset a name' }, { status: 400 });
    if (!reason?.trim()) return NextResponse.json({ error: 'Preset needs a reason' }, { status: 400 });
    const parsed = parseChanges(changes);
    if (!parsed) {
      return NextResponse.json({ error: 'changes must be distinct stats with deltas of -2/-1/+1/+2' }, { status: 400 });
    }

    const player = await queryOne('SELECT active FROM Player WHERE id = ?', [actor.playerId]);
    if (!player || !Number(player.active)) {
      return NextResponse.json({ error: 'Only active players can create presets' }, { status: 403 });
    }

    const placeholders = parsed.map(() => '?').join(',');
    const found = await queryAll(
      `SELECT id FROM Stat WHERE id IN (${placeholders})`,
      parsed.map((c) => c.statId)
    );
    if (found.length !== parsed.length) {
      return NextResponse.json({ error: 'One or more stats were not found' }, { status: 400 });
    }

    await ensureTable();
    const id = uuid();
    const now = new Date().toISOString();
    await query(
      'INSERT INTO SuggestionPreset (id, name, createdById, reason, changes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name.trim(), actor.playerId, reason.trim(), JSON.stringify(parsed), now, now]
    );
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error creating preset:', error);
    return NextResponse.json({ error: 'Failed to create preset', details: error.message }, { status: 500 });
  }
}

/** PATCH: edit a preset (creator or admin). */
export async function PATCH(request: Request) {
  const actor = await getSessionActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { presetId, name, reason, changes } = await request.json();
    if (!presetId) return NextResponse.json({ error: 'presetId required' }, { status: 400 });

    await ensureTable();
    const preset = await queryOne('SELECT createdById FROM SuggestionPreset WHERE id = ?', [presetId]);
    if (!preset) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    if (!actor.isAdmin && String(preset.createdById) !== actor.playerId) {
      return NextResponse.json({ error: 'Only the creator or an admin can edit this preset' }, { status: 403 });
    }

    const now = new Date().toISOString();
    if (name?.trim()) await query('UPDATE SuggestionPreset SET name = ?, updatedAt = ? WHERE id = ?', [name.trim(), now, presetId]);
    if (reason?.trim()) await query('UPDATE SuggestionPreset SET reason = ?, updatedAt = ? WHERE id = ?', [reason.trim(), now, presetId]);
    if (changes !== undefined) {
      const parsed = parseChanges(changes);
      if (!parsed) {
        return NextResponse.json({ error: 'changes must be distinct stats with deltas of -2/-1/+1/+2' }, { status: 400 });
      }
      await query('UPDATE SuggestionPreset SET changes = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(parsed), now, presetId]);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating preset:', error);
    return NextResponse.json({ error: 'Failed to update preset', details: error.message }, { status: 500 });
  }
}

/** DELETE: remove a preset (creator or admin). */
export async function DELETE(request: Request) {
  const actor = await getSessionActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { presetId } = await request.json();
    if (!presetId) return NextResponse.json({ error: 'presetId required' }, { status: 400 });

    await ensureTable();
    const preset = await queryOne('SELECT createdById FROM SuggestionPreset WHERE id = ?', [presetId]);
    if (!preset) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    if (!actor.isAdmin && String(preset.createdById) !== actor.playerId) {
      return NextResponse.json({ error: 'Only the creator or an admin can delete this preset' }, { status: 403 });
    }

    await query('DELETE FROM SuggestionPreset WHERE id = ?', [presetId]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting preset:', error);
    return NextResponse.json({ error: 'Failed to delete preset', details: error.message }, { status: 500 });
  }
}

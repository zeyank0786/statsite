import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Admin controls for visibility, prerequisites and lock overrides.
 * POST body: { action, ...payload }:
 *   setVisibility   { statId, playerId, hidden }         (hidden=false deletes the row: absence = visible)
 *   setCategoryVisibility { categoryId, playerId, hidden } (bulk across the category's stats)
 *   addPrereq       { statId, requiredStatId? | requiredCategoryId?, thresholdValue }
 *   deletePrereq    { prereqId }
 *   setOverride     { statId, playerId, forcedState }    ('locked' | 'unlocked' | null clears)
 */
export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const body = await request.json();
    const { action } = body;
    const now = new Date().toISOString();

    switch (action) {
      case 'setVisibility': {
        const { statId, playerId, hidden } = body;
        if (!statId || !playerId || typeof hidden !== 'boolean') {
          return NextResponse.json({ error: 'statId, playerId, hidden(boolean) required' }, { status: 400 });
        }
        await query('DELETE FROM StatVisibility WHERE statId = ? AND playerId = ?', [statId, playerId]);
        if (hidden) {
          await query(
            'INSERT INTO StatVisibility (id, statId, playerId, hidden, createdAt) VALUES (?, ?, ?, 1, ?)',
            [uuid(), statId, playerId, now]
          );
        }
        return NextResponse.json({ success: true });
      }

      case 'setCategoryVisibility': {
        const { categoryId, playerId, hidden } = body;
        if (!categoryId || !playerId || typeof hidden !== 'boolean') {
          return NextResponse.json({ error: 'categoryId, playerId, hidden(boolean) required' }, { status: 400 });
        }
        const stats = await queryAll('SELECT id FROM Stat WHERE categoryId = ?', [categoryId]);
        for (const stat of stats as any[]) {
          await query('DELETE FROM StatVisibility WHERE statId = ? AND playerId = ?', [stat.id, playerId]);
          if (hidden) {
            await query(
              'INSERT INTO StatVisibility (id, statId, playerId, hidden, createdAt) VALUES (?, ?, ?, 1, ?)',
              [uuid(), String(stat.id), playerId, now]
            );
          }
        }
        return NextResponse.json({ success: true, affected: stats.length });
      }

      case 'addPrereq': {
        const { statId, requiredStatId, requiredCategoryId, thresholdValue } = body;
        if (!statId || typeof thresholdValue !== 'number') {
          return NextResponse.json({ error: 'statId and thresholdValue required' }, { status: 400 });
        }
        // Exactly one of the two reference types
        if ((!requiredStatId && !requiredCategoryId) || (requiredStatId && requiredCategoryId)) {
          return NextResponse.json(
            { error: 'Set exactly one of requiredStatId or requiredCategoryId' },
            { status: 400 }
          );
        }
        if (requiredStatId === statId) {
          return NextResponse.json({ error: 'A stat cannot be its own prerequisite' }, { status: 400 });
        }
        const id = uuid();
        await query(
          `INSERT INTO StatPrerequisite (id, statId, requiredStatId, requiredCategoryId, comparator, thresholdValue, createdAt)
           VALUES (?, ?, ?, ?, '>=', ?, ?)`,
          [id, statId, requiredStatId || null, requiredCategoryId || null, thresholdValue, now]
        );
        return NextResponse.json({ success: true, id });
      }

      case 'deletePrereq': {
        const { prereqId } = body;
        if (!prereqId) return NextResponse.json({ error: 'prereqId required' }, { status: 400 });
        await query('DELETE FROM StatPrerequisite WHERE id = ?', [prereqId]);
        return NextResponse.json({ success: true });
      }

      case 'setOverride': {
        const { statId, playerId, forcedState } = body;
        if (!statId || !playerId) {
          return NextResponse.json({ error: 'statId and playerId required' }, { status: 400 });
        }
        await query('DELETE FROM StatLockOverride WHERE statId = ? AND playerId = ?', [statId, playerId]);
        if (forcedState === 'locked' || forcedState === 'unlocked') {
          await query(
            'INSERT INTO StatLockOverride (id, statId, playerId, forcedState, createdAt) VALUES (?, ?, ?, ?, ?)',
            [uuid(), statId, playerId, forcedState, now]
          );
        }
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error in gating action:', error);
    return NextResponse.json({ error: 'Gating action failed', details: error.message }, { status: 500 });
  }
}

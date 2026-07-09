import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Admin CRUD for the global category/stat catalog.
 * GET returns everything the admin catalog UI needs in one shot.
 * POST body: { action, ...payload } — one endpoint keeps the surface small:
 *   createCategory { label, emoji }
 *   updateCategory { categoryId, label?, emoji? }
 *   deleteCategory { categoryId }            (only when it has no stats)
 *   createStat     { categoryId, label }     (code auto-generated)
 *   updateStat     { statId, label?, categoryId? }
 *   deleteStat     { statId }                (destroys that stat's history — UI double-confirms)
 */

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const [categories, stats, visibility, prereqs, overrides, players] = await Promise.all([
      queryAll('SELECT id, code, label, emoji FROM Category ORDER BY createdAt ASC'),
      queryAll('SELECT id, code, label, categoryId FROM Stat ORDER BY code ASC'),
      queryAll('SELECT id, statId, playerId, hidden FROM StatVisibility'),
      queryAll(
        `SELECT pr.id, pr.statId, pr.requiredStatId, pr.requiredCategoryId, pr.comparator, pr.thresholdValue,
                rs.label as requiredStatLabel, rc.label as requiredCategoryLabel
         FROM StatPrerequisite pr
         LEFT JOIN Stat rs ON pr.requiredStatId = rs.id
         LEFT JOIN Category rc ON pr.requiredCategoryId = rc.id`
      ),
      queryAll('SELECT id, statId, playerId, forcedState FROM StatLockOverride'),
      queryAll('SELECT id, username, active FROM Player ORDER BY username ASC'),
    ]);

    return NextResponse.json({ categories, stats, visibility, prereqs, overrides, players });
  } catch (error: any) {
    console.error('Error loading catalog:', error);
    return NextResponse.json({ error: 'Failed to load catalog', details: error.message }, { status: 500 });
  }
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12);
}

async function nextStatCode(categoryId: string): Promise<string> {
  const cat = await queryOne('SELECT code FROM Category WHERE id = ?', [categoryId]);
  if (!cat) throw new Error('Category not found');
  const catCode = String(cat.code).toLowerCase();

  const existing = await queryAll('SELECT code FROM Stat WHERE categoryId = ?', [categoryId]);
  const letters = new Set(
    (existing as any[]).map((s) => String(s.code).split('-')[1]?.toLowerCase()).filter(Boolean)
  );
  // a..z, then aa, ab...
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);
    if (!letters.has(letter)) return `${catCode}-${letter}`;
  }
  for (let i = 0; i < 26 * 26; i++) {
    const letter = String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    if (!letters.has(letter)) return `${catCode}-${letter}`;
  }
  throw new Error('No stat codes left in this category');
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const body = await request.json();
    const { action } = body;
    const now = new Date().toISOString();

    switch (action) {
      case 'createCategory': {
        const { label, emoji } = body;
        if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 });
        let code = slugify(label);
        const clash = await queryOne('SELECT id FROM Category WHERE code = ?', [code]);
        if (clash) code = `${code}-${Math.random().toString(36).slice(2, 5)}`;
        const id = uuid();
        await query('INSERT INTO Category (id, code, label, emoji, createdAt) VALUES (?, ?, ?, ?, ?)', [
          id,
          code,
          label.trim(),
          emoji || '⭐',
          now,
        ]);
        return NextResponse.json({ success: true, id, code });
      }

      case 'updateCategory': {
        const { categoryId, label, emoji } = body;
        if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 });
        if (label?.trim()) await query('UPDATE Category SET label = ? WHERE id = ?', [label.trim(), categoryId]);
        if (emoji) await query('UPDATE Category SET emoji = ? WHERE id = ?', [emoji, categoryId]);
        return NextResponse.json({ success: true });
      }

      case 'deleteCategory': {
        const { categoryId } = body;
        const statCount = await queryOne('SELECT COUNT(*) as c FROM Stat WHERE categoryId = ?', [categoryId]);
        if (Number(statCount?.c) > 0) {
          return NextResponse.json(
            { error: 'Category still has stats — move or delete them first' },
            { status: 400 }
          );
        }
        await query('DELETE FROM EvidenceCategory WHERE categoryId = ?', [categoryId]);
        await query('DELETE FROM StatPrerequisite WHERE requiredCategoryId = ?', [categoryId]);
        await query('DELETE FROM Category WHERE id = ?', [categoryId]);
        return NextResponse.json({ success: true });
      }

      case 'createStat': {
        const { categoryId, label } = body;
        if (!categoryId || !label?.trim()) {
          return NextResponse.json({ error: 'categoryId and label are required' }, { status: 400 });
        }
        const code = await nextStatCode(categoryId);
        const id = uuid();
        await query('INSERT INTO Stat (id, code, label, categoryId, createdAt) VALUES (?, ?, ?, ?, ?)', [
          id,
          code,
          label.trim(),
          categoryId,
          now,
        ]);
        return NextResponse.json({ success: true, id, code });
      }

      case 'updateStat': {
        const { statId, label, categoryId } = body;
        if (!statId) return NextResponse.json({ error: 'statId required' }, { status: 400 });
        if (label?.trim()) await query('UPDATE Stat SET label = ? WHERE id = ?', [label.trim(), statId]);
        if (categoryId) {
          // Moving category keeps the old code prefix — regenerate so code matches its category
          const newCode = await nextStatCode(categoryId);
          await query('UPDATE Stat SET categoryId = ?, code = ? WHERE id = ?', [categoryId, newCode, statId]);
        }
        return NextResponse.json({ success: true });
      }

      case 'deleteStat': {
        const { statId } = body;
        if (!statId) return NextResponse.json({ error: 'statId required' }, { status: 400 });

        // Destructive: removes the stat AND all data tied to it, everywhere.
        // The admin UI warns loudly and suggests hiding instead.
        const statValueIds = (
          await queryAll('SELECT id FROM StatValue WHERE statId = ?', [statId])
        ).map((r: any) => String(r.id));

        for (const svId of statValueIds) {
          await query('DELETE FROM StatHistory WHERE statValueId = ?', [svId]);
        }
        await query('DELETE FROM StatValue WHERE statId = ?', [statId]);
        await query('DELETE FROM ReviewSessionStat WHERE statId = ?', [statId]);
        await query('DELETE FROM StatVisibility WHERE statId = ?', [statId]);
        await query('DELETE FROM StatPrerequisite WHERE statId = ? OR requiredStatId = ?', [statId, statId]);
        await query('DELETE FROM StatLockOverride WHERE statId = ?', [statId]);
        const suggestionIds = (
          await queryAll('SELECT id FROM Suggestion WHERE statId = ?', [statId])
        ).map((r: any) => String(r.id));
        for (const sgId of suggestionIds) {
          await query('DELETE FROM Vote WHERE suggestionId = ?', [sgId]);
          await query('DELETE FROM SuggestionEvidence WHERE suggestionId = ?', [sgId]);
        }
        await query('DELETE FROM Suggestion WHERE statId = ?', [statId]);
        const stat = await queryOne('SELECT code FROM Stat WHERE id = ?', [statId]);
        if (stat) {
          try {
            await query('DELETE FROM Target WHERE statCode = ?', [String(stat.code)]);
          } catch {
            /* Target table may not exist in older environments */
          }
        }
        await query('DELETE FROM Stat WHERE id = ?', [statId]);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error in catalog action:', error);
    return NextResponse.json({ error: 'Catalog action failed', details: error.message }, { status: 500 });
  }
}

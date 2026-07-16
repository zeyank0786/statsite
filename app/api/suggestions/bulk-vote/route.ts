import { NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { resolveSuggestion } from '@/lib/suggestionEngine';
import { featureLockMessage } from '@/lib/featureLocks';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Cast the same yes/no vote on many pending suggestions at once (bulk vote
 * from the suggestions page or a batch card). Each suggestion is validated
 * independently — ineligible ones are skipped with a reason, never failing
 * the whole request.
 *
 * POST { suggestionIds: string[], vote: 'yes' | 'no' }
 * → { results: [{ id, ok, skipped?, resolution? }] }
 */
export async function POST(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const voterId = (session.user as any)?.playerId;
    if (!voterId) return NextResponse.json({ error: 'No player linked to this account' }, { status: 400 });

    const { suggestionIds, vote } = await request.json();
    if (vote !== 'yes' && vote !== 'no') {
      return NextResponse.json({ error: 'vote must be "yes" or "no"' }, { status: 400 });
    }
    const ids = [...new Set(Array.isArray(suggestionIds) ? suggestionIds.map(String) : [])];
    if (ids.length === 0 || ids.length > 50) {
      return NextResponse.json({ error: 'Provide 1–50 suggestionIds' }, { status: 400 });
    }

    const voter = await queryOne('SELECT active FROM Player WHERE id = ?', [voterId]);
    if (!voter || !Number(voter.active)) {
      return NextResponse.json({ error: 'Only active players can vote' }, { status: 403 });
    }
    const lockMsg = await featureLockMessage(String(voterId), 'vote');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const results: { id: string; ok: boolean; skipped?: string; resolution?: any }[] = [];
    for (const id of ids) {
      const suggestion = await queryOne('SELECT id, playerId, status FROM Suggestion WHERE id = ?', [id]);
      if (!suggestion) {
        results.push({ id, ok: false, skipped: 'not found' });
        continue;
      }
      if (String(suggestion.status) !== 'pending') {
        results.push({ id, ok: false, skipped: 'already resolved' });
        continue;
      }
      if (String(suggestion.playerId) === String(voterId)) {
        results.push({ id, ok: false, skipped: 'about you' });
        continue;
      }

      const now = new Date().toISOString();
      const existing = await queryOne('SELECT id FROM Vote WHERE suggestionId = ? AND userId = ?', [id, voterId]);
      if (existing) {
        await query('UPDATE Vote SET choice = ? WHERE id = ?', [vote, String(existing.id)]);
      } else {
        await query('INSERT INTO Vote (id, suggestionId, userId, choice, createdAt) VALUES (?, ?, ?, ?, ?)', [
          uuid(),
          id,
          voterId,
          vote,
          now,
        ]);
      }
      const resolution = await resolveSuggestion(id);
      results.push({ id, ok: true, resolution });
    }

    return NextResponse.json({ success: true, results, voted: results.filter((r) => r.ok).length });
  } catch (error: any) {
    console.error('Error bulk voting:', error);
    return NextResponse.json({ error: 'Failed to bulk vote', details: error.message }, { status: 500 });
  }
}

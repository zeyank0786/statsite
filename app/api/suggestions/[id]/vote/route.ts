import { NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { resolveSuggestion } from '@/lib/suggestionEngine';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Cast (or change) a yes/no vote on a pending suggestion.
 * Eligibility: currently-active player who is not the subject.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const voterId = (session.user as any)?.playerId;
    if (!voterId) return NextResponse.json({ error: 'No player linked to this account' }, { status: 400 });

    const { vote } = await request.json();
    if (vote !== 'yes' && vote !== 'no') {
      return NextResponse.json({ error: 'vote must be "yes" or "no"' }, { status: 400 });
    }

    const suggestion = await queryOne('SELECT id, playerId, status FROM Suggestion WHERE id = ?', [id]);
    if (!suggestion) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    if (String(suggestion.status) !== 'pending') {
      return NextResponse.json({ error: 'This suggestion is already resolved' }, { status: 400 });
    }
    if (String(suggestion.playerId) === String(voterId)) {
      return NextResponse.json({ error: "You can't vote on a suggestion about yourself" }, { status: 403 });
    }

    const voter = await queryOne('SELECT active FROM Player WHERE id = ?', [voterId]);
    if (!voter || !Number(voter.active)) {
      return NextResponse.json({ error: 'Only active players can vote' }, { status: 403 });
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
    return NextResponse.json({ success: true, resolution });
  } catch (error: any) {
    console.error('Error voting on suggestion:', error);
    return NextResponse.json({ error: 'Failed to vote', details: error.message }, { status: 500 });
  }
}

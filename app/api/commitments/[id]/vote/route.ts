import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { featureLockMessage } from '@/lib/featureLocks';
import { getEligibleVoterIds } from '@/lib/suggestionEngine';
import { ensureCommitmentTables, resolveVerdict, resolveWithdrawal } from '@/lib/commitments';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * POST { choice }
 *   awaiting_verdict  → choice 'kept' | 'missed'   (strict majority)
 *   withdraw_pending  → choice 'yes'  | 'no'       (must be unanimous)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const voterId = (session.user as any)?.playerId;
    if (!voterId) return NextResponse.json({ error: 'No player linked to this account' }, { status: 400 });

    const lockMsg = await featureLockMessage(String(voterId), 'vote');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { choice } = await request.json();
    await ensureCommitmentTables();

    const c = await queryOne('SELECT playerId, status FROM Commitment WHERE id = ?', [id]);
    if (!c) return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });

    const subjectId = String(c.playerId);
    const status = String(c.status);
    if (status !== 'awaiting_verdict' && status !== 'withdraw_pending') {
      return NextResponse.json({ error: 'There is nothing to vote on right now' }, { status: 400 });
    }
    if (subjectId === String(voterId)) {
      return NextResponse.json({ error: "You can't vote on your own commitment" }, { status: 403 });
    }

    const eligible = await getEligibleVoterIds(subjectId);
    if (!eligible.includes(String(voterId))) {
      return NextResponse.json({ error: "You're not eligible to vote on this" }, { status: 403 });
    }

    const kind = status === 'withdraw_pending' ? 'withdrawal' : 'verdict';
    const valid = kind === 'withdrawal' ? ['yes', 'no'] : ['kept', 'missed'];
    if (!valid.includes(String(choice))) {
      return NextResponse.json({ error: `choice must be one of: ${valid.join(', ')}` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const existing = await queryOne(
      'SELECT id FROM CommitmentVote WHERE commitmentId = ? AND voterId = ? AND kind = ?',
      [id, voterId, kind]
    );
    if (existing) {
      await query('UPDATE CommitmentVote SET choice = ?, createdAt = ? WHERE id = ?', [
        String(choice),
        now,
        String(existing.id),
      ]);
    } else {
      await query(
        'INSERT INTO CommitmentVote (id, commitmentId, voterId, kind, choice, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), id, voterId, kind, String(choice), now]
      );
    }

    const outcome = kind === 'withdrawal' ? await resolveWithdrawal(id) : await resolveVerdict(id);
    return NextResponse.json({ success: true, status: outcome });
  } catch (error: any) {
    console.error('Error voting on commitment:', error);
    return NextResponse.json({ error: 'Failed to vote', details: error.message }, { status: 500 });
  }
}

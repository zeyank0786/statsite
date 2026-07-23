import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { featureLockMessage } from '@/lib/featureLocks';
import { ensureCommitmentTables } from '@/lib/commitments';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * POST { note?, evidenceId? } — log progress on your own commitment.
 * Evidence is reused from the board (and must be yours), so a check-in can
 * carry real proof rather than being a claim on its own.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const playerId = (session.user as any)?.playerId;
    if (!playerId) return NextResponse.json({ error: 'No player linked to this account' }, { status: 400 });

    const lockMsg = await featureLockMessage(String(playerId), 'commit');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { note, evidenceId } = await request.json();
    if (!note?.trim() && !evidenceId) {
      return NextResponse.json({ error: 'Add a note or attach evidence' }, { status: 400 });
    }

    await ensureCommitmentTables();
    const c = await queryOne('SELECT playerId, status FROM Commitment WHERE id = ?', [id]);
    if (!c) return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });
    if (String(c.playerId) !== String(playerId)) {
      return NextResponse.json({ error: 'You can only check in on your own commitments' }, { status: 403 });
    }
    if (String(c.status) !== 'active' && String(c.status) !== 'awaiting_verdict') {
      return NextResponse.json({ error: 'This commitment is closed' }, { status: 400 });
    }

    if (evidenceId) {
      const ev = await queryOne('SELECT playerId FROM Evidence WHERE id = ?', [evidenceId]);
      if (!ev) return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
      if (String(ev.playerId) !== String(playerId)) {
        return NextResponse.json({ error: 'You can only attach your own evidence' }, { status: 403 });
      }
    }

    const checkInId = uuid();
    await query(
      'INSERT INTO CommitmentCheckIn (id, commitmentId, evidenceId, note, createdAt) VALUES (?, ?, ?, ?, ?)',
      [checkInId, id, evidenceId || null, note?.trim() || null, new Date().toISOString()]
    );

    return NextResponse.json({ success: true, id: checkInId });
  } catch (error: any) {
    console.error('Error checking in:', error);
    return NextResponse.json({ error: 'Failed to check in', details: error.message }, { status: 500 });
  }
}

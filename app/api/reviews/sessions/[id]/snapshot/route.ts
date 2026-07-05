import { NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { stats } = await request.json();
    const currentPlayerId = (session.user as any)?.playerId;

    if (!currentPlayerId) {
      return NextResponse.json(
        { error: 'User does not have an associated player' },
        { status: 401 }
      );
    }

    const reviewSession = await queryOne(
      'SELECT targetPlayerId FROM ReviewSession WHERE id = ?',
      [id]
    );

    if (!reviewSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check if snapshot already exists
    const existingSnapshot = await queryOne(
      'SELECT id FROM ReviewSessionSnapshot WHERE sessionId = ?',
      [id]
    );

    if (!existingSnapshot) {
      // Create snapshot
      const snapshotId = uuid();
      const statSnapshots = JSON.stringify(
        stats.map((stat: any) => ({
          statId: stat.statId,
          value: stat.value,
        }))
      );

      await query(
        'INSERT INTO ReviewSessionSnapshot (id, sessionId, playerId, statSnapshots, createdAt) VALUES (?, ?, ?, ?, ?)',
        [snapshotId, id, reviewSession.targetPlayerId, statSnapshots, new Date().toISOString()]
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Snapshot created',
    });
  } catch (error: any) {
    console.error('Error creating snapshot:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create snapshot' },
      { status: 500 }
    );
  }
}

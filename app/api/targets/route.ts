import { NextResponse } from 'next/server';
import { query, queryOne, queryAll } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { featureLockMessage } from '@/lib/featureLocks';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all targets grouped by player
    const targets = await queryAll(
      `SELECT t.id, t.playerId, t.statCode, t.statLabel, p.username
       FROM Target t
       JOIN Player p ON t.playerId = p.id
       ORDER BY p.username, t.createdAt`
    );

    return NextResponse.json(targets);
  } catch (error: any) {
    console.error('Error fetching targets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch targets', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { targets: selectedTargets } = body;
    const currentPlayerId = (session.user as any)?.playerId;

    if (!currentPlayerId) {
      return NextResponse.json(
        { error: 'User does not have an associated player' },
        { status: 401 }
      );
    }

    const lockMsg = await featureLockMessage(String(currentPlayerId), 'targets');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    // Validate max 3 targets
    if (!Array.isArray(selectedTargets) || selectedTargets.length > 3) {
      return NextResponse.json(
        { error: 'Maximum 3 targets allowed' },
        { status: 400 }
      );
    }

    // Delete existing targets for this player
    await query('DELETE FROM Target WHERE playerId = ?', [currentPlayerId]);

    // Insert new targets
    for (const target of selectedTargets) {
      const now = new Date().toISOString();
      await query(
        'INSERT INTO Target (id, playerId, statCode, statLabel, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), currentPlayerId, target.code, target.label, now, now]
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Targets updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating targets:', error);
    return NextResponse.json(
      { error: 'Failed to update targets', details: error.message },
      { status: 500 }
    );
  }
}

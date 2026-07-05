import { NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

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

    const currentPlayerId = (session.user as any)?.playerId;

    if (!currentPlayerId) {
      return NextResponse.json(
        { error: 'User does not have an associated player' },
        { status: 401 }
      );
    }

    const { action = 'confirm' } = await request.json();

    const reviewSession = await queryOne(
      'SELECT id, targetPlayerId FROM ReviewSession WHERE id = ?',
      [id]
    );

    if (!reviewSession) {
      return NextResponse.json(
        { error: 'Review session not found' },
        { status: 404 }
      );
    }

    if (currentPlayerId === reviewSession.targetPlayerId) {
      return NextResponse.json(
        { error: 'You cannot close a review session for your own stats' },
        { status: 403 }
      );
    }

    // If action is 'revert', restore from snapshot
    if (action === 'revert') {
      console.log(`[REVERT] Attempting to revert session ${id}`);
      const snapshot = await queryOne(
        'SELECT statSnapshots FROM ReviewSessionSnapshot WHERE sessionId = ?',
        [id]
      );

      console.log(`[REVERT] Snapshot found:`, !!snapshot);
      if (snapshot) {
        const statSnapshots = JSON.parse(snapshot.statSnapshots as string);
        console.log(`[REVERT] Restoring ${statSnapshots.length} stats for player ${reviewSession.targetPlayerId}`);
        const now = new Date().toISOString();

        // Restore each stat to its snapshot value
        for (const snap of statSnapshots) {
          const existingValue = await queryOne(
            'SELECT id, value FROM StatValue WHERE statId = ? AND playerId = ?',
            [snap.statId, reviewSession.targetPlayerId]
          );

          if (existingValue) {
            const oldValue = existingValue.value;
            console.log(`[REVERT] Restoring ${snap.statId}: ${oldValue} -> ${snap.value}`);
            await query(
              'UPDATE StatValue SET value = ?, updatedAt = ? WHERE id = ?',
              [snap.value, now, existingValue.id]
            );

            // Record the revert in history
            const { v4: uuid } = await import('uuid');
            await query(
              'INSERT INTO StatHistory (id, statValueId, oldValue, newValue, reason, changedById, source, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [uuid(), existingValue.id, oldValue, snap.value, 'Review session reverted', currentPlayerId, 'review_revert', now]
            );
          } else {
            console.log(`[REVERT] No existing value found for ${snap.statId}`);
          }
        }
      } else {
        console.log(`[REVERT] No snapshot found for session ${id}`);
      }
    }

    // Delete notes, snapshot and session (in order to respect foreign keys)
    await query('DELETE FROM StatNote WHERE sessionId = ?', [id]);
    await query('DELETE FROM ReviewSessionSnapshot WHERE sessionId = ?', [id]);
    await query('DELETE FROM ReviewSession WHERE id = ?', [id]);

    return NextResponse.json({
      success: true,
      message: 'Review session closed',
      action,
    });
  } catch (error: any) {
    console.error('Error closing review session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to close review session' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { queryOne, queryAll, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { broadcastUpdate } from '@/lib/realtime';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function PUT(
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

    const { updates } = await request.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: 'Invalid updates' },
        { status: 400 }
      );
    }

    const reviewSession = await queryOne(
      'SELECT targetPlayerId FROM ReviewSession WHERE id = ?',
      [id]
    );

    if (!reviewSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const currentPlayerId = (session.user as any)?.playerId;
    const participant = await queryOne(
      'SELECT role FROM ReviewParticipant WHERE sessionId = ? AND playerId = ?',
      [id, currentPlayerId]
    );

    const isEditor = participant?.role === 'editor' ? true : false;

    if (!isEditor) {
      return NextResponse.json({ error: 'You are not authorized to edit these stats' }, { status: 403 });
    }

    const now = new Date().toISOString();

    // Process all updates
    for (const update of updates) {
      const { statId, value } = update;

      if (value < 0 || value > 10) {
        return NextResponse.json(
          { error: 'Value must be between 0 and 10' },
          { status: 400 }
        );
      }

      const existingValue = await queryOne(
        'SELECT id, value FROM StatValue WHERE statId = ? AND playerId = ?',
        [statId, reviewSession.targetPlayerId]
      );

      let statValueId: string;
      const previousValue = existingValue?.value || 0;

      if (existingValue) {
        statValueId = String((existingValue as any).id);
        await query(
          'UPDATE StatValue SET value = ?, updatedAt = ? WHERE id = ?',
          [value, now, statValueId]
        );
      } else {
        statValueId = uuid();
        await query(
          'INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          [statValueId, statId, reviewSession.targetPlayerId, value, now, now]
        );
      }

      await query(
        'INSERT INTO StatHistory (id, statValueId, oldValue, newValue, reason, changedById, source, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), statValueId, previousValue, value, 'Collaborative review', currentPlayerId, 'review_cycle', now]
      );

      broadcastUpdate(id, {
        type: 'stat_updated',
        statId,
        value,
        timestamp: now,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Stats updated',
    });
  } catch (error: any) {
    console.error('Error saving stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save stats' },
      { status: 500 }
    );
  }
}

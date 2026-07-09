import { NextResponse } from 'next/server';
import { queryOne, queryAll, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { broadcastUpdate } from '@/lib/realtime';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET(
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

    const reviewSession = await queryOne(
      'SELECT id, targetPlayerId FROM ReviewSession WHERE id = ?',
      [id]
    );

    if (!reviewSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const currentPlayerId = (session.user as any)?.playerId;

    if (!currentPlayerId) {
      return NextResponse.json(
        { error: 'User does not have an associated player' },
        { status: 401 }
      );
    }

    const isSubject = currentPlayerId === reviewSession.targetPlayerId;

    const participant = await queryOne(
      'SELECT role FROM ReviewParticipant WHERE sessionId = ? AND playerId = ?',
      [id, currentPlayerId]
    );

    const isEditor = participant?.role === 'editor' ? true : false;

    const player = await queryOne(
      'SELECT username FROM Player WHERE id = ?',
      [reviewSession.targetPlayerId]
    );

    const stats = await queryAll(
      `SELECT
        sv.id,
        s.id as statId,
        s.code,
        s.label,
        c.code as categoryCode,
        c.label as categoryLabel,
        COALESCE(sv.value, 5) as value
      FROM Stat s
      JOIN Category c ON s.categoryId = c.id
      LEFT JOIN StatValue sv ON sv.statId = s.id AND sv.playerId = ?
      ORDER BY c.id, s.id`,
      [reviewSession.targetPlayerId]
    );

    return NextResponse.json({
      stats,
      playerName: player?.username || 'Unknown',
      targetPlayerId: reviewSession.targetPlayerId,
      isEditor,
      isSubject,
    });
  } catch (error: any) {
    console.error('Error fetching review session stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

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

    const { statId, value } = await request.json();

    if (!statId || value === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (value < 0) {
      return NextResponse.json(
        { error: 'Value cannot go below 0' },
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

    return NextResponse.json({
      success: true,
      message: 'Stat updated',
    });
  } catch (error: any) {
    console.error('Error saving stat:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save stat' },
      { status: 500 }
    );
  }
}

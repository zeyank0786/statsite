import { NextResponse } from 'next/server';
import { queryAll, queryOne, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sessions = await queryAll(
      `SELECT
        rs.id,
        p.username as playerName,
        rs.status,
        rs.createdAt
      FROM ReviewSession rs
      JOIN Player p ON rs.targetPlayerId = p.id
      WHERE rs.status IN ('pending', 'in_progress')
      ORDER BY rs.createdAt DESC`
    );

    return NextResponse.json(sessions);
  } catch (error: any) {
    console.error('Error fetching review sessions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch review sessions' },
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

    const currentPlayerId = (session.user as any)?.playerId;
    const { playerId } = await request.json();

    if (!playerId) {
      return NextResponse.json(
        { error: 'Missing required field: playerId' },
        { status: 400 }
      );
    }

    if (!currentPlayerId) {
      return NextResponse.json(
        { error: 'User does not have an associated player' },
        { status: 401 }
      );
    }

    if (currentPlayerId === playerId) {
      return NextResponse.json(
        { error: 'You cannot create a review session for your own stats' },
        { status: 403 }
      );
    }

    let cycle = await queryOne(
      `SELECT id FROM ReviewCycle WHERE label = 'Collaborative Reviews'`
    );

    if (!cycle) {
      const cycleId = uuid();
      await query(
        `INSERT INTO ReviewCycle (id, label, status, createdAt) VALUES (?, ?, ?, ?)`,
        [cycleId, 'Collaborative Reviews', 'in_progress', new Date().toISOString()]
      );
      cycle = { id: cycleId };
    }

    const existing = await queryOne(
      `SELECT id FROM ReviewSession WHERE cycleId = ? AND targetPlayerId = ? AND status IN ('pending', 'in_progress')`,
      [cycle.id, playerId]
    );

    if (existing) {
      return NextResponse.json({
        id: existing.id,
        targetPlayerId: playerId,
        status: 'in_progress',
        message: 'Session already exists',
      });
    }

    const newSessionId = uuid();
    await query(
      `INSERT INTO ReviewSession (id, cycleId, targetPlayerId, status, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [newSessionId, cycle.id, playerId, 'in_progress', new Date().toISOString()]
    );

    return NextResponse.json({
      id: newSessionId,
      targetPlayerId: playerId,
      status: 'in_progress',
      message: 'Review session created',
    });
  } catch (error: any) {
    console.error('Error creating review session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create review session' },
      { status: 500 }
    );
  }
}

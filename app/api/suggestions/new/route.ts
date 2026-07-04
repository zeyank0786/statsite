import { NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    const suggesterId = (session?.user as any)?.playerId;
    if (!suggesterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { playerId, statCode, suggestedNewValue, reason } = await request.json();

    if (!playerId || !statCode || suggestedNewValue === undefined || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (suggestedNewValue < 0 || suggestedNewValue > 10) {
      return NextResponse.json(
        { error: 'Suggested value must be between 0 and 10' },
        { status: 400 }
      );
    }

    const stat = await queryOne(
      'SELECT id FROM Stat WHERE code = ?',
      [statCode]
    );

    if (!stat) {
      return NextResponse.json({ error: 'Stat not found' }, { status: 404 });
    }

    const current = await queryOne(
      'SELECT value FROM StatValue WHERE statId = ? AND playerId = ?',
      [stat.id, playerId]
    );

    if (!current) {
      return NextResponse.json({ error: 'Stat value not found' }, { status: 404 });
    }

    const delta = suggestedNewValue - Number(current.value);

    const suggestionId = uuid();
    await query(
      `INSERT INTO Suggestion (id, playerId, statId, delta, suggestedNewValue, reason, suggestedById, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [suggestionId, playerId, stat.id, delta, suggestedNewValue, reason, suggesterId, 'pending', new Date().toISOString()]
    );

    return NextResponse.json({
      id: suggestionId,
      message: 'Suggestion created successfully'
    });
  } catch (error: any) {
    console.error('Error creating suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to create suggestion', details: error.message },
      { status: 500 }
    );
  }
}

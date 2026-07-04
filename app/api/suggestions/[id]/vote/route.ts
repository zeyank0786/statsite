import { NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';
import { use } from 'react';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await use(params);
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    const playerId = (session?.user as any)?.playerId;
    if (!playerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vote } = await request.json();

    if (!vote || !['yes', 'no'].includes(vote)) {
      return NextResponse.json(
        { error: 'Invalid vote value' },
        { status: 400 }
      );
    }

    const suggestion = await queryOne(
      'SELECT id FROM Suggestion WHERE id = ?',
      [id]
    );

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    const existing = await queryOne(
      'SELECT id FROM Vote WHERE suggestionId = ? AND userId = ?',
      [id, playerId]
    );

    if (existing) {
      return NextResponse.json({ error: 'You already voted on this suggestion' }, { status: 400 });
    }

    const voteId = uuid();
    await query(
      'INSERT INTO Vote (id, suggestionId, userId, choice) VALUES (?, ?, ?, ?)',
      [voteId, id, playerId, vote]
    );

    return NextResponse.json({
      id: voteId,
      message: 'Vote recorded successfully'
    });
  } catch (error: any) {
    console.error('Error voting:', error);
    return NextResponse.json(
      { error: 'Failed to record vote', details: error.message },
      { status: 500 }
    );
  }
}

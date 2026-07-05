import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: playerId } = await params;
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all notes for this player's stats across all review sessions
    const notes = await queryAll(
      `SELECT sn.id, sn.statId, sn.content, sn.createdAt, sn.updatedAt,
              p.username as reviewerName, rs.id as sessionId
       FROM StatNote sn
       JOIN ReviewSession rs ON sn.sessionId = rs.id
       JOIN Player p ON sn.reviewerId = p.id
       WHERE rs.targetPlayerId = ?
       ORDER BY sn.createdAt DESC`,
      [playerId]
    );

    return NextResponse.json(notes);
  } catch (error: any) {
    console.error('Error fetching player notes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes', details: error.message },
      { status: 500 }
    );
  }
}

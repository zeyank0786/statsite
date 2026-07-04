import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    const currentPlayerId = (session?.user as any)?.playerId;

    const sessions = await queryAll(
      `SELECT
        rs.id,
        rs.targetPlayerId,
        p.username as playerName,
        rs.status,
        rs.createdAt,
        COALESCE(rp.role, NULL) as currentUserRole
      FROM ReviewSession rs
      JOIN Player p ON rs.targetPlayerId = p.id
      LEFT JOIN ReviewParticipant rp ON rs.id = rp.sessionId AND rp.playerId = ?
      WHERE rs.status IN ('pending', 'in_progress')
      ORDER BY rs.createdAt DESC`,
      [currentPlayerId || null]
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

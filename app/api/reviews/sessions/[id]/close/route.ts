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

    await query('DELETE FROM ReviewSession WHERE id = ?', [id]);

    return NextResponse.json({
      success: true,
      message: 'Review session closed',
    });
  } catch (error: any) {
    console.error('Error closing review session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to close review session' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

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

    const reviewSession = await prisma.reviewSession.findUnique({
      where: { id },
    });

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

    await prisma.reviewSession.delete({
      where: { id },
    });

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

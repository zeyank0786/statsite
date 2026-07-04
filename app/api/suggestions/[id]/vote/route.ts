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

    const suggestion = await prisma.suggestion.findUnique({
      where: { id },
    });

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    const existing = await prisma.vote.findUnique({
      where: { suggestionId_userId: { suggestionId: id, userId: playerId } },
    });

    if (existing) {
      return NextResponse.json({ error: 'You already voted on this suggestion' }, { status: 400 });
    }

    const voteRecord = await prisma.vote.create({
      data: {
        suggestionId: id,
        userId: playerId,
        choice: vote,
      },
    });

    return NextResponse.json({
      id: voteRecord.id,
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

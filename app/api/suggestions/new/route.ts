import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

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

    const stat = await prisma.stat.findUnique({
      where: { code: statCode },
    });

    if (!stat) {
      return NextResponse.json({ error: 'Stat not found' }, { status: 404 });
    }

    const current = await prisma.statValue.findUnique({
      where: { statId_playerId: { statId: stat.id, playerId } },
    });

    if (!current) {
      return NextResponse.json({ error: 'Stat value not found' }, { status: 404 });
    }

    const delta = suggestedNewValue - current.value;

    const suggestion = await prisma.suggestion.create({
      data: {
        playerId,
        statId: stat.id,
        delta,
        suggestedNewValue,
        reason,
        suggestedById: suggesterId,
        status: 'pending',
      },
    });

    return NextResponse.json({
      id: suggestion.id,
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

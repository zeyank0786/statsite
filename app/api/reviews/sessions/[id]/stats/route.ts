import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { broadcastUpdate } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

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

    const reviewSession = await prisma.reviewSession.findUnique({
      where: { id },
      include: { targetPlayer: true },
    });

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

    const isEditor = await prisma.reviewParticipant.findUnique({
      where: { sessionId_playerId: { sessionId: id, playerId: currentPlayerId } },
    }).then(p => p?.role === 'editor' ? true : false);

    const stats = await prisma.$queryRaw`
      SELECT
        sv.id,
        s.id as "statId",
        s.code,
        s.label,
        c.code as "categoryCode",
        c.label as "categoryLabel",
        COALESCE(sv.value, 5) as value
      FROM "Stat" s
      JOIN "Category" c ON s."categoryId" = c.id
      LEFT JOIN "StatValue" sv ON sv."statId" = s.id AND sv."playerId" = ${reviewSession.targetPlayerId}
      ORDER BY c.id, s.id
    `;

    return NextResponse.json({
      stats,
      playerName: reviewSession.targetPlayer.username,
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
    console.log('STAT UPDATE REQUEST:', { sessionId: id, timestamp: new Date().toISOString() });

    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      console.log('STAT UPDATE FAILED: Not authenticated');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { statId, value } = await request.json();
    console.log('STAT UPDATE PARAMS:', { statId, value });

    if (!statId || value === undefined) {
      console.log('STAT UPDATE FAILED: Missing fields');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (value < 0 || value > 10) {
      console.log('STAT UPDATE FAILED: Invalid value', { value });
      return NextResponse.json(
        { error: 'Value must be between 0 and 10' },
        { status: 400 }
      );
    }

    const reviewSession = await prisma.reviewSession.findUnique({
      where: { id },
    });

    if (!reviewSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const currentPlayerId = (session.user as any)?.playerId;
    const isEditor = await prisma.reviewParticipant.findUnique({
      where: { sessionId_playerId: { sessionId: id, playerId: currentPlayerId } },
    }).then(p => p?.role === 'editor' ? true : false);

    if (!isEditor) {
      return NextResponse.json({ error: 'You are not authorized to edit these stats' }, { status: 403 });
    }

    const now = new Date().toISOString();

    const existingValue = await prisma.statValue.findUnique({
      where: { statId_playerId: { statId, playerId: reviewSession.targetPlayerId } },
    });

    console.log('EXISTING VALUE:', existingValue);

    let statValueId: string;
    const previousValue = existingValue?.value || 0;

    if (existingValue) {
      console.log('UPDATING EXISTING STAT VALUE');
      statValueId = existingValue.id;
      await prisma.statValue.update({
        where: { id: existingValue.id },
        data: { value, updatedAt: now },
      });
    } else {
      console.log('CREATING NEW STAT VALUE');
      const newStatValue = await prisma.statValue.create({
        data: {
          statId,
          playerId: reviewSession.targetPlayerId,
          value,
        },
      });
      statValueId = newStatValue.id;
    }

    console.log('CREATING HISTORY ENTRY:', { statValueId, previousValue, newValue: value });
    await prisma.statHistory.create({
      data: {
        statValueId,
        oldValue: previousValue,
        newValue: value,
        reason: 'Collaborative review',
        changedById: currentPlayerId,
        source: 'review_cycle',
      },
    });

    console.log('STAT UPDATE SUCCESS: Broadcasting update');
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

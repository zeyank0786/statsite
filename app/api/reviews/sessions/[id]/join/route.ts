import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();
const EDITOR_LIMIT = 1;
const REVIEWER_LIMIT = 5;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log('JOIN REQUEST:', { sessionId: id, timestamp: new Date().toISOString() });

    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      console.log('JOIN FAILED: Not authenticated');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentPlayerId = (session.user as any)?.playerId;
    if (!currentPlayerId) {
      console.log('JOIN FAILED: No player ID');
      return NextResponse.json(
        { error: 'User does not have an associated player' },
        { status: 401 }
      );
    }

    const { role } = await request.json();
    console.log('JOIN PARAMS:', { sessionId: id, playerId: currentPlayerId, role });

    if (!role || !['editor', 'reviewer'].includes(role)) {
      console.log('JOIN FAILED: Invalid role', { role });
      return NextResponse.json(
        { error: 'Invalid role. Must be "editor" or "reviewer"' },
        { status: 400 }
      );
    }

    const reviewSession = await prisma.reviewSession.findUnique({
      where: { id },
    });

    if (!reviewSession) {
      console.log('JOIN FAILED: Session not found', { sessionId: id });
      return NextResponse.json(
        { error: 'Review session not found' },
        { status: 404 }
      );
    }

    console.log('FOUND SESSION:', reviewSession);

    if (currentPlayerId === reviewSession.targetPlayerId) {
      console.log('JOIN FAILED: User is subject');
      return NextResponse.json(
        { error: 'You cannot participate in a review session for your own stats' },
        { status: 403 }
      );
    }

    const existing = await prisma.reviewParticipant.findUnique({
      where: { sessionId_playerId: { sessionId: id, playerId: currentPlayerId } },
    });

    if (existing) {
      console.log('ALREADY PARTICIPANT:', existing);
      if (existing.role === role) {
        console.log('JOIN SUCCESS: Already in that role');
        return NextResponse.json(
          { success: true, message: `Already joined as ${role}` },
          { status: 200 }
        );
      } else {
        console.log('UPDATING ROLE:', { from: existing.role, to: role });
        await prisma.reviewParticipant.update({
          where: { id: existing.id },
          data: { role },
        });
      }
    } else {
      console.log('NEW PARTICIPANT');
      if (role === 'editor') {
        if (reviewSession.editorId) {
          console.log('JOIN FAILED: Editor slot taken');
          return NextResponse.json(
            { error: 'Editor slot is already taken' },
            { status: 409 }
          );
        }
      } else {
        const reviewerCount = await prisma.reviewParticipant.count({
          where: { sessionId: id, role: 'reviewer' },
        });

        console.log('REVIEWER COUNT:', reviewerCount);

        if (reviewerCount >= REVIEWER_LIMIT) {
          console.log('JOIN FAILED: Reviewer limit reached');
          return NextResponse.json(
            { error: `Reviewer limit (${REVIEWER_LIMIT}) reached` },
            { status: 409 }
          );
        }
      }

      console.log('INSERTING PARTICIPANT:', { sessionId: id, playerId: currentPlayerId, role });
      await prisma.reviewParticipant.create({
        data: {
          sessionId: id,
          playerId: currentPlayerId,
          role,
        },
      });
    }

    if (role === 'editor') {
      console.log('UPDATING SESSION EDITOR ID:', { sessionId: id, playerId: currentPlayerId });
      await prisma.reviewSession.update({
        where: { id },
        data: { editorId: currentPlayerId },
      });
    }

    console.log('JOIN SUCCESS: Returning 200');
    return NextResponse.json({
      success: true,
      message: `Joined as ${role}`,
      role,
    });
  } catch (error: any) {
    console.error('JOIN ERROR:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to join review session' },
      { status: 500 }
    );
  }
}

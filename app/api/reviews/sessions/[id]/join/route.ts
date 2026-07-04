import { NextResponse } from 'next/server';
import { queryOne, query, queryAll } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';
import { use } from 'react';

export const dynamic = 'force-dynamic';

const EDITOR_LIMIT = 1;
const REVIEWER_LIMIT = 5;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await use(params);

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

    const { role } = await request.json();

    if (!role || !['editor', 'reviewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "editor" or "reviewer"' },
        { status: 400 }
      );
    }

    const reviewSession = await queryOne(
      'SELECT id, targetPlayerId, editorId FROM ReviewSession WHERE id = ?',
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
        { error: 'You cannot participate in a review session for your own stats' },
        { status: 403 }
      );
    }

    const existing = await queryOne(
      'SELECT id, role FROM ReviewParticipant WHERE sessionId = ? AND playerId = ?',
      [id, currentPlayerId]
    );

    if (existing) {
      if (existing.role === role) {
        return NextResponse.json(
          { success: true, message: `Already joined as ${role}` },
          { status: 200 }
        );
      } else {
        await query(
          'UPDATE ReviewParticipant SET role = ? WHERE id = ?',
          [role, existing.id]
        );
      }
    } else {
      if (role === 'editor') {
        if (reviewSession.editorId) {
          return NextResponse.json(
            { error: 'Editor slot is already taken' },
            { status: 409 }
          );
        }
      } else {
        const reviewers = await queryAll(
          'SELECT id FROM ReviewParticipant WHERE sessionId = ? AND role = ?',
          [id, 'reviewer']
        );

        if (reviewers.length >= REVIEWER_LIMIT) {
          return NextResponse.json(
            { error: `Reviewer limit (${REVIEWER_LIMIT}) reached` },
            { status: 409 }
          );
        }
      }

      await query(
        'INSERT INTO ReviewParticipant (id, sessionId, playerId, role) VALUES (?, ?, ?, ?)',
        [uuid(), id, currentPlayerId, role]
      );
    }

    if (role === 'editor') {
      await query(
        'UPDATE ReviewSession SET editorId = ? WHERE id = ?',
        [currentPlayerId, id]
      );
    }

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

import { NextResponse } from 'next/server';
import { queryAll, query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

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

    const notes = await queryAll(
      `SELECT sn.id, sn.statId, sn.content, sn.createdAt, sn.updatedAt, p.username as reviewerName
       FROM StatNote sn
       JOIN Player p ON sn.reviewerId = p.id
       WHERE sn.sessionId = ?
       ORDER BY sn.createdAt DESC`,
      [id]
    );

    return NextResponse.json(notes);
  } catch (error: any) {
    console.error('Error fetching notes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes', details: error.message },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const { statId, content } = body;
    const reviewerId = (session.user as any)?.playerId;

    if (!reviewerId || !statId || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const noteId = uuid();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO StatNote (id, sessionId, statId, reviewerId, content, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [noteId, id, statId, reviewerId, content, now, now]
    );

    return NextResponse.json({
      success: true,
      noteId,
      createdAt: now,
    });
  } catch (error: any) {
    console.error('Error saving note:', error);
    return NextResponse.json(
      { error: 'Failed to save note', details: error.message },
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
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { noteId, content } = body;
    const reviewerId = (session.user as any)?.playerId;

    if (!noteId || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if the user owns this note
    const note = await queryAll(
      `SELECT reviewerId FROM StatNote WHERE id = ? AND sessionId = ?`,
      [noteId, id]
    );

    if (note.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    if (note[0].reviewerId !== reviewerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();
    await query(
      `UPDATE StatNote SET content = ?, updatedAt = ? WHERE id = ?`,
      [content, now, noteId]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating note:', error);
    return NextResponse.json(
      { error: 'Failed to update note', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const body = await request.json();
    const { noteId } = body;
    const reviewerId = (session.user as any)?.playerId;

    if (!noteId) {
      return NextResponse.json(
        { error: 'Missing noteId' },
        { status: 400 }
      );
    }

    // Check if the user owns this note
    const note = await queryAll(
      `SELECT reviewerId FROM StatNote WHERE id = ? AND sessionId = ?`,
      [noteId, id]
    );

    if (note.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    if (note[0].reviewerId !== reviewerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await query(`DELETE FROM StatNote WHERE id = ?`, [noteId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting note:', error);
    return NextResponse.json(
      { error: 'Failed to delete note', details: error.message },
      { status: 500 }
    );
  }
}

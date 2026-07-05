import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = body.password;
    const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'defaultPassword123!';

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Create ReviewSessionSnapshot table
    await query(
      `CREATE TABLE IF NOT EXISTS ReviewSessionSnapshot (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL UNIQUE,
        playerId TEXT NOT NULL,
        statSnapshots TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (sessionId) REFERENCES ReviewSession(id),
        FOREIGN KEY (playerId) REFERENCES Player(id)
      )`
    );

    return NextResponse.json({
      success: true,
      message: 'ReviewSessionSnapshot table created successfully',
    });
  } catch (error: any) {
    console.error('Error creating table:', error);
    return NextResponse.json(
      { error: 'Failed to create table', details: error.message },
      { status: 500 }
    );
  }
}

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

    // Create Target table
    await query(
      `CREATE TABLE IF NOT EXISTS Target (
        id TEXT PRIMARY KEY,
        playerId TEXT NOT NULL,
        statCode TEXT NOT NULL,
        statLabel TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (playerId) REFERENCES Player(id),
        UNIQUE(playerId, statCode)
      )`
    );

    return NextResponse.json({
      success: true,
      message: 'Target table created successfully',
    });
  } catch (error: any) {
    console.error('Error creating table:', error);
    return NextResponse.json(
      { error: 'Failed to create table', details: error.message },
      { status: 500 }
    );
  }
}

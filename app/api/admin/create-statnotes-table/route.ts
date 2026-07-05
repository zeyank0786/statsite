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

    // Create StatNote table
    await query(
      `CREATE TABLE IF NOT EXISTS StatNote (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        statId TEXT NOT NULL,
        reviewerId TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (sessionId) REFERENCES ReviewSession(id),
        FOREIGN KEY (reviewerId) REFERENCES Player(id)
      )`
    );

    return NextResponse.json({
      success: true,
      message: 'StatNote table created successfully',
    });
  } catch (error: any) {
    console.error('Error creating table:', error);
    return NextResponse.json(
      { error: 'Failed to create table', details: error.message },
      { status: 500 }
    );
  }
}

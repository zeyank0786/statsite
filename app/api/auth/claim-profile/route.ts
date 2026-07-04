import { NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { playerId, email, password } = await request.json();

    if (!playerId || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const player = await queryOne('SELECT id FROM Player WHERE id = ?', [playerId]);

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const existingEmail = await queryOne('SELECT id FROM User WHERE email = ?', [email]);

    if (existingEmail) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const existingUser = await queryOne('SELECT id FROM User WHERE playerId = ?', [playerId]);

    if (existingUser) {
      return NextResponse.json({ error: 'This player profile is already claimed' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await query(
      'INSERT INTO User (id, email, password, playerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), email, hashedPassword, playerId, new Date().toISOString(), new Date().toISOString()]
    );

    return NextResponse.json({
      success: true,
      message: 'Profile claimed successfully! You can now log in.',
    });
  } catch (error: any) {
    console.error('Error claiming profile:', error);
    return NextResponse.json(
      { error: 'Failed to claim profile', details: error.message },
      { status: 500 }
    );
  }
}

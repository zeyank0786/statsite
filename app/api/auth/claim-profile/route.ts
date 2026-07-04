import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

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

    // Check if player exists
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    // Check if player already has a user account
    const existingUser = await prisma.user.findUnique({
      where: { playerId },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'This player profile is already claimed' }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user account
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        playerId,
      },
    });

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

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const players = await prisma.player.findMany({
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    });

    return NextResponse.json(players);
  } catch (error: any) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { error: 'Failed to fetch players', details: error.message },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { statCode, newValue } = await request.json();

    if (!statCode || newValue === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: statCode and newValue' },
        { status: 400 }
      );
    }

    if (newValue < 0 || newValue > 10) {
      return NextResponse.json(
        { error: 'Value must be between 0 and 10' },
        { status: 400 }
      );
    }

    const stat = await prisma.stat.findUnique({
      where: { code: statCode },
    });

    if (!stat) {
      return NextResponse.json({ error: 'Stat not found' }, { status: 404 });
    }

    let current = await prisma.statValue.findUnique({
      where: { statId_playerId: { statId: stat.id, playerId: id } },
    });

    if (!current) {
      current = await prisma.statValue.create({
        data: {
          statId: stat.id,
          playerId: id,
          value: 5,
        },
      });
    }

    const oldValue = current.value;

    await prisma.statValue.update({
      where: { id: current.id },
      data: { value: newValue },
    });

    await prisma.statHistory.create({
      data: {
        statValueId: current.id,
        oldValue,
        newValue,
        reason: 'Direct edit',
        changedById: id,
        source: 'admin_edit',
      },
    });

    return NextResponse.json({
      success: true,
      message: `${statCode} updated from ${oldValue} to ${newValue}`,
    });
  } catch (error: any) {
    console.error('Error updating stat:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update stat' },
      { status: 500 }
    );
  }
}

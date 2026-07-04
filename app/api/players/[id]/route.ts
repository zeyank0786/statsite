import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const player = await prisma.player.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const stats = await prisma.$queryRaw`
      SELECT
        s.id as "statId",
        s.code,
        s.label,
        c.code as "categoryCode",
        c.label as "categoryLabel",
        COALESCE(sv.value, 0) as value
      FROM "Stat" s
      JOIN "Category" c ON s."categoryId" = c.id
      LEFT JOIN "StatValue" sv ON s.id = sv."statId" AND sv."playerId" = ${id}
      ORDER BY c.id, s.id
    ` as any[];

    const missingStatValues = await prisma.statValue.findMany({
      where: { playerId: id },
      select: { statId: true },
    });

    const existingStatIds = new Set(missingStatValues.map((sv: any) => sv.statId));

    for (const row of stats) {
      if (!existingStatIds.has(row.statId) && row.value === 0) {
        await prisma.statValue.create({
          data: {
            statId: row.statId,
            playerId: id,
            value: 5,
          },
        });
      }
    }

    const statMap: Record<string, any> = {};
    let totalValue = 0;
    let totalStats = 0;

    for (const row of stats) {
      if (!statMap[row.categoryCode]) {
        statMap[row.categoryCode] = {
          code: row.categoryCode,
          label: row.categoryLabel,
          stats: [],
        };
      }

      statMap[row.categoryCode].stats.push({
        id: row.statId,
        code: row.code,
        label: row.label,
        value: row.value,
      });
      totalValue += row.value;
      totalStats += 1;
    }

    const categories = Object.values(statMap) as any[];
    const categoryTotals = categories.map((cat) =>
      cat.stats.reduce((sum: number, s: any) => sum + s.value, 0)
    );
    const totalSum = categoryTotals.reduce((sum: number, total: number) => sum + total, 0);
    const overallScore = categories.length > 1 ? (totalSum / (categories.length - 1)).toFixed(1) : 0;

    const history = await prisma.$queryRaw`
      SELECT sh."oldValue", sh."newValue", s.code, s.label, sh."createdAt", p2.username as "changedBy"
      FROM "StatHistory" sh
      JOIN "StatValue" sv ON sh."statValueId" = sv.id
      JOIN "Stat" s ON sv."statId" = s.id
      JOIN "Player" p2 ON sh."changedById" = p2.id
      WHERE sv."playerId" = ${id}
      ORDER BY sh."createdAt" DESC
      LIMIT 10
    ` as any[];

    const recentReviews = await prisma.$queryRaw`
      SELECT rs.id, rs."createdAt", COUNT(DISTINCT rp."playerId") as "participantCount"
      FROM "ReviewSession" rs
      LEFT JOIN "ReviewParticipant" rp ON rs.id = rp."sessionId"
      WHERE rs."targetPlayerId" = ${id}
      GROUP BY rs.id, rs."createdAt"
      ORDER BY rs."createdAt" DESC
      LIMIT 5
    ` as any[];

    const otherPlayers = await prisma.player.findMany({
      where: { id: { not: id } },
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    });

    return NextResponse.json({
      player: {
        id: player.id,
        username: player.username,
        email: player.user?.email || 'No email set',
        createdAt: player.createdAt,
      },
      categories,
      overallScore,
      history,
      recentReviews,
      otherPlayers,
    });
  } catch (error: any) {
    console.error('Error fetching player:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player', details: error.message },
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
    const { username } = await request.json();

    if (!username || username.trim().length === 0) {
      return NextResponse.json({ error: 'Username cannot be empty' }, { status: 400 });
    }

    await prisma.player.update({
      where: { id },
      data: { username: username.trim() },
    });

    return NextResponse.json({ success: true, username: username.trim() });
  } catch (error: any) {
    console.error('Error updating player:', error);
    return NextResponse.json(
      { error: 'Failed to update player', details: error.message },
      { status: 500 }
    );
  }
}

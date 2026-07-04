import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const suggestions = await prisma.$queryRaw`
      SELECT
        s.id,
        s."playerId",
        p.username as "playerName",
        st.code as "statCode",
        st.label as "statLabel",
        s.reason,
        s."suggestedNewValue",
        s.status,
        s."createdAt",
        COALESCE(sv.value, 0) as "currentValue",
        (SELECT COUNT(*) FROM "Vote" WHERE "suggestionId" = s.id AND choice = 'yes') as "yesVotes",
        (SELECT COUNT(*) FROM "Vote" WHERE "suggestionId" = s.id AND choice = 'no') as "noVotes"
      FROM "Suggestion" s
      JOIN "Player" p ON s."playerId" = p.id
      JOIN "Stat" st ON s."statId" = st.id
      LEFT JOIN "StatValue" sv ON st.id = sv."statId" AND sv."playerId" = s."playerId"
      ORDER BY s."createdAt" DESC
    `;

    return NextResponse.json(suggestions);
  } catch (error: any) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suggestions', details: error.message },
      { status: 500 }
    );
  }
}

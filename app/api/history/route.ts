import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const history = await queryAll(
      `SELECT
        sh.id,
        p.username as playerName,
        st.code as statCode,
        st.label as statLabel,
        sh.oldValue,
        sh.newValue,
        sh.reason,
        sh.source,
        sh.createdAt as changedAt
      FROM StatHistory sh
      JOIN StatValue sv ON sh.statValueId = sv.id
      JOIN Player p ON sv.playerId = p.id
      JOIN Stat st ON sv.statId = st.id
      ORDER BY sh.createdAt DESC
      LIMIT 100`
    );

    return NextResponse.json(history);
  } catch (error: any) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history', details: error.message },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { CATEGORY_ORDER } from '@/lib/categories';
import { daysAgo } from '@/lib/serverStats';

export const dynamic = 'force-dynamic';

/**
 * GET /api/players/[id]/trends
 * Reconstructs the player's overall-score timeline from StatHistory and
 * returns per-category momentum for the last 30/90 days.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const statRows = await queryAll(
      `SELECT c.code as categoryCode, c.label as categoryLabel, COALESCE(sv.value, 5) as value
       FROM Stat s
       JOIN Category c ON s.categoryId = c.id
       LEFT JOIN StatValue sv ON sv.statId = s.id AND sv.playerId = ?`,
      [id]
    );

    const historyRows = await queryAll(
      `SELECT sh.oldValue as oldValue, sh.newValue as newValue, sh.createdAt as createdAt,
              c.code as categoryCode
       FROM StatHistory sh
       JOIN StatValue sv ON sh.statValueId = sv.id
       JOIN Stat s ON sv.statId = s.id
       JOIN Category c ON s.categoryId = c.id
       WHERE sv.playerId = ?
       ORDER BY sh.createdAt ASC`,
      [id]
    );

    // Current per-category aggregates (canonical order)
    const byCat = new Map<string, { label: string; total: number; count: number }>();
    for (const row of statRows as any[]) {
      const code = String(row.categoryCode).toLowerCase();
      if (!byCat.has(code)) byCat.set(code, { label: String(row.categoryLabel), total: 0, count: 0 });
      const entry = byCat.get(code)!;
      entry.total += Number(row.value);
      entry.count += 1;
    }

    const numCats = byCat.size;
    const divisor = numCats > 1 ? numCats - 1 : 1;
    const currentTotal = Array.from(byCat.values()).reduce((s, c) => s + c.total, 0);

    const history = (historyRows as any[]).map((r) => ({
      oldValue: Number(r.oldValue),
      newValue: Number(r.newValue),
      createdAt: String(r.createdAt),
      categoryCode: String(r.categoryCode).toLowerCase(),
      time: new Date(String(r.createdAt)).getTime(),
    }));

    // Rebuild overall-score timeline: walk backwards from the current total.
    // totals[i] = total AFTER history event i; prepend the starting total.
    const totalsAfter: number[] = new Array(history.length);
    let running = currentTotal;
    for (let i = history.length - 1; i >= 0; i--) {
      totalsAfter[i] = running;
      running -= history[i].newValue - history[i].oldValue;
    }
    const startTotal = running;

    const seriesTotals = [startTotal, ...totalsAfter];
    const seriesDates = [
      history.length > 0 ? history[0].createdAt : new Date().toISOString(),
      ...history.map((h) => h.createdAt),
    ];

    // Downsample to at most 40 points (always keep first and last)
    const MAX_POINTS = 40;
    let sampledTotals = seriesTotals;
    let sampledDates = seriesDates;
    if (seriesTotals.length > MAX_POINTS) {
      const step = (seriesTotals.length - 1) / (MAX_POINTS - 1);
      sampledTotals = [];
      sampledDates = [];
      for (let i = 0; i < MAX_POINTS; i++) {
        const idx = Math.round(i * step);
        sampledTotals.push(seriesTotals[idx]);
        sampledDates.push(seriesDates[idx]);
      }
    }

    const cutoff90 = daysAgo(90);
    const cutoff30 = daysAgo(30);

    const perCategory = CATEGORY_ORDER.filter((code) => byCat.has(code)).map((code) => {
      const cat = byCat.get(code)!;
      const catHistory = history.filter((h) => h.categoryCode === code);
      const net90 = catHistory
        .filter((h) => !Number.isNaN(h.time) && h.time >= cutoff90)
        .reduce((s, h) => s + (h.newValue - h.oldValue), 0);
      return {
        code,
        label: cat.label,
        avg: cat.count ? Math.round((cat.total / cat.count) * 100) / 100 : 0,
        total: cat.total,
        net90,
      };
    });

    const net30 = history
      .filter((h) => !Number.isNaN(h.time) && h.time >= cutoff30)
      .reduce((s, h) => s + (h.newValue - h.oldValue), 0);
    const net90 = history
      .filter((h) => !Number.isNaN(h.time) && h.time >= cutoff90)
      .reduce((s, h) => s + (h.newValue - h.oldValue), 0);

    return NextResponse.json({
      overall: Math.round((currentTotal / divisor) * 10) / 10,
      series: sampledTotals.map((t) => Math.round((t / divisor) * 10) / 10),
      seriesDates: sampledDates,
      changeCount: history.length,
      perCategory,
      net30,
      net90,
    });
  } catch (error: any) {
    console.error('Error computing trends:', error);
    return NextResponse.json(
      { error: 'Failed to compute trends', details: error.message },
      { status: 500 }
    );
  }
}

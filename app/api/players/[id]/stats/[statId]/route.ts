import { NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Everything about ONE stat for ONE player: current value, full change log,
 * value timeline (for the sparkline) and every suggestion that touched it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; statId: string }> }
) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id: playerId, statId } = await params;

    const [player, stat] = await Promise.all([
      queryOne('SELECT id, username FROM Player WHERE id = ?', [playerId]),
      queryOne(
        `SELECT s.id, s.code, s.label, c.code as categoryCode, c.label as categoryLabel
         FROM Stat s JOIN Category c ON s.categoryId = c.id WHERE s.id = ?`,
        [statId]
      ),
    ]);
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    if (!stat) return NextResponse.json({ error: 'Stat not found' }, { status: 404 });

    const valueRow = await queryOne('SELECT value FROM StatValue WHERE statId = ? AND playerId = ?', [
      statId,
      playerId,
    ]);
    const value = valueRow ? Number(valueRow.value) : 5;

    const history = await queryAll(
      `SELECT sh.oldValue, sh.newValue, sh.reason, sh.source, sh.createdAt,
              p.username as changedBy
       FROM StatHistory sh
       JOIN StatValue sv ON sh.statValueId = sv.id
       LEFT JOIN Player p ON sh.changedById = p.id
       WHERE sv.statId = ? AND sv.playerId = ?
       ORDER BY sh.createdAt ASC`,
      [statId, playerId]
    );

    // Timeline for the sparkline: starting point, every recorded step, today
    const series: number[] = [];
    if (history.length > 0) {
      series.push(Number((history[0] as any).oldValue));
      for (const h of history as any[]) series.push(Number(h.newValue));
    } else {
      series.push(value);
    }
    if (series[series.length - 1] !== value) series.push(value);

    const suggestions = await queryAll(
      `SELECT sg.id, sg.delta, sg.reason, sg.status, sg.createdAt, sg.resolvedAt,
              p.username as proposerName
       FROM Suggestion sg
       JOIN Player p ON sg.proposedById = p.id
       WHERE sg.statId = ? AND sg.playerId = ?
       ORDER BY sg.createdAt DESC LIMIT 20`,
      [statId, playerId]
    );

    return NextResponse.json({
      player: { id: String(player.id), username: String(player.username) },
      stat: {
        id: String(stat.id),
        code: String(stat.code),
        label: String(stat.label),
        categoryCode: String(stat.categoryCode),
        categoryLabel: String(stat.categoryLabel),
      },
      value,
      series,
      history: (history as any[])
        .map((h) => ({
          oldValue: Number(h.oldValue),
          newValue: Number(h.newValue),
          reason: h.reason ? String(h.reason) : null,
          source: String(h.source),
          changedBy: h.changedBy ? String(h.changedBy) : 'Unknown',
          createdAt: String(h.createdAt),
        }))
        .reverse(),
      suggestions: (suggestions as any[]).map((sg) => ({
        id: String(sg.id),
        delta: Number(sg.delta),
        reason: String(sg.reason),
        status: String(sg.status),
        proposerName: String(sg.proposerName),
        createdAt: String(sg.createdAt),
        resolvedAt: sg.resolvedAt ? String(sg.resolvedAt) : null,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching stat detail:', error);
    return NextResponse.json({ error: 'Failed to fetch stat detail', details: error.message }, { status: 500 });
  }
}

import { queryAll } from './db';
import { CATEGORY_ORDER } from './categories';

export interface StatRow {
  playerId: string;
  username: string;
  statId: string;
  statCode: string;
  statLabel: string;
  categoryCode: string;
  categoryLabel: string;
  value: number;
}

export interface HistoryRow {
  playerId: string;
  statId: string;
  statCode: string;
  categoryCode: string;
  oldValue: number;
  newValue: number;
  createdAt: string;
}

/** Every stat value for every player (missing values default to 5, matching the lazy-seed behavior). */
export async function fetchAllPlayerStats(): Promise<StatRow[]> {
  const rows = await queryAll(
    `SELECT
       p.id as playerId,
       p.username as username,
       s.id as statId,
       s.code as statCode,
       s.label as statLabel,
       c.code as categoryCode,
       c.label as categoryLabel,
       COALESCE(sv.value, 5) as value
     FROM Player p
     CROSS JOIN Stat s
     JOIN Category c ON s.categoryId = c.id
     LEFT JOIN StatValue sv ON sv.statId = s.id AND sv.playerId = p.id`
  );
  return rows.map((r: any) => ({
    playerId: String(r.playerId),
    username: String(r.username),
    statId: String(r.statId),
    statCode: String(r.statCode),
    statLabel: String(r.statLabel),
    categoryCode: String(r.categoryCode).toLowerCase(),
    categoryLabel: String(r.categoryLabel),
    value: Number(r.value),
  }));
}

/** Full stat-change history for all players (small dataset; filtered in JS). */
export async function fetchAllHistory(): Promise<HistoryRow[]> {
  const rows = await queryAll(
    `SELECT
       sv.playerId as playerId,
       sv.statId as statId,
       s.code as statCode,
       c.code as categoryCode,
       sh.oldValue as oldValue,
       sh.newValue as newValue,
       sh.createdAt as createdAt
     FROM StatHistory sh
     JOIN StatValue sv ON sh.statValueId = sv.id
     JOIN Stat s ON sv.statId = s.id
     JOIN Category c ON s.categoryId = c.id
     ORDER BY sh.createdAt ASC`
  );
  return rows.map((r: any) => ({
    playerId: String(r.playerId),
    statId: String(r.statId),
    statCode: String(r.statCode),
    categoryCode: String(r.categoryCode).toLowerCase(),
    oldValue: Number(r.oldValue),
    newValue: Number(r.newValue),
    createdAt: String(r.createdAt),
  }));
}

export interface PlayerAggregate {
  id: string;
  username: string;
  categories: {
    code: string;
    label: string;
    total: number;
    avg: number;
    stats: { statId: string; code: string; label: string; value: number }[];
  }[];
  totalSum: number;
  overall: number;
}

/** Group flat stat rows into per-player aggregates with canonical category order. */
export function buildPlayerAggregates(rows: StatRow[]): PlayerAggregate[] {
  const byPlayer = new Map<string, StatRow[]>();
  for (const row of rows) {
    if (!byPlayer.has(row.playerId)) byPlayer.set(row.playerId, []);
    byPlayer.get(row.playerId)!.push(row);
  }

  const players: PlayerAggregate[] = [];
  for (const [playerId, playerRows] of byPlayer) {
    const byCat = new Map<string, StatRow[]>();
    for (const row of playerRows) {
      if (!byCat.has(row.categoryCode)) byCat.set(row.categoryCode, []);
      byCat.get(row.categoryCode)!.push(row);
    }

    const categories = CATEGORY_ORDER.filter((code) => byCat.has(code)).map((code) => {
      const stats = byCat.get(code)!;
      const total = stats.reduce((s, r) => s + r.value, 0);
      return {
        code,
        label: stats[0].categoryLabel,
        total,
        avg: stats.length ? total / stats.length : 0,
        stats: stats.map((r) => ({
          statId: r.statId,
          code: r.statCode,
          label: r.statLabel,
          value: r.value,
        })),
      };
    });

    const totalSum = categories.reduce((s, c) => s + c.total, 0);
    const overall = categories.length > 1 ? totalSum / (categories.length - 1) : totalSum;

    players.push({
      id: playerId,
      username: playerRows[0].username,
      categories,
      totalSum,
      overall,
    });
  }

  return players.sort((a, b) => b.overall - a.overall);
}

export function daysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export function historySince(history: HistoryRow[], sinceMs: number): HistoryRow[] {
  return history.filter((h) => {
    const t = new Date(h.createdAt).getTime();
    return !Number.isNaN(t) && t >= sinceMs;
  });
}

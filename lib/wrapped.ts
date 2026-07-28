import { query, queryOne, queryAll } from './db';
import { getStatTier } from './categories';
import { sendPushToPlayers } from './push';

/**
 * Season Wrapped — a quarterly recap (Spotify-Wrapped style) computed live from
 * the historical tables. A "season" is a calendar quarter. Everything is
 * derived on demand from timestamps, so there's nothing to snapshot.
 */

export interface Season {
  key: string; // "2026-Q3"
  label: string; // "Q3 2026"
  months: string; // "Jul–Sep"
  start: string; // inclusive ISO
  end: string; // exclusive ISO
  year: number;
  quarter: number; // 1..4
}

const MONTHS = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];

export function makeSeason(year: number, quarter: number): Season {
  const startMonth = (quarter - 1) * 3;
  return {
    key: `${year}-Q${quarter}`,
    label: `Q${quarter} ${year}`,
    months: MONTHS[quarter - 1],
    start: new Date(Date.UTC(year, startMonth, 1)).toISOString(),
    end: new Date(Date.UTC(year, startMonth + 3, 1)).toISOString(),
    year,
    quarter,
  };
}

export function seasonForDate(d: Date): Season {
  return makeSeason(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) + 1);
}

/** The most recent COMPLETED season relative to `d`. */
export function previousSeason(d: Date = new Date()): Season {
  const cur = seasonForDate(d);
  let year = cur.year;
  let quarter = cur.quarter - 1;
  if (quarter < 1) {
    quarter = 4;
    year -= 1;
  }
  return makeSeason(year, quarter);
}

export function seasonFromKey(key: string): Season | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(key || ''));
  if (!m) return null;
  return makeSeason(Number(m[1]), Number(m[2]));
}

/** Completed seasons that actually contain data, newest first. */
export async function listCompletedSeasons(): Promise<Season[]> {
  const latest = previousSeason();
  let earliestIso: string | null = null;
  try {
    const row = await queryOne(
      `SELECT MIN(d) AS d FROM (
         SELECT MIN(createdAt) AS d FROM StatHistory
         UNION ALL SELECT MIN(createdAt) FROM Evidence
       )`
    );
    earliestIso = row?.d ? String(row.d) : null;
  } catch {
    /* ignore */
  }
  const earliest = earliestIso ? seasonForDate(new Date(earliestIso)) : latest;

  const seasons: Season[] = [];
  let y = latest.year;
  let q = latest.quarter;
  // Walk backwards from the latest completed season to the earliest with data (cap 12).
  for (let i = 0; i < 12; i++) {
    const s = makeSeason(y, q);
    seasons.push(s);
    if (y === earliest.year && q === earliest.quarter) break;
    q -= 1;
    if (q < 1) {
      q = 4;
      y -= 1;
    }
  }
  return seasons;
}

export interface Wrapped {
  season: Season;
  netPoints: number;
  changeCount: number;
  tierUps: number;
  topStat: { label: string; delta: number } | null;
  topCategory: { label: string; delta: number } | null;
  evidenceCount: number;
  suggestionsProposed: number;
  suggestionsApproved: number;
  votesCast: number;
  achievements: string[];
  commitmentsKept: number;
  crewRank: number | null;
  crewSize: number;
  topCrew: { name: string; net: number } | null;
  hasData: boolean;
}

export async function computeWrapped(playerId: string, season: Season): Promise<Wrapped> {
  const { start, end } = season;

  // Stat changes for this player in-window
  let netPoints = 0;
  let changeCount = 0;
  let tierUps = 0;
  const byStat = new Map<string, { label: string; delta: number }>();
  const byCat = new Map<string, { label: string; delta: number }>();
  try {
    const rows = await queryAll(
      `SELECT sh.oldValue, sh.newValue, s.label AS statLabel, c.label AS catLabel, sv.statId, s.categoryId
       FROM StatHistory sh
       JOIN StatValue sv ON sh.statValueId = sv.id
       JOIN Stat s ON sv.statId = s.id
       JOIN Category c ON s.categoryId = c.id
       WHERE sv.playerId = ? AND sh.createdAt >= ? AND sh.createdAt < ?`,
      [playerId, start, end]
    );
    for (const r of rows as any[]) {
      const oldV = Number(r.oldValue);
      const newV = Number(r.newValue);
      const d = newV - oldV;
      netPoints += d;
      changeCount += 1;
      if (newV > oldV && getStatTier(newV).name !== getStatTier(oldV).name) tierUps += 1;
      const sKey = String(r.statId);
      byStat.set(sKey, { label: String(r.statLabel), delta: (byStat.get(sKey)?.delta || 0) + d });
      const cKey = String(r.categoryId);
      byCat.set(cKey, { label: String(r.catLabel), delta: (byCat.get(cKey)?.delta || 0) + d });
    }
  } catch {
    /* ignore */
  }

  const topStat = [...byStat.values()].filter((s) => s.delta > 0).sort((a, b) => b.delta - a.delta)[0] || null;
  const topCategory = [...byCat.values()].filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta)[0] || null;

  const countIn = async (sql: string, args: any[]): Promise<number> => {
    try {
      const row = await queryOne(sql, args);
      return Number(row?.c) || 0;
    } catch {
      return 0;
    }
  };

  const evidenceCount = await countIn(
    'SELECT COUNT(*) AS c FROM Evidence WHERE playerId = ? AND createdAt >= ? AND createdAt < ?',
    [playerId, start, end]
  );
  const suggestionsProposed = await countIn(
    'SELECT COUNT(*) AS c FROM Suggestion WHERE proposedById = ? AND createdAt >= ? AND createdAt < ?',
    [playerId, start, end]
  );
  const suggestionsApproved = await countIn(
    "SELECT COUNT(*) AS c FROM Suggestion WHERE proposedById = ? AND status = 'approved' AND createdAt >= ? AND createdAt < ?",
    [playerId, start, end]
  );
  const votesCast = await countIn(
    'SELECT COUNT(*) AS c FROM Vote WHERE userId = ? AND createdAt >= ? AND createdAt < ?',
    [playerId, start, end]
  );
  const commitmentsKept = await countIn(
    "SELECT COUNT(*) AS c FROM Commitment WHERE playerId = ? AND status = 'kept' AND resolvedAt >= ? AND resolvedAt < ?",
    [playerId, start, end]
  );

  let achievements: string[] = [];
  try {
    const rows = await queryAll(
      "SELECT name FROM AchievementEarned WHERE playerId = ? AND earnedAt >= ? AND earnedAt < ? AND earnedAt > '2000-01-01' ORDER BY earnedAt",
      [playerId, start, end]
    );
    achievements = (rows as any[]).map((r) => String(r.name));
  } catch {
    /* ignore */
  }

  // Crew ranking by net points in-window
  let crewRank: number | null = null;
  let crewSize = 0;
  let topCrew: { name: string; net: number } | null = null;
  try {
    const rows = await queryAll(
      `SELECT sv.playerId AS pid, SUM(sh.newValue - sh.oldValue) AS net, p.username AS name
       FROM StatHistory sh
       JOIN StatValue sv ON sh.statValueId = sv.id
       JOIN Player p ON sv.playerId = p.id
       WHERE sh.createdAt >= ? AND sh.createdAt < ?
       GROUP BY sv.playerId
       ORDER BY net DESC`,
      [start, end]
    );
    const ranked = rows as any[];
    crewSize = ranked.length;
    if (ranked.length > 0) {
      topCrew = { name: String(ranked[0].name), net: Number(ranked[0].net) };
      const idx = ranked.findIndex((r) => String(r.pid) === String(playerId));
      if (idx >= 0) crewRank = idx + 1;
    }
  } catch {
    /* ignore */
  }

  const hasData =
    changeCount > 0 || evidenceCount > 0 || suggestionsProposed > 0 || votesCast > 0 || achievements.length > 0;

  return {
    season,
    netPoints,
    changeCount,
    tierUps,
    topStat,
    topCategory,
    evidenceCount,
    suggestionsProposed,
    suggestionsApproved,
    votesCast,
    achievements,
    commitmentsKept,
    crewRank,
    crewSize,
    topCrew,
    hasData,
  };
}

/**
 * Once per quarter rollover, push everyone "your Wrapped is ready". A tiny
 * marker table holds the last-announced season. On first ever run it adopts the
 * current previous-season silently (like the notification back-fill) so a
 * deploy never blasts a stale announcement.
 */
export async function maybeAnnounceNewSeason(now: Date = new Date()): Promise<{ announced: boolean; season: string }> {
  await query(
    `CREATE TABLE IF NOT EXISTS SeasonState (
       id TEXT PRIMARY KEY,
       lastAnnouncedKey TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`
  );
  const prev = previousSeason(now);
  const existing = await queryOne("SELECT lastAnnouncedKey FROM SeasonState WHERE id = 'singleton'");
  const nowIso = now.toISOString();

  if (!existing) {
    await query('INSERT OR IGNORE INTO SeasonState (id, lastAnnouncedKey, updatedAt) VALUES (?, ?, ?)', [
      'singleton',
      prev.key,
      nowIso,
    ]);
    return { announced: false, season: prev.key };
  }

  if (String(existing.lastAnnouncedKey) === prev.key) {
    return { announced: false, season: prev.key };
  }

  // A new quarter has completed since last time — announce it.
  try {
    const players = await queryAll('SELECT id FROM Player WHERE active = 1');
    const ids = (players as any[]).map((p) => String(p.id));
    await sendPushToPlayers(ids, {
      title: `🎁 Your ${prev.label} Wrapped is ready`,
      body: `See how your ${prev.months} went — biggest gains, evidence, where you ranked.`,
      url: '/wrapped',
      tag: `wrapped-${prev.key}`,
    });
  } catch (e) {
    console.error('Season Wrapped announce push failed (ignored):', e);
  }

  await query("UPDATE SeasonState SET lastAnnouncedKey = ?, updatedAt = ? WHERE id = 'singleton'", [prev.key, nowIso]);
  return { announced: true, season: prev.key };
}

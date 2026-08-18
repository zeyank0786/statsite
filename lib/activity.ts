import { unstable_cache } from 'next/cache';
import { queryAll } from './db';
import { getStatTier } from './categories';

/**
 * Lightweight, crew-wide PUBLIC activity for the live ticker. Deliberately not
 * the per-user notification feed (no achievement sync, no nudges/mentions) —
 * just a cheap pull of recent public moments to scroll across the dashboard.
 *
 * Nothing in here depends on who is looking: it is the same eight queries
 * producing the same marquee for everybody. So it is computed once per TTL for
 * the whole crew rather than once per viewer per tick — four people with the
 * dashboard open used to mean four identical rebuilds every 25 seconds.
 */

export interface ActivityItem {
  id: string;
  at: string;
  emoji: string;
  text: string;
  hex: string;
  href: string;
}

const PER_SOURCE = 12;

export async function buildRecentActivity(limit = 30): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];

  const nameRows = await queryAll('SELECT id, username FROM Player');
  const nameOf = (id: string) =>
    String((nameRows as any[]).find((p) => String(p.id) === String(id))?.username || 'Someone');

  // Stat changes (+ derive tier-ups)
  try {
    const rows = await queryAll(
      `SELECT sh.id, sh.oldValue, sh.newValue, sh.createdAt, sv.playerId, s.label AS statLabel
       FROM StatHistory sh
       JOIN StatValue sv ON sh.statValueId = sv.id
       JOIN Stat s ON sv.statId = s.id
       ORDER BY sh.createdAt DESC LIMIT ${PER_SOURCE}`
    );
    for (const r of rows as any[]) {
      const pid = String(r.playerId);
      const oldV = Number(r.oldValue);
      const newV = Number(r.newValue);
      const delta = newV - oldV;
      items.push({
        id: `sh:${r.id}`,
        at: String(r.createdAt),
        emoji: delta >= 0 ? '📈' : '📉',
        text: `${nameOf(pid)} · ${String(r.statLabel)} ${delta > 0 ? '+' : ''}${delta}`,
        hex: delta >= 0 ? '#34d399' : '#ef4444',
        href: `/players/${pid}`,
      });
      const oldTier = getStatTier(oldV);
      const newTier = getStatTier(newV);
      if (newV > oldV && newTier.name !== oldTier.name) {
        items.push({
          id: `tier:${r.id}`,
          at: String(r.createdAt),
          emoji: '🏆',
          text: `${nameOf(pid)}'s ${String(r.statLabel)} hit ${newTier.name}`,
          hex: newTier.hex,
          href: `/players/${pid}`,
        });
      }
    }
  } catch {
    /* ignore */
  }

  // Evidence
  try {
    const rows = await queryAll(
      `SELECT id, playerId, createdAt FROM Evidence ORDER BY createdAt DESC LIMIT ${PER_SOURCE}`
    );
    for (const r of rows as any[]) {
      const pid = String(r.playerId);
      items.push({
        id: `ev:${r.id}`,
        at: String(r.createdAt),
        emoji: '📸',
        text: `${nameOf(pid)} posted evidence`,
        hex: '#f97316',
        href: '/evidence',
      });
    }
  } catch {
    /* ignore */
  }

  // Achievements (skip epoch back-fill rows)
  try {
    const rows = await queryAll(
      `SELECT id, playerId, name, earnedAt FROM AchievementEarned
       WHERE earnedAt > '2000-01-01' ORDER BY earnedAt DESC LIMIT ${PER_SOURCE}`
    );
    for (const r of rows as any[]) {
      const pid = String(r.playerId);
      items.push({
        id: `ach:${r.id}`,
        at: String(r.earnedAt),
        emoji: '🎖️',
        text: `${nameOf(pid)} earned "${String(r.name)}"`,
        hex: '#fbbf24',
        href: '/achievements',
      });
    }
  } catch {
    /* ignore */
  }

  // Approved suggestions
  try {
    const rows = await queryAll(
      `SELECT sg.id, sg.playerId, sg.delta, sg.resolvedAt, s.label AS statLabel
       FROM Suggestion sg JOIN Stat s ON sg.statId = s.id
       WHERE sg.status = 'approved' AND sg.resolvedAt IS NOT NULL
       ORDER BY sg.resolvedAt DESC LIMIT ${PER_SOURCE}`
    );
    for (const r of rows as any[]) {
      const pid = String(r.playerId);
      const delta = Number(r.delta);
      items.push({
        id: `sgr:${r.id}`,
        at: String(r.resolvedAt),
        emoji: '✅',
        text: `${delta > 0 ? '+' : ''}${delta} ${String(r.statLabel)} for ${nameOf(pid)}`,
        hex: '#34d399',
        href: '/suggestions',
      });
    }
  } catch {
    /* ignore */
  }

  // Ambition completions
  try {
    const rows = await queryAll(
      `SELECT id, playerId, title, completedAt FROM Ambition
       WHERE status = 'completed' AND completedAt IS NOT NULL
       ORDER BY completedAt DESC LIMIT ${PER_SOURCE}`
    );
    for (const r of rows as any[]) {
      const pid = String(r.playerId);
      items.push({
        id: `amb:${r.id}`,
        at: String(r.completedAt),
        emoji: '🎉',
        text: `${nameOf(pid)} completed "${String(r.title)}"`,
        hex: '#f5c451',
        href: '/ambitions',
      });
    }
  } catch {
    /* table may not exist yet */
  }

  // Commitments kept
  try {
    const rows = await queryAll(
      `SELECT id, playerId, title, resolvedAt FROM Commitment
       WHERE status = 'kept' AND resolvedAt IS NOT NULL
       ORDER BY resolvedAt DESC LIMIT ${PER_SOURCE}`
    );
    for (const r of rows as any[]) {
      const pid = String(r.playerId);
      items.push({
        id: `cmt:${r.id}`,
        at: String(r.resolvedAt),
        emoji: '🤝',
        text: `${nameOf(pid)} kept "${String(r.title)}"`,
        hex: '#34d399',
        href: `/commitments/${r.id}`,
      });
    }
  } catch {
    /* table may not exist yet */
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return items.slice(0, limit);
}

/**
 * How stale the ticker may get. It scrolls past continuously and nothing in it
 * is actionable, so a shorter window would buy nothing a reader could notice.
 */
const ACTIVITY_TTL_SECONDS = 60;

const cachedActivity = unstable_cache(buildRecentActivity, ['recent-activity'], {
  revalidate: ACTIVITY_TTL_SECONDS,
});

/** Cached ticker, falling back to a direct build outside a request scope. */
export async function getRecentActivity(limit = 30): Promise<ActivityItem[]> {
  try {
    return await cachedActivity(limit);
  } catch (error) {
    if (/incrementalCache missing|Invariant/i.test(String((error as Error)?.message))) {
      return buildRecentActivity(limit);
    }
    throw error;
  }
}

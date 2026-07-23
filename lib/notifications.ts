import { query, queryOne, queryAll } from './db';
import { getStatTier } from './categories';
import { fetchAllPlayerStats, fetchAllHistory, buildPlayerAggregates } from './serverStats';
import { computeAchievements, SocialCounts } from './achievements';
import { getAllLocks } from './featureLocks';
import { getNudgesFor, NUDGE_KINDS } from './nudges';
import { v4 as uuid } from 'uuid';

/**
 * Unified activity feed + personal celebrations.
 *
 * The feed is assembled live from existing tables (StatHistory, Suggestion,
 * Evidence, FeatureLock). Achievements are computed live and have no
 * timestamps, so newly-earned ones are recorded into AchievementEarned the
 * first time they're observed — that row's earnedAt becomes the feed
 * timestamp. On the very first sync (empty table) existing achievements are
 * back-filled as OLD (epoch) so a deploy doesn't flood everyone's feed.
 *
 * Per-player markers in NotificationSeen:
 *   lastSeenAt       — bell badge counts events newer than this
 *   lastCelebratedAt — popups fire for YOUR events newer than this
 * Both start at "now" on first contact, so history never re-celebrates.
 */

export interface FeedEvent {
  id: string;
  type:
    | 'stat_change'
    | 'tier_up'
    | 'achievement'
    | 'suggestion_resolved'
    | 'suggestion_open'
    | 'evidence'
    | 'lockout'
    | 'nudge';
  at: string;
  playerId: string;
  playerName: string;
  title: string;
  body?: string;
  href?: string;
  hex: string;
}

export interface Celebration {
  id: string;
  kind: 'achievement' | 'tier' | 'stat';
  title: string;
  subtitle: string;
  hex: string;
}

const FEED_LIMIT = 50;
const SOURCE_LIMIT = 30;
const CELEBRATION_CAP = 8;

async function ensureTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS AchievementEarned (
       id            TEXT PRIMARY KEY,
       playerId      TEXT NOT NULL,
       achievementId TEXT NOT NULL,
       name          TEXT NOT NULL,
       earnedAt      TEXT NOT NULL,
       UNIQUE(playerId, achievementId)
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS NotificationSeen (
       playerId        TEXT PRIMARY KEY,
       lastSeenAt      TEXT NOT NULL,
       lastCelebratedAt TEXT NOT NULL
     )`
  );
}

async function fetchSocialCounts(): Promise<Record<string, SocialCounts>> {
  const counts: Record<string, SocialCounts> = {};
  const ensure = (id: string) => {
    if (!counts[id]) counts[id] = { evidencePosts: 0, approvedProposals: 0, votesCast: 0 };
    return counts[id];
  };
  try {
    const [evidence, approved, votes] = await Promise.all([
      queryAll('SELECT playerId as id, COUNT(*) as c FROM Evidence GROUP BY playerId'),
      queryAll("SELECT proposedById as id, COUNT(*) as c FROM Suggestion WHERE status = 'approved' GROUP BY proposedById"),
      queryAll('SELECT userId as id, COUNT(*) as c FROM Vote GROUP BY userId'),
    ]);
    for (const r of evidence as any[]) ensure(String(r.id)).evidencePosts = Number(r.c);
    for (const r of approved as any[]) ensure(String(r.id)).approvedProposals = Number(r.c);
    for (const r of votes as any[]) ensure(String(r.id)).votesCast = Number(r.c);
  } catch {
    /* achievements degrade gracefully */
  }
  return counts;
}

/** Record any newly-earned achievements; back-fill silently on first run. */
async function syncAchievements(): Promise<void> {
  const [rows, history, social] = await Promise.all([fetchAllPlayerStats(), fetchAllHistory(), fetchSocialCounts()]);
  const players = buildPlayerAggregates(rows);
  const computed = computeAchievements(players, history, social);

  const existing = await queryAll('SELECT playerId, achievementId FROM AchievementEarned');
  const known = new Set((existing as any[]).map((r) => `${r.playerId}:${r.achievementId}`));
  const firstRun = existing.length === 0;
  const at = firstRun ? new Date(0).toISOString() : new Date().toISOString();

  for (const [playerId, list] of Object.entries(computed)) {
    for (const a of list) {
      if (!a.earned || known.has(`${playerId}:${a.id}`)) continue;
      await query(
        'INSERT OR IGNORE INTO AchievementEarned (id, playerId, achievementId, name, earnedAt) VALUES (?, ?, ?, ?, ?)',
        [uuid(), playerId, a.id, a.name, at]
      );
    }
  }
}

export async function buildFeed(currentPlayerId: string): Promise<{
  events: FeedEvent[];
  unseenCount: number;
  celebrations: Celebration[];
}> {
  await ensureTables();
  try {
    await syncAchievements();
  } catch (e) {
    console.error('Achievement sync failed (feed continues):', e);
  }

  const nameRows = await queryAll('SELECT id, username FROM Player');
  const nameById = new Map((nameRows as any[]).map((p) => [String(p.id), String(p.username)]));
  const nameOf = (id: string) => nameById.get(id) || 'Unknown';

  const events: FeedEvent[] = [];

  // Stat changes (+ tier-up derivation)
  const changes = await queryAll(
    `SELECT sh.id, sh.oldValue, sh.newValue, sh.source, sh.createdAt, sv.playerId, s.label as statLabel
     FROM StatHistory sh
     JOIN StatValue sv ON sh.statValueId = sv.id
     JOIN Stat s ON sv.statId = s.id
     ORDER BY sh.createdAt DESC LIMIT ${SOURCE_LIMIT}`
  );
  for (const r of changes as any[]) {
    const pid = String(r.playerId);
    const oldV = Number(r.oldValue);
    const newV = Number(r.newValue);
    const delta = newV - oldV;
    events.push({
      id: `sh:${r.id}`,
      type: 'stat_change',
      at: String(r.createdAt),
      playerId: pid,
      playerName: nameOf(pid),
      title: `${nameOf(pid)} · ${String(r.statLabel)} ${delta > 0 ? '+' : ''}${delta}`,
      body: `${oldV} → ${newV} pts${String(r.source) === 'admin_edit' ? ' (admin edit)' : ''}`,
      href: `/players/${pid}`,
      hex: delta >= 0 ? '#34d399' : '#ef4444',
    });
    const oldTier = getStatTier(oldV);
    const newTier = getStatTier(newV);
    if (newV > oldV && newTier.name !== oldTier.name) {
      events.push({
        id: `tier:${r.id}`,
        type: 'tier_up',
        at: String(r.createdAt),
        playerId: pid,
        playerName: nameOf(pid),
        title: `🏆 ${nameOf(pid)}'s ${String(r.statLabel)} reached ${newTier.name}`,
        body: `${newV} pts`,
        href: `/players/${pid}`,
        hex: newTier.hex,
      });
    }
  }

  // Achievements (recorded with real timestamps after first run)
  const earned = await queryAll(
    `SELECT id, playerId, achievementId, name, earnedAt FROM AchievementEarned ORDER BY earnedAt DESC LIMIT ${SOURCE_LIMIT}`
  );
  for (const r of earned as any[]) {
    const pid = String(r.playerId);
    events.push({
      id: `ach:${r.id}`,
      type: 'achievement',
      at: String(r.earnedAt),
      playerId: pid,
      playerName: nameOf(pid),
      title: `🎖️ ${nameOf(pid)} earned "${String(r.name)}"`,
      href: '/achievements',
      hex: '#fbbf24',
    });
  }

  // Suggestions — resolved outcomes + open ones
  const suggestions = await queryAll(
    `SELECT sg.id, sg.playerId, sg.proposedById, sg.delta, sg.status, sg.createdAt, sg.resolvedAt, s.label as statLabel
     FROM Suggestion sg JOIN Stat s ON sg.statId = s.id
     ORDER BY COALESCE(sg.resolvedAt, sg.createdAt) DESC LIMIT ${SOURCE_LIMIT}`
  );
  for (const r of suggestions as any[]) {
    const pid = String(r.playerId);
    const delta = Number(r.delta);
    const deltaText = `${delta > 0 ? '+' : ''}${delta} ${String(r.statLabel)}`;
    if (String(r.status) === 'pending') {
      events.push({
        id: `sg:${r.id}`,
        type: 'suggestion_open',
        at: String(r.createdAt),
        playerId: pid,
        playerName: nameOf(pid),
        title: `💡 ${nameOf(String(r.proposedById))} proposed ${deltaText} for ${nameOf(pid)}`,
        body: pid !== currentPlayerId ? 'Needs your vote' : undefined,
        href: '/suggestions',
        hex: '#a855f7',
      });
    } else if (r.resolvedAt) {
      const approved = String(r.status) === 'approved';
      events.push({
        id: `sgr:${r.id}`,
        type: 'suggestion_resolved',
        at: String(r.resolvedAt),
        playerId: pid,
        playerName: nameOf(pid),
        title: `${approved ? '✅' : '❌'} ${deltaText} for ${nameOf(pid)} was ${approved ? 'approved' : 'rejected'}`,
        href: '/suggestions',
        hex: approved ? '#34d399' : '#ef4444',
      });
    }
  }

  // Evidence posts
  const evidence = await queryAll(
    `SELECT id, playerId, caption, captionHidden, createdAt FROM Evidence ORDER BY createdAt DESC LIMIT ${SOURCE_LIMIT}`
  );
  for (const r of evidence as any[]) {
    const pid = String(r.playerId);
    const caption = Number(r.captionHidden) ? null : r.caption ? String(r.caption) : null;
    events.push({
      id: `ev:${r.id}`,
      type: 'evidence',
      at: String(r.createdAt),
      playerId: pid,
      playerName: nameOf(pid),
      title: `📸 ${nameOf(pid)} posted evidence`,
      body: caption ? (caption.length > 80 ? `${caption.slice(0, 80)}…` : caption) : undefined,
      href: '/evidence',
      hex: '#f97316',
    });
  }

  // Nudges sent to you
  try {
    for (const n of await getNudgesFor(currentPlayerId, SOURCE_LIMIT)) {
      const meta = NUDGE_KINDS.find((k) => k.key === n.kind);
      events.push({
        id: `nudge:${n.id}`,
        type: 'nudge',
        at: n.createdAt,
        playerId: currentPlayerId,
        playerName: nameOf(currentPlayerId),
        title: `👉 ${n.fromName} ${meta?.title || 'nudged you'}`,
        body: meta?.body,
        href: meta?.url || '/',
        hex: '#fbbf24',
      });
    }
  } catch {
    /* nudges degrade gracefully */
  }

  // Lockouts — only your own appear in your feed (getAllLocks self-creates the table)
  try {
    const locks = (await getAllLocks()).filter((l) => l.playerId === currentPlayerId);
    for (const r of locks) {
      events.push({
        id: `lock:${r.playerId}:${r.feature}`,
        type: 'lockout',
        at: r.createdAt,
        playerId: currentPlayerId,
        playerName: nameOf(currentPlayerId),
        title: `🚫 You were locked out of ${r.feature}`,
        body: r.reason || undefined,
        hex: '#ef4444',
      });
    }
  } catch {
    /* lockouts degrade gracefully */
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  const feed = events.slice(0, FEED_LIMIT);

  // Markers — first contact starts both at "now" so history never floods
  let seen = await queryOne('SELECT lastSeenAt, lastCelebratedAt FROM NotificationSeen WHERE playerId = ?', [
    currentPlayerId,
  ]);
  if (!seen) {
    const now = new Date().toISOString();
    await query(
      'INSERT OR IGNORE INTO NotificationSeen (playerId, lastSeenAt, lastCelebratedAt) VALUES (?, ?, ?)',
      [currentPlayerId, now, now]
    );
    seen = { lastSeenAt: now, lastCelebratedAt: now } as any;
  }
  const lastSeenAt = String(seen!.lastSeenAt);
  const lastCelebratedAt = String(seen!.lastCelebratedAt);

  const unseenCount = feed.filter((e) => e.at > lastSeenAt).length;

  // Personal celebrations: YOUR wins newer than the celebration marker
  const celebrations: Celebration[] = [];
  for (const e of events) {
    if (e.playerId !== currentPlayerId || e.at <= lastCelebratedAt) continue;
    if (e.type === 'achievement') {
      celebrations.push({ id: e.id, kind: 'achievement', title: 'Achievement unlocked!', subtitle: e.title.replace(/^🎖️ /, ''), hex: e.hex });
    } else if (e.type === 'tier_up') {
      celebrations.push({ id: e.id, kind: 'tier', title: 'Tier up!', subtitle: e.title.replace(/^🏆 /, ''), hex: e.hex });
    } else if (e.type === 'stat_change') {
      celebrations.push({ id: e.id, kind: 'stat', title: e.title, subtitle: e.body || '', hex: e.hex });
    }
  }
  celebrations.reverse(); // oldest first, so the queue plays in order

  return { events: feed, unseenCount, celebrations: celebrations.slice(0, CELEBRATION_CAP) };
}

export async function markSeen(playerId: string, what: { seen?: boolean; celebrated?: boolean }): Promise<void> {
  await ensureTables();
  const now = new Date().toISOString();
  await query(
    'INSERT OR IGNORE INTO NotificationSeen (playerId, lastSeenAt, lastCelebratedAt) VALUES (?, ?, ?)',
    [playerId, now, now]
  );
  if (what.seen) await query('UPDATE NotificationSeen SET lastSeenAt = ? WHERE playerId = ?', [now, playerId]);
  if (what.celebrated) await query('UPDATE NotificationSeen SET lastCelebratedAt = ? WHERE playerId = ?', [now, playerId]);
}

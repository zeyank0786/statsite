import { query, queryOne, queryAll } from './db';
import { getStatTier } from './categories';
import { fetchAllPlayerStats, fetchAllHistory, buildPlayerAggregates } from './serverStats';
import { computeAchievements } from './achievements';
import { fetchSocialCounts } from './socialCounts';
import { getAllLocks } from './featureLocks';
import { getNudgesFor, NUDGE_KINDS } from './nudges';
import { getMentionsFor } from './mentionsServer';
import { getReminderFiresFor } from './reminders';
import { getRecentBroadcasts } from './broadcasts';
import { getRecentCompletions } from './ambitions';
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
 *
 * NotificationSectionSeen adds a second, finer watermark per section (the
 * first path segment of an event's href). Opening /suggestions marks the
 * "suggestions" section read, so its items stop counting toward the badge even
 * though the bell was never clicked. Events stay in the list either way — the
 * feed doubles as the crew's recent-activity log, so being read greys an item
 * rather than removing it.
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
    | 'nudge'
    | 'commitment'
    | 'mention'
    | 'reminder'
    | 'broadcast'
    | 'ambition';
  at: string;
  playerId: string;
  playerName: string;
  title: string;
  body?: string;
  href?: string;
  hex: string;
  /** Which page this belongs to; opening that page marks it read. */
  section: string;
  /** False = still counts toward the bell badge. */
  seen: boolean;
}

/**
 * The page an event belongs to, derived from its link's first path segment so
 * a new feed source needs no mapping table — /commitments/abc → "commitments".
 * Events with nowhere to go (lockouts) land in "general" and are only cleared
 * by opening the bell itself.
 */
export function sectionOfHref(href?: string): string {
  if (!href) return 'general';
  const segment = href.split('?')[0].split('#')[0].split('/').filter(Boolean)[0];
  return segment ? segment.toLowerCase() : 'home';
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
  // Per-section watermarks: opening a page clears its own items without
  // touching anything else in the feed.
  await query(
    `CREATE TABLE IF NOT EXISTS NotificationSectionSeen (
       playerId   TEXT NOT NULL,
       section    TEXT NOT NULL,
       lastSeenAt TEXT NOT NULL,
       PRIMARY KEY (playerId, section)
     )`
  );
  // Which achievement IDs the system has ever computed. Without this there's
  // no way to tell "you just earned this" from "this was invented today".
  await query(
    `CREATE TABLE IF NOT EXISTS AchievementCatalog (
       achievementId TEXT PRIMARY KEY,
       firstSeenAt   TEXT NOT NULL
     )`
  );
}

/**
 * Record any newly-earned achievements.
 *
 * Three cases, and they must not be confused with each other:
 *   · first run (no table)      — back-fill everything as epoch, silently
 *   · a newly INVENTED award    — back-fill current holders as epoch, silently
 *   · someone actually earned it — stamp now, which is what celebrates
 *
 * The middle case is why AchievementCatalog exists. Shipping a batch of new
 * definitions would otherwise read as everyone earning all of them at once,
 * and the celebration queue plays one full-screen modal at a time.
 */
async function syncAchievements(): Promise<void> {
  const [rows, history, social] = await Promise.all([fetchAllPlayerStats(), fetchAllHistory(), fetchSocialCounts()]);
  const players = buildPlayerAggregates(rows);
  const computed = computeAchievements(players, history, social);

  const existing = await queryAll('SELECT playerId, achievementId FROM AchievementEarned');
  const known = new Set((existing as any[]).map((r) => `${r.playerId}:${r.achievementId}`));
  const firstRun = existing.length === 0;

  const catalogued = new Set(
    ((await queryAll('SELECT achievementId FROM AchievementCatalog')) as any[]).map((r) =>
      String(r.achievementId)
    )
  );
  const epoch = new Date(0).toISOString();
  const now = new Date().toISOString();

  // Definitions are identical for every player, so one list names them all.
  const introduced = new Set<string>();
  for (const a of Object.values(computed)[0] || []) {
    if (catalogued.has(a.id)) continue;
    introduced.add(a.id);
    await query('INSERT OR IGNORE INTO AchievementCatalog (achievementId, firstSeenAt) VALUES (?, ?)', [
      a.id,
      now,
    ]);
  }

  for (const [playerId, list] of Object.entries(computed)) {
    for (const a of list) {
      if (!a.earned || known.has(`${playerId}:${a.id}`)) continue;
      const silent = firstRun || introduced.has(a.id);
      await query(
        'INSERT OR IGNORE INTO AchievementEarned (id, playerId, achievementId, name, earnedAt) VALUES (?, ?, ?, ?, ?)',
        [uuid(), playerId, a.id, a.name, silent ? epoch : now]
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

  // Sources build plain events; section and read-state are derived in one place
  // once the whole feed is assembled, so a new source can't forget to set them.
  const events: Omit<FeedEvent, 'section' | 'seen'>[] = [];

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

  // Commitments — made, resolved, or awaiting a verdict
  try {
    const commitments = await queryAll(
      `SELECT id, playerId, title, status, createdAt, resolvedAt, deadline
       FROM Commitment ORDER BY COALESCE(resolvedAt, createdAt) DESC LIMIT ${SOURCE_LIMIT}`
    );
    for (const c of commitments as any[]) {
      const pid = String(c.playerId);
      const status = String(c.status);
      const title = String(c.title);
      if (status === 'kept' || status === 'missed' || status === 'withdrawn') {
        const icon = status === 'kept' ? '✅' : status === 'missed' ? '❌' : '⏸️';
        events.push({
          id: `cmt-r:${c.id}`,
          type: 'commitment',
          at: String(c.resolvedAt || c.createdAt),
          playerId: pid,
          playerName: nameOf(pid),
          title: `${icon} ${nameOf(pid)} ${status} "${title}"`,
          href: `/commitments/${c.id}`,
          hex: status === 'kept' ? '#34d399' : status === 'missed' ? '#ef4444' : '#9ca3af',
        });
      } else if (status === 'awaiting_verdict' || status === 'withdraw_pending') {
        events.push({
          id: `cmt-v:${c.id}`,
          type: 'commitment',
          at: String(c.deadline),
          playerId: pid,
          playerName: nameOf(pid),
          title:
            status === 'withdraw_pending'
              ? `⏸️ ${nameOf(pid)} asked to withdraw "${title}"`
              : `⚖️ ${nameOf(pid)}'s "${title}" needs a verdict`,
          body: pid !== currentPlayerId ? 'Did they do it?' : undefined,
          href: `/commitments/${c.id}`,
          hex: '#a855f7',
        });
      } else {
        events.push({
          id: `cmt:${c.id}`,
          type: 'commitment',
          at: String(c.createdAt),
          playerId: pid,
          playerName: nameOf(pid),
          title: `📌 ${nameOf(pid)} committed to "${title}"`,
          href: `/commitments/${c.id}`,
          hex: '#22d3ee',
        });
      }
    }
  } catch {
    /* commitments table may not exist yet */
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

  // @mentions of you, anywhere
  try {
    for (const m of await getMentionsFor(currentPlayerId, SOURCE_LIMIT)) {
      events.push({
        id: `mention:${m.id}`,
        type: 'mention',
        at: m.createdAt,
        playerId: currentPlayerId,
        playerName: nameOf(currentPlayerId),
        title: `💬 ${m.byName} mentioned you`,
        body: m.snippet || undefined,
        href: m.url,
        hex: '#22d3ee',
      });
    }
  } catch {
    /* mentions degrade gracefully */
  }

  // Reminders that fired for you
  try {
    for (const rf of await getReminderFiresFor(currentPlayerId, SOURCE_LIMIT)) {
      events.push({
        id: `reminder:${rf.id}`,
        type: 'reminder',
        at: rf.firedAt,
        playerId: currentPlayerId,
        playerName: nameOf(currentPlayerId),
        title: `⏰ ${rf.title}`,
        body: rf.body || undefined,
        href: '/reminders',
        hex: '#38bdf8',
      });
    }
  } catch {
    /* reminders degrade gracefully */
  }

  // Ambition completions — a crew-wide moment everyone sees
  try {
    for (const a of await getRecentCompletions(SOURCE_LIMIT)) {
      const pid = a.playerId;
      events.push({
        id: `ambition:${a.id}`,
        type: 'ambition',
        at: a.completedAt || a.updatedAt,
        playerId: pid,
        playerName: nameOf(pid),
        title: `🎉 ${nameOf(pid)} completed an ambition!`,
        body: a.title,
        href: '/ambitions',
        hex: '#f5c451',
      });
    }
  } catch {
    /* ambitions degrade gracefully */
  }

  // Admin broadcasts — global announcements everyone sees
  try {
    for (const b of await getRecentBroadcasts(SOURCE_LIMIT)) {
      events.push({
        id: `broadcast:${b.id}`,
        type: 'broadcast',
        at: b.createdAt,
        playerId: b.createdById || '',
        playerName: b.createdByName || 'Admin',
        title: `📢 ${b.title}`,
        body: b.body || undefined,
        href: b.url || undefined,
        hex: '#f59e0b',
      });
    }
  } catch {
    /* broadcasts degrade gracefully */
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

  const enriched: FeedEvent[] = events.map((e) => ({
    ...e,
    section: sectionOfHref(e.href),
    seen: false, // resolved against the watermarks below
  }));
  enriched.sort((a, b) => (a.at < b.at ? 1 : -1));
  const feed = enriched.slice(0, FEED_LIMIT);

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

  // An event is read once EITHER the bell was opened after it (global marker)
  // or its own page was visited after it (section marker) — whichever is later
  // wins, so neither route can un-read something the other already cleared.
  const sectionRows = await queryAll(
    'SELECT section, lastSeenAt FROM NotificationSectionSeen WHERE playerId = ?',
    [currentPlayerId]
  );
  const sectionSeenAt = new Map(
    (sectionRows as any[]).map((r) => [String(r.section), String(r.lastSeenAt)])
  );
  for (const e of feed) {
    const sectionMark = sectionSeenAt.get(e.section) || '';
    e.seen = e.at <= lastSeenAt || e.at <= sectionMark;
  }

  const unseenCount = feed.filter((e) => !e.seen).length;

  // Personal celebrations: YOUR wins newer than the celebration marker
  const celebrations: Celebration[] = [];
  for (const e of enriched) {
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

export async function markSeen(
  playerId: string,
  what: { seen?: boolean; celebrated?: boolean; section?: string }
): Promise<void> {
  await ensureTables();
  const now = new Date().toISOString();
  await query(
    'INSERT OR IGNORE INTO NotificationSeen (playerId, lastSeenAt, lastCelebratedAt) VALUES (?, ?, ?)',
    [playerId, now, now]
  );
  if (what.seen) await query('UPDATE NotificationSeen SET lastSeenAt = ? WHERE playerId = ?', [now, playerId]);
  if (what.celebrated) await query('UPDATE NotificationSeen SET lastCelebratedAt = ? WHERE playerId = ?', [now, playerId]);
  // Visiting a page clears that page's items without touching the rest.
  if (what.section) {
    await query(
      `INSERT INTO NotificationSectionSeen (playerId, section, lastSeenAt) VALUES (?, ?, ?)
       ON CONFLICT(playerId, section) DO UPDATE SET lastSeenAt = excluded.lastSeenAt`,
      [playerId, what.section.toLowerCase(), now]
    );
  }
}

/**
 * Build a benchmark database shaped like production.
 *
 * Usage: DATABASE_URL=file:bench.db npx tsx scripts/bench/seed.ts
 *
 * The workload model is "4 people using the app regularly for six weeks":
 * a crew of four (plus one archived member), the canonical 7×10 stat sheet,
 * and six weeks of suggestions, votes, evidence, messages and review cycles
 * accumulated at a plausible daily rate. See WORKLOAD below — every count is
 * derived from a per-day rate so the assumptions are visible and adjustable.
 *
 * Deterministic: the same seed always produces the same database, so a
 * before/after comparison is measuring the code change and nothing else.
 */

import { createClient } from '@libsql/client';
import { CORE_TABLES, DRIFT_COLUMNS, BASELINE_INDEXES } from './schema';
import { CATEGORY_ORDER, CATEGORY_META, STAT_LETTER_ORDER } from '../../lib/categories';

const DB_URL = process.env.BENCH_DB || 'file:bench.db';

/** The usage model. Every table size below follows from these. */
export const WORKLOAD = {
  activePlayers: 4,
  archivedPlayers: 1,
  days: 42, // six weeks
  suggestionsPerDay: 10,
  statChangesPerDay: 14,
  evidencePerDay: 3.5,
  messagesPerDay: 6,
  repliesPerMessage: 1.5,
  reactionsPerMessage: 2,
  trainingGamesPerDay: 9,
  commitmentsPerWeek: 8,
  reviewCyclesTotal: 6, // one a week, each covering all four players
};

// Deterministic PRNG (mulberry32) — no dependency, reproducible across runs.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260817);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const NOW = new Date('2026-08-17T12:00:00.000Z').getTime();
const DAY = 86_400_000;
/** An ISO timestamp `daysBack` days ago, jittered within the day. */
const ago = (daysBack: number) => new Date(NOW - daysBack * DAY - Math.floor(rand() * DAY)).toISOString();

const db = createClient({ url: DB_URL });

let statementCount = 0;

/**
 * Writes are buffered and flushed in transactions. One round trip per INSERT
 * means one fsync per INSERT, which made seeding ~20k rows take longer than
 * the benchmark it exists to support.
 */
const pending: { sql: string; args: unknown[] }[] = [];
const BATCH = 500;

async function flush() {
  while (pending.length > 0) {
    const chunk = pending.splice(0, BATCH);
    await db.batch(chunk.map((s) => ({ sql: s.sql, args: s.args as never[] })));
  }
}

function run(sql: string, args: unknown[] = []) {
  statementCount++;
  pending.push({ sql, args });
  if (pending.length >= BATCH) return flush();
  return Promise.resolve();
}

/** DDL that is expected to fail once it has already been applied. */
async function tryRun(sql: string) {
  await flush();
  try {
    statementCount++;
    await db.execute(sql);
  } catch {
    /* already applied */
  }
}

async function main() {
  console.log(`Seeding ${DB_URL}`);

  for (const t of CORE_TABLES) await run(t);
  await flush();
  for (const c of DRIFT_COLUMNS) await tryRun(c);
  for (const i of BASELINE_INDEXES) await run(i);
  // The ensure*() helpers below open their own connection to the same file,
  // so everything buffered here has to land before they run.
  await flush();

  // Tables owned by ensure*() helpers — called rather than duplicated so this
  // seed cannot drift from the DDL the app actually ships.
  process.env.DATABASE_URL = DB_URL;
  const ensures = await Promise.all([
    import('../../lib/ambitions'),
    import('../../lib/automations'),
    import('../../lib/broadcasts'),
    import('../../lib/commitments'),
    import('../../lib/evidenceFolders'),
    import('../../lib/groupGoals'),
    import('../../lib/nudges'),
    import('../../lib/push'),
    import('../../lib/reminders'),
    import('../../lib/training'),
    import('../../lib/profile'),
  ]);
  await ensures[0].ensureAmbitionTables();
  await ensures[1].ensureAutomationTables();
  await ensures[2].ensureBroadcastTable();
  await ensures[3].ensureCommitmentTables();
  await ensures[4].ensureEvidenceFolderTables();
  await ensures[5].ensureGroupGoalTables();
  await ensures[6].ensureNudgeTable();
  await ensures[7].ensurePushTable();
  await ensures[8].ensureReminderTables();
  await ensures[9].ensureTrainingTables();
  await ensures[10].ensureProfileColumns();

  // Notification bookkeeping tables (private to lib/notifications).
  await run(`CREATE TABLE IF NOT EXISTS AchievementEarned (
    id TEXT PRIMARY KEY, playerId TEXT NOT NULL, achievementId TEXT NOT NULL,
    name TEXT NOT NULL, earnedAt TEXT NOT NULL, UNIQUE(playerId, achievementId))`);
  await run(`CREATE TABLE IF NOT EXISTS NotificationSeen (
    playerId TEXT PRIMARY KEY, lastSeenAt TEXT NOT NULL, lastCelebratedAt TEXT NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS NotificationSectionSeen (
    playerId TEXT NOT NULL, section TEXT NOT NULL, lastSeenAt TEXT NOT NULL,
    PRIMARY KEY (playerId, section))`);
  await run(`CREATE TABLE IF NOT EXISTS AchievementCatalog (
    achievementId TEXT PRIMARY KEY, firstSeenAt TEXT NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS Mention (
    id TEXT PRIMARY KEY, mentionedId TEXT NOT NULL, byId TEXT NOT NULL, context TEXT NOT NULL,
    url TEXT NOT NULL, snippet TEXT, createdAt TEXT NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS AppMigration (name TEXT PRIMARY KEY, ranAt TEXT NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS SeasonState (
    id TEXT PRIMARY KEY, seasonKey TEXT NOT NULL, rolledAt TEXT NOT NULL)`);

  // ---------------------------------------------------------------- players
  const players: { id: string; name: string; active: boolean }[] = [];
  const names = ['zeyan', 'sam', 'aria', 'kofi', 'dana'];
  for (let i = 0; i < WORKLOAD.activePlayers + WORKLOAD.archivedPlayers; i++) {
    const active = i < WORKLOAD.activePlayers;
    const id = `p${i + 1}`;
    players.push({ id, name: names[i], active });
    await run(
      `INSERT INTO Player (id, username, active, archivedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, names[i], active ? 1 : 0, active ? null : ago(20), ago(WORKLOAD.days), ago(0)]
    );
    if (active) {
      await run(
        `INSERT INTO User (id, email, password, playerId, isAdmin, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`u${i + 1}`, `${names[i]}@test.com`, 'x', id, i === 0 ? 1 : 0, ago(WORKLOAD.days), ago(0)]
      );
    }
  }
  const active = players.filter((p) => p.active);

  // ------------------------------------------------------- categories/stats
  const stats: { id: string; code: string; categoryId: string }[] = [];
  for (const code of CATEGORY_ORDER) {
    const meta = CATEGORY_META[code];
    await run(`INSERT INTO Category (id, code, label, emoji, createdAt) VALUES (?, ?, ?, ?, ?)`, [
      `c_${code}`, code, meta.label, '⭐', ago(WORKLOAD.days),
    ]);
    for (const letter of STAT_LETTER_ORDER) {
      const statCode = `${code}${letter}`;
      const id = `s_${statCode}`;
      stats.push({ id, code: statCode, categoryId: `c_${code}` });
      await run(`INSERT INTO Stat (id, code, label, categoryId, createdAt) VALUES (?, ?, ?, ?, ?)`, [
        id, statCode, `${meta.label} ${letter.toUpperCase()}`, `c_${code}`, ago(WORKLOAD.days),
      ]);
    }
  }

  // -------------------------------------------------- stat values + history
  const statValueIds: string[] = [];
  for (const p of active) {
    for (const s of stats) {
      const svId = `sv_${p.id}_${s.code}`;
      statValueIds.push(svId);
      await run(
        `INSERT INTO StatValue (id, statId, playerId, value, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [svId, s.id, p.id, int(5, 70), ago(WORKLOAD.days), ago(0)]
      );
    }
  }

  const historyCount = Math.round(WORKLOAD.statChangesPerDay * WORKLOAD.days);
  for (let i = 0; i < historyCount; i++) {
    const oldV = int(5, 60);
    await run(
      `INSERT INTO StatHistory (id, statValueId, oldValue, newValue, reason, changedById, source, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `sh_${i}`, pick(statValueIds), oldV, oldV + pick([-2, -1, 1, 1, 2]),
        'benchmark row', pick(active).id,
        pick(['suggestion', 'suggestion', 'review', 'admin_edit', 'commitment']),
        ago(rand() * WORKLOAD.days),
      ]
    );
  }

  // ------------------------------------------------------ suggestions/votes
  const suggestionCount = Math.round(WORKLOAD.suggestionsPerDay * WORKLOAD.days);
  let voteId = 0;
  for (let i = 0; i < suggestionCount; i++) {
    const subject = pick(active);
    const proposer = pick(active.filter((p) => p.id !== subject.id));
    // Most are resolved; a handful stay pending, as a live queue would.
    const pending = i >= suggestionCount - 12;
    const created = ago(pending ? rand() * 3 : 3 + rand() * (WORKLOAD.days - 3));
    const status = pending ? 'pending' : pick(['approved', 'approved', 'approved', 'rejected']);
    await run(
      `INSERT INTO Suggestion (id, playerId, proposedById, statId, delta, reason, status,
        createdAt, updatedAt, resolvedAt, testimony, batchId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `sg_${i}`, subject.id, proposer.id, pick(stats).id, pick([-2, -1, 1, 2]),
        'benchmark reason text that is roughly the length of a real one', status,
        created, created, pending ? null : created, 'testimony text', `batch_${Math.floor(i / 3)}`,
      ]
    );
    for (const voter of active) {
      if (voter.id === subject.id) continue;
      if (pending && rand() < 0.4) continue; // some votes not yet cast
      await run(
        `INSERT INTO Vote (id, suggestionId, userId, choice, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [`v_${voteId++}`, `sg_${i}`, voter.id, rand() < 0.8 ? 'yes' : 'no', created]
      );
    }
  }

  // ---------------------------------------------------------------- evidence
  const evidenceCount = Math.round(WORKLOAD.evidencePerDay * WORKLOAD.days);
  let evReadId = 0;
  for (let i = 0; i < evidenceCount; i++) {
    const poster = pick(active);
    const at = ago(rand() * WORKLOAD.days);
    await run(
      `INSERT INTO Evidence (id, playerId, mediaUrl, mediaType, caption, captionHidden, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [`ev_${i}`, poster.id, 'https://example/img.jpg', 'image', 'benchmark caption', at, at]
    );
    await run(`INSERT INTO EvidenceCategory (evidenceId, categoryId) VALUES (?, ?)`, [
      `ev_${i}`, `c_${pick(CATEGORY_ORDER)}`,
    ]);
    for (const reader of active) {
      if (reader.id === poster.id) continue;
      if (rand() < 0.15) continue; // a few genuinely unread
      await run(
        `INSERT INTO EvidenceRead (id, evidenceId, userId, readAt) VALUES (?, ?, ?, ?)`,
        [`evr_${evReadId++}`, `ev_${i}`, reader.id, at]
      );
    }
    if (rand() < 0.5) {
      await run(`INSERT OR IGNORE INTO SuggestionEvidence (suggestionId, evidenceId) VALUES (?, ?)`, [
        `sg_${int(0, suggestionCount - 1)}`, `ev_${i}`,
      ]);
    }
  }

  // ---------------------------------------------------------------- messages
  const messageCount = Math.round(WORKLOAD.messagesPerDay * WORKLOAD.days);
  let replyId = 0, reactionId = 0, mentionId = 0, msgReadId = 0;
  for (let i = 0; i < messageCount; i++) {
    const author = pick(active);
    const at = ago(rand() * WORKLOAD.days);
    const refStat = rand() < 0.25 ? pick(stats) : null;
    await run(
      `INSERT INTO Message (id, content, authorId, referencedStatId, referencedPlayerId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`m_${i}`, 'benchmark message content of a realistic length', author.id,
       refStat ? refStat.id : null, refStat ? pick(active).id : null, at, at]
    );
    for (let r = 0; r < Math.round(WORKLOAD.repliesPerMessage * (rand() < 0.5 ? 0.5 : 1.5)); r++) {
      await run(
        `INSERT INTO MessageReply (id, messageId, content, authorId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`mr_${replyId++}`, `m_${i}`, 'benchmark reply', pick(active).id, at, at]
      );
    }
    for (const reactor of active) {
      if (rand() > WORKLOAD.reactionsPerMessage / active.length) continue;
      await run(
        `INSERT OR IGNORE INTO MessageReaction (id, messageId, userId, emoji, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [`mrx_${reactionId++}`, `m_${i}`, reactor.id, pick(['🔥', '💪', '👏']), at]
      );
    }
    if (rand() < 0.4) {
      await run(
        `INSERT INTO MessageMention (id, messageId, type, targetId, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [`mm_${mentionId++}`, `m_${i}`, rand() < 0.5 ? 'player' : 'evidence',
         rand() < 0.5 ? pick(active).id : `ev_${int(0, evidenceCount - 1)}`, at]
      );
    }
    for (const reader of active) {
      if (rand() < 0.12) continue;
      await run(`INSERT INTO MessageRead (id, messageId, userId, readAt) VALUES (?, ?, ?, ?)`, [
        `mrd_${msgReadId++}`, `m_${i}`, reader.id, at,
      ]);
    }
  }

  // ------------------------------------------------------------- review data
  for (let c = 0; c < WORKLOAD.reviewCyclesTotal; c++) {
    const at = ago((c + 1) * 7);
    await run(`INSERT INTO ReviewCycle (id, label, status, createdAt) VALUES (?, ?, ?, ?)`, [
      `rc_${c}`, `Week ${c + 1}`, c === 0 ? 'open' : 'closed', at,
    ]);
    for (const target of active) {
      const sid = `rs_${c}_${target.id}`;
      await run(
        `INSERT INTO ReviewSession (id, cycleId, targetPlayerId, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sid, `rc_${c}`, target.id, c === 0 ? 'open' : 'closed', at, at]
      );
      for (const p of active) {
        await run(
          `INSERT INTO ReviewParticipant (id, sessionId, playerId, role, createdAt) VALUES (?, ?, ?, ?, ?)`,
          [`rp_${sid}_${p.id}`, sid, p.id, p.id === target.id ? 'subject' : 'reviewer', at]
        );
      }
      for (const s of stats) {
        await run(
          `INSERT INTO ReviewSessionStat (id, sessionId, statId, oldValue, proposedValue, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [`rss_${sid}_${s.code}`, sid, s.id, int(5, 60), int(5, 70), at, at]
        );
      }
    }
  }

  // ------------------------------------------------- commitments + training
  const commitmentCount = Math.round((WORKLOAD.commitmentsPerWeek * WORKLOAD.days) / 7);
  for (let i = 0; i < commitmentCount; i++) {
    const at = ago(rand() * WORKLOAD.days);
    await run(
      `INSERT INTO Commitment (id, playerId, title, detail, cadence, deadline, status, createdAt, updatedAt, resolvedAt)
       VALUES (?, ?, ?, ?, 'none', ?, ?, ?, ?, ?)`,
      [`cm_${i}`, pick(active).id, 'benchmark commitment', 'detail', ago(-7),
       pick(['kept', 'kept', 'missed', 'active']), at, at, at]
    );
  }

  const trainingCount = Math.round(WORKLOAD.trainingGamesPerDay * WORKLOAD.days);
  for (let i = 0; i < trainingCount; i++) {
    await run(
      `INSERT INTO TrainingResult (id, playerId, gameId, score, detail, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`tr_${i}`, pick(active).id, pick(['arithmetic', 'stroop', 'focus', 'search']),
       int(10, 400), '{}', ago(rand() * WORKLOAD.days)]
    );
  }

  // ------------------------------------------------- feed side-channel data
  // Small tables, but the notification feed reads every one of them on each
  // poll, so leaving them empty would understate the cost of a feed build.
  for (let i = 0; i < 60; i++) {
    const target = pick(active);
    const at = ago(rand() * WORKLOAD.days);
    await run(
      `INSERT INTO Mention (id, mentionedId, byId, context, url, snippet, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`mn_${i}`, target.id, pick(active).id, 'message', '/messages', 'benchmark snippet', at]
    );
  }
  for (let i = 0; i < 40; i++) {
    await run(
      `INSERT INTO Nudge (id, fromPlayerId, toPlayerId, kind, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [`nd_${i}`, pick(active).id, pick(active).id, 'vote', ago(rand() * WORKLOAD.days)]
    );
  }
  for (let i = 0; i < 12; i++) {
    await run(
      `INSERT INTO Broadcast (id, title, body, url, createdById, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [`bc_${i}`, 'benchmark broadcast', 'body', '/', pick(active).id, ago(rand() * WORKLOAD.days)]
    );
  }
  for (let i = 0; i < 20; i++) {
    const at = ago(rand() * WORKLOAD.days);
    await run(
      `INSERT INTO Ambition (id, playerId, title, detail, status, completedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`am_${i}`, pick(active).id, 'benchmark ambition', 'detail',
       pick(['active', 'completed', 'completed']), at, at, at]
    );
  }
  for (let i = 0; i < 30; i++) {
    await run(
      `INSERT INTO ReminderFire (id, reminderId, playerId, title, body, firedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`rf_${i}`, `rem_${i % 5}`, pick(active).id, 'benchmark reminder', 'body',
       ago(rand() * WORKLOAD.days)]
    );
  }

  // ------------------------------------------------ achievements + watermarks
  let achId = 0;
  for (const p of active) {
    for (let a = 0; a < 30; a++) {
      await run(
        `INSERT OR IGNORE INTO AchievementEarned (id, playerId, achievementId, name, earnedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [`ae_${achId++}`, p.id, `ach_${a}`, `Achievement ${a}`, ago(rand() * WORKLOAD.days)]
      );
    }
    await run(
      `INSERT OR IGNORE INTO NotificationSeen (playerId, lastSeenAt, lastCelebratedAt) VALUES (?, ?, ?)`,
      [p.id, ago(1), ago(1)]
    );
  }
  for (let a = 0; a < 49; a++) {
    await run(`INSERT OR IGNORE INTO AchievementCatalog (achievementId, firstSeenAt) VALUES (?, ?)`, [
      `ach_${a}`, ago(WORKLOAD.days),
    ]);
  }

  // ------------------------------------------------------------------ report
  await flush();
  const tables = await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  console.log(`\n${statementCount} statements. Table sizes:`);
  const sizes: Record<string, number> = {};
  for (const t of tables.rows) {
    const name = String(t.name);
    const c = await db.execute(`SELECT COUNT(*) as c FROM "${name}"`);
    const n = Number(c.rows[0].c);
    sizes[name] = n;
    if (n > 0) console.log(`  ${name.padEnd(24)} ${String(n).padStart(6)}`);
  }
  console.log(`\nTotal rows: ${Object.values(sizes).reduce((a, b) => a + b, 0)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

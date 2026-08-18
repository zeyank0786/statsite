import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type Client } from '@libsql/client';

/**
 * The nav badge counts are the most frequently executed queries in the app —
 * every open tab, every 15 seconds — so they were rewritten from
 * `id NOT IN (SELECT ...)` (which materialises the whole read table) to a
 * LEFT JOIN with an `IS NULL` test, plus a time window.
 *
 * That is a behaviour-preserving claim, and this file is what makes it one:
 * both forms are run against the same data and required to agree. The window
 * is the single intended difference, tested separately at its boundary.
 */

// In-memory: nothing to clean up, and Windows will not release a SQLite file
// handle promptly enough for a temp directory to be removed at teardown.
let db: Client;

const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

/** The pre-change query: kept here purely as the thing to agree with. */
const OLD_MESSAGES = `SELECT COUNT(*) as c FROM Message m
   WHERE m.id NOT IN (SELECT messageId FROM MessageRead WHERE userId = ?)`;

/** The current query, minus the window, so the two are comparable. */
const NEW_MESSAGES = `SELECT COUNT(*) as c
   FROM Message m
   LEFT JOIN MessageRead r ON r.messageId = m.id AND r.userId = ?
  WHERE r.messageId IS NULL`;

const OLD_EVIDENCE = `SELECT COUNT(*) as c FROM Evidence e
   WHERE e.playerId != ?
     AND e.id NOT IN (SELECT evidenceId FROM EvidenceRead WHERE userId = ?)`;

const NEW_EVIDENCE = `SELECT COUNT(*) as c
   FROM Evidence e
   LEFT JOIN EvidenceRead r ON r.evidenceId = e.id AND r.userId = ?
  WHERE e.playerId != ? AND r.evidenceId IS NULL`;

const OLD_SUGGESTIONS = `SELECT COUNT(*) as c FROM Suggestion s
   WHERE s.status = 'pending' AND s.playerId != ?
     AND NOT EXISTS (SELECT 1 FROM Vote v WHERE v.suggestionId = s.id AND v.userId = ?)`;

const NEW_SUGGESTIONS = `SELECT COUNT(*) as c
   FROM Suggestion s
   LEFT JOIN Vote v ON v.suggestionId = s.id AND v.userId = ?
  WHERE s.status = 'pending' AND s.playerId != ? AND v.suggestionId IS NULL`;

const count = async (sql: string, args: unknown[]) => {
  const r = await db.execute({ sql, args: args as never[] });
  return Number(r.rows[0].c);
};

beforeAll(async () => {
  db = createClient({ url: ':memory:' });

  await db.batch([
    `CREATE TABLE Message (id TEXT PRIMARY KEY, createdAt TEXT NOT NULL)`,
    `CREATE TABLE MessageRead (messageId TEXT, userId TEXT, UNIQUE(messageId, userId))`,
    `CREATE TABLE Evidence (id TEXT PRIMARY KEY, playerId TEXT NOT NULL, createdAt TEXT NOT NULL)`,
    `CREATE TABLE EvidenceRead (evidenceId TEXT, userId TEXT, UNIQUE(evidenceId, userId))`,
    `CREATE TABLE Suggestion (id TEXT PRIMARY KEY, playerId TEXT NOT NULL, status TEXT NOT NULL)`,
    `CREATE TABLE Vote (suggestionId TEXT, userId TEXT, UNIQUE(suggestionId, userId))`,
  ]);

  // Messages: 5 recent, 3 read by "me"; plus 2 old ones nobody has read.
  const messages = [];
  for (let i = 0; i < 5; i++) messages.push({ sql: `INSERT INTO Message VALUES (?, ?)`, args: [`m${i}`, iso(i * DAY)] });
  for (let i = 0; i < 2; i++)
    messages.push({ sql: `INSERT INTO Message VALUES (?, ?)`, args: [`old${i}`, iso(90 * DAY)] });
  for (const id of ['m0', 'm1', 'm2'])
    messages.push({ sql: `INSERT INTO MessageRead VALUES (?, ?)`, args: [id, 'me'] });
  // A read by someone else must not count as read by me.
  messages.push({ sql: `INSERT INTO MessageRead VALUES (?, ?)`, args: ['m3', 'someone-else'] });
  await db.batch(messages as never[]);

  // Evidence: 4 posts, one of them mine (never unread), 1 read.
  await db.batch([
    { sql: `INSERT INTO Evidence VALUES (?, ?, ?)`, args: ['e0', 'me', iso(DAY)] },
    { sql: `INSERT INTO Evidence VALUES (?, ?, ?)`, args: ['e1', 'them', iso(DAY)] },
    { sql: `INSERT INTO Evidence VALUES (?, ?, ?)`, args: ['e2', 'them', iso(2 * DAY)] },
    { sql: `INSERT INTO Evidence VALUES (?, ?, ?)`, args: ['e3', 'them', iso(3 * DAY)] },
    { sql: `INSERT INTO EvidenceRead VALUES (?, ?)`, args: ['e1', 'me'] },
  ] as never[]);

  // Suggestions: pending/resolved, mine/theirs, voted/unvoted.
  await db.batch([
    { sql: `INSERT INTO Suggestion VALUES (?, ?, ?)`, args: ['s0', 'them', 'pending'] },
    { sql: `INSERT INTO Suggestion VALUES (?, ?, ?)`, args: ['s1', 'them', 'pending'] },
    { sql: `INSERT INTO Suggestion VALUES (?, ?, ?)`, args: ['s2', 'me', 'pending'] },
    { sql: `INSERT INTO Suggestion VALUES (?, ?, ?)`, args: ['s3', 'them', 'approved'] },
    { sql: `INSERT INTO Vote VALUES (?, ?)`, args: ['s0', 'me'] },
    { sql: `INSERT INTO Vote VALUES (?, ?)`, args: ['s1', 'someone-else'] },
  ] as never[]);
});

afterAll(() => {
  db.close();
});

describe('pulse counts: LEFT JOIN rewrite matches the original NOT IN', () => {
  it('counts unread messages identically', async () => {
    const [oldCount, newCount] = await Promise.all([
      count(OLD_MESSAGES, ['me']),
      count(NEW_MESSAGES, ['me']),
    ]);
    expect(newCount).toBe(oldCount);
    // 7 messages, 3 read by me → 4 unread (m3, m4, old0, old1)
    expect(newCount).toBe(4);
  });

  it('counts unread evidence identically, still excluding your own posts', async () => {
    const [oldCount, newCount] = await Promise.all([
      count(OLD_EVIDENCE, ['me', 'me']),
      count(NEW_EVIDENCE, ['me', 'me']),
    ]);
    expect(newCount).toBe(oldCount);
    // e0 is mine, e1 is read → e2 and e3 remain
    expect(newCount).toBe(2);
  });

  it('counts suggestions awaiting your vote identically', async () => {
    const [oldCount, newCount] = await Promise.all([
      count(OLD_SUGGESTIONS, ['me', 'me']),
      count(NEW_SUGGESTIONS, ['me', 'me']),
    ]);
    expect(newCount).toBe(oldCount);
    // s0 voted, s2 is about me, s3 resolved → only s1
    expect(newCount).toBe(1);
  });

  it("someone else's read does not mark an item read for you", async () => {
    const forThem = await count(NEW_MESSAGES, ['someone-else']);
    // They have read exactly one (m3), so 6 of 7 remain unread for them.
    expect(forThem).toBe(6);
  });
});

describe('pulse counts: the 60-day window is the only intended difference', () => {
  const windowed = `SELECT COUNT(*) as c
     FROM Message m
     LEFT JOIN MessageRead r ON r.messageId = m.id AND r.userId = ?
    WHERE m.createdAt >= ? AND r.messageId IS NULL`;

  it('excludes items older than the window', async () => {
    const since = new Date(Date.now() - 60 * DAY).toISOString();
    const inWindow = await count(windowed, ['me', since]);
    const unbounded = await count(NEW_MESSAGES, ['me']);
    // The two 90-day-old messages drop out; the recent unread ones stay.
    expect(inWindow).toBe(2);
    expect(unbounded).toBe(4);
  });

  it('keeps an item that sits just inside the boundary', async () => {
    await db.execute({
      sql: `INSERT INTO Message VALUES (?, ?)`,
      args: ['edge', iso(59 * DAY)],
    });
    const since = new Date(Date.now() - 60 * DAY).toISOString();
    expect(await count(windowed, ['me', since])).toBe(3);
  });
});

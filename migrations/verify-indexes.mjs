// Confirm the read-reduction indexes are in place AND actually being used.
//
// Usage:
//   node migrations/verify-indexes.mjs "<db-url>"
//
// Counting indexes only proves they exist. What matters is whether SQLite's
// planner picks them: the whole point was to stop "ORDER BY createdAt DESC
// LIMIT 30" from reading and sorting a whole table to return 30 rows. So each
// hot query is run through EXPLAIN QUERY PLAN and checked for the fingerprint
// of the bad plan — "USE TEMP B-TREE FOR ORDER BY".
import { createClient } from '@libsql/client';

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error('Usage: node migrations/verify-indexes.mjs "<db-url>"');
  process.exit(2);
}

const db = createClient({ url });

/** Queries this app runs constantly, and what each one is for. */
const HOT_QUERIES = [
  {
    what: 'notification feed — stat changes',
    sql: `SELECT sh.id, sh.createdAt FROM StatHistory sh
          JOIN StatValue sv ON sh.statValueId = sv.id
          ORDER BY sh.createdAt DESC LIMIT 30`,
  },
  {
    what: 'activity ticker — evidence',
    sql: `SELECT id, playerId, createdAt FROM Evidence ORDER BY createdAt DESC LIMIT 12`,
  },
  {
    what: 'suggestions — resolved history',
    sql: `SELECT id FROM Suggestion WHERE status != 'pending'
          ORDER BY COALESCE(resolvedAt, createdAt) DESC LIMIT 21`,
  },
  {
    what: 'suggestions — live queue',
    sql: `SELECT id FROM Suggestion WHERE status = 'pending' ORDER BY createdAt DESC`,
  },
  {
    what: 'nav badge — unread messages',
    sql: `SELECT COUNT(*) FROM Message m
          LEFT JOIN MessageRead r ON r.messageId = m.id AND r.userId = 'x'
          WHERE m.createdAt >= '2020-01-01' AND r.messageId IS NULL`,
  },
];

console.log(`Checking ${url.replace(/authToken=[^&]*/, 'authToken=***')}\n`);

const indexes = await db.execute(
  `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name`
);
console.log(`Indexes named idx_*: ${indexes.rows.length}`);
console.log(`  (expect 47 after the migration: 38 new + 9 pre-existing)\n`);

let bad = 0;
for (const q of HOT_QUERIES) {
  let plan;
  try {
    plan = await db.execute(`EXPLAIN QUERY PLAN ${q.sql}`);
  } catch (e) {
    console.log(`  ?  ${q.what}\n     -> could not check: ${e.message}`);
    continue;
  }
  const details = plan.rows.map((r) => String(r.detail));
  const sorts = details.some((d) => /USE TEMP B-TREE FOR ORDER BY/i.test(d));
  const usesIndex = details.some((d) => /USING (COVERING )?INDEX idx_/i.test(d));

  if (sorts) {
    bad++;
    console.log(`  ✗  ${q.what}`);
    console.log(`     -> sorting a whole table; the index for this is missing`);
  } else {
    console.log(`  ${usesIndex ? '✓' : '·'}  ${q.what}`);
  }
  for (const d of details) console.log(`        ${d}`);
}

console.log(
  bad === 0
    ? '\nAll good — no query is sorting a whole table to answer a LIMIT.'
    : `\n${bad} quer${bad === 1 ? 'y is' : 'ies are'} still sorting whole tables. Re-run the migration.`
);
if (bad > 0) process.exitCode = 1;

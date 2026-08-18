// Apply a .sql migration file to any libsql/Turso database.
//
// Usage:
//   node migrations/run.mjs <file.sql> [db-url]
//
// Examples:
//   node migrations/run.mjs migrations/2026-08-17-read-reduction-indexes.sql
//   node migrations/run.mjs migrations/2026-08-17-read-reduction-indexes.sql "$DATABASE_URL"
//
// Defaults to file:./dev.db. For Turso pass the full DATABASE_URL including
// its authToken query parameter — the same string the app runs with.
//
// Statements are applied one at a time and reported individually. A statement
// that fails because its table does not exist yet is reported as SKIP rather
// than FAIL: index files intentionally cover tables that some deployments
// create lazily, and a missing one is not an error.
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const [fileArg, urlArg] = process.argv.slice(2);

if (!fileArg) {
  console.error('Usage: node migrations/run.mjs <file.sql> [db-url]');
  process.exit(2);
}

const url = urlArg || process.env.DATABASE_URL || 'file:./dev.db';
const db = createClient({ url });

const sql = readFileSync(resolve(fileArg), 'utf8');
const statements = sql
  .replace(/--[^\n]*/g, '') // strip comments BEFORE splitting on ';'
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const short = (s) => s.slice(0, 72).replace(/\s+/g, ' ');
const isMissingTable = (msg) => /no such table|no such column/i.test(msg);

let ok = 0;
let skipped = 0;
let failed = 0;

console.log(`Applying ${statements.length} statements from ${fileArg}`);
console.log(`  → ${url.replace(/authToken=[^&]*/, 'authToken=***')}\n`);

for (const stmt of statements) {
  try {
    await db.execute(stmt);
    ok++;
    console.log('OK   ', short(stmt));
  } catch (e) {
    const msg = String(e.message || e);
    if (isMissingTable(msg)) {
      skipped++;
      console.log('SKIP ', short(stmt), '\n      -> table not present on this database');
    } else {
      failed++;
      console.error('FAIL ', short(stmt), '\n      ->', msg);
    }
  }
}

console.log(`\n${ok} applied, ${skipped} skipped, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

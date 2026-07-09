// Run the rework migration against a local SQLite file.
// Usage: node migrations/run-local.mjs [db-url]   (default: file:./dev.db)
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const url = process.argv[2] || 'file:./dev.db';
const db = createClient({ url });

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '2026-07-09-full-rework.sql'), 'utf8');
const statements = sql
  .replace(/--[^\n]*/g, '') // strip comments BEFORE splitting on ';'
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  try {
    await db.execute(stmt);
    console.log('OK  ', stmt.slice(0, 70).replace(/\s+/g, ' '));
  } catch (e) {
    console.error('FAIL', stmt.slice(0, 70).replace(/\s+/g, ' '), '\n     ->', e.message);
    process.exitCode = 1;
  }
}

// Local-only convenience: make the seeded test account an admin too.
try {
  await db.execute("UPDATE User SET isAdmin = 1 WHERE email = 'player1@test.com'");
  console.log('OK   local test admin set (player1@test.com)');
} catch (e) {
  console.error('FAIL local admin update ->', e.message);
}

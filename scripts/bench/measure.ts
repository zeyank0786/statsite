/**
 * Measure what each hot request path costs, and extrapolate to a monthly bill.
 *
 * Usage:
 *   BENCH_DB=file:bench.db npx tsx scripts/bench/measure.ts [--save label]
 *   npx tsx scripts/bench/measure.ts --compare before.json after.json
 *
 * Measured exactly: SQL statements issued, rows returned, wall-clock.
 * Modelled: rows READ, derived from EXPLAIN QUERY PLAN against real table
 * cardinalities and measured index fanouts (see rowModel.ts). Turso bills the
 * modelled number, and it is not observable from the client — but the same
 * model runs on both sides of a comparison, so the ratio is sound.
 */

import { writeFileSync, readFileSync } from 'fs';
import { recordQueries, getDb } from '../../lib/db';
import { RowModel } from './rowModel';
import { SCENARIOS } from './scenarios';
import { BASELINE_SCENARIOS } from './baseline';
import { USAGE, extrapolate, formatReport } from './usage';

const DB_URL = process.env.BENCH_DB || 'file:bench.db';
process.env.DATABASE_URL = DB_URL;

/** `--baseline` measures the frozen pre-change code paths instead. */
const USE_BASELINE = process.argv.includes('--baseline');

export interface ScenarioResult {
  name: string;
  trigger: string;
  queries: number;
  rowsRead: number;
  rowsReturned: number;
  ms: number;
  scannedTables: string[];
  transcribed: boolean;
  sharesCrewStats: boolean;
}

async function measure(): Promise<ScenarioResult[]> {
  // The same connection the app uses. A second client against the same file
  // makes the achievement sync's writes collide with the model's reads
  // (SQLITE_BUSY), which silently drops the most expensive query in the app
  // out of the measurement.
  const db = getDb();
  const model = new RowModel(db);
  const results: ScenarioResult[] = [];

  const player = await db.execute('SELECT id FROM Player WHERE active = 1 LIMIT 1');
  const playerId = String(player.rows[0].id);

  for (const scenario of USE_BASELINE ? BASELINE_SCENARIOS : SCENARIOS) {
    // Warm any lazily-created tables and module imports first, so the measured
    // pass reflects a steady-state request rather than a cold one.
    try {
      await scenario.run(playerId);
    } catch (e) {
      console.error(`  ! ${scenario.name} warmup failed: ${(e as Error).message}`);
    }

    const started = performance.now();
    let captured;
    try {
      captured = await recordQueries(() => scenario.run(playerId));
    } catch (e) {
      console.error(`  ! ${scenario.name} failed: ${(e as Error).message}`);
      continue;
    }
    const ms = performance.now() - started;

    let rowsRead = 0;
    let rowsReturned = 0;
    const scanned = new Set<string>();
    const detail: { rows: number; sql: string; sorts: number }[] = [];
    for (const q of captured.queries) {
      const cost = await model.cost(q.sql, q.params);
      rowsRead += cost.rowsRead;
      rowsReturned += q.rowsReturned;
      for (const t of cost.scannedTables) scanned.add(t);
      detail.push({ rows: cost.rowsRead, sql: q.sql, sorts: cost.sorts });
    }

    if (process.argv.includes('--detail')) {
      console.log(`\n  ── ${scenario.name} ──`);
      for (const d of detail.sort((a, b) => b.rows - a.rows).slice(0, 8)) {
        const flat = d.sql.replace(/\s+/g, ' ').trim().slice(0, 100);
        console.log(
          `    ${String(d.rows).padStart(7)}${d.sorts ? ' [sort]' : '       '}  ${flat}`
        );
      }
      console.log('');
    }

    results.push({
      name: scenario.name,
      trigger: scenario.trigger,
      queries: captured.queries.length,
      rowsRead,
      rowsReturned,
      ms,
      scannedTables: [...scanned].sort(),
      transcribed: Boolean(scenario.transcribed),
      sharesCrewStats: Boolean(scenario.sharesCrewStats),
    });
    console.log(
      `  ${scenario.name.padEnd(16)} ${String(captured.queries.length).padStart(5)} queries  ` +
        `${rowsRead.toLocaleString().padStart(12)} rows read  ${ms.toFixed(0).padStart(6)}ms`
    );
  }

  return results;
}

function table(results: ScenarioResult[]) {
  const head = ['path', 'queries', 'rows read', 'returned', 'ms', 'full scans of'];
  const rows = results.map((r) => [
    r.name,
    String(r.queries),
    r.rowsRead.toLocaleString(),
    r.rowsReturned.toLocaleString(),
    r.ms.toFixed(0),
    r.scannedTables.slice(0, 4).join(', ') + (r.scannedTables.length > 4 ? ` +${r.scannedTables.length - 4}` : ''),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log('\n' + line(head));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
}

function compare(beforePath: string, afterPath: string) {
  const before: ScenarioResult[] = JSON.parse(readFileSync(beforePath, 'utf8'));
  const after: ScenarioResult[] = JSON.parse(readFileSync(afterPath, 'utf8'));
  const byName = new Map(after.map((r) => [r.name, r]));

  const head = ['path', 'before', 'after', 'change', 'queries'];
  const rows: string[][] = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const b of before) {
    const a = byName.get(b.name);
    if (!a) continue;
    totalBefore += b.rowsRead;
    totalAfter += a.rowsRead;
    const pct = b.rowsRead === 0 ? 0 : ((b.rowsRead - a.rowsRead) / b.rowsRead) * 100;
    rows.push([
      b.name,
      b.rowsRead.toLocaleString(),
      a.rowsRead.toLocaleString(),
      `${pct >= 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%`,
      `${b.queries} → ${a.queries}`,
    ]);
  }

  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log('\nPer request:\n');
  console.log(line(head));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));

  const pct = ((totalBefore - totalAfter) / totalBefore) * 100;
  console.log(
    `\nSum per request: ${totalBefore.toLocaleString()} → ${totalAfter.toLocaleString()} (−${pct.toFixed(1)}%)`
  );

  console.log('\n' + '═'.repeat(76));
  console.log(`EXTRAPOLATED — ${USAGE.users} users, ${USAGE.description}`);
  console.log('═'.repeat(76));
  console.log(formatReport(extrapolate(before), extrapolate(after)));
}

async function main() {
  const args = process.argv.slice(2);
  const compareIndex = args.indexOf('--compare');
  if (compareIndex !== -1) {
    compare(args[compareIndex + 1], args[compareIndex + 2]);
    return;
  }

  console.log(`Measuring against ${DB_URL}\n`);
  const results = await measure();
  table(results);

  console.log('\n' + '═'.repeat(76));
  console.log(`EXTRAPOLATED — ${USAGE.users} users, ${USAGE.description}`);
  console.log('═'.repeat(76));
  console.log(formatReport(extrapolate(results)));

  const saveIndex = args.indexOf('--save');
  if (saveIndex !== -1) {
    const path = args[saveIndex + 1];
    writeFileSync(path, JSON.stringify(results, null, 2));
    console.log(`\nSaved to ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

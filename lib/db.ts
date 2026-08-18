import { createClient } from '@libsql/client';

let db: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    db = createClient({ url });
  }
  return db;
}

/**
 * Optional recorder for whatever SQL a block of code ends up running.
 *
 * Turso bills rows READ, which is invisible from inside the app — a query that
 * returns 30 rows may have scanned 30,000 to find them. `scripts/bench` turns
 * this on, runs a page's real server-side code path, then puts every captured
 * statement through EXPLAIN QUERY PLAN to work out what it actually cost.
 *
 * Off by default and a single null check when off, so it is free in production.
 */
export interface RecordedQuery {
  sql: string;
  params: unknown[];
  ms: number;
  rowsReturned: number;
}

let recorder: RecordedQuery[] | null = null;

/** Collect every statement run by `fn`. Not re-entrant; benchmark use only. */
export async function recordQueries<T>(
  fn: () => Promise<T>
): Promise<{ result: T; queries: RecordedQuery[] }> {
  const sink: RecordedQuery[] = [];
  const previous = recorder;
  recorder = sink;
  try {
    const result = await fn();
    return { result, queries: sink };
  } finally {
    recorder = previous;
  }
}

export async function query(sql: string, params?: any[]) {
  const client = getDb();
  const startedAt = recorder ? performance.now() : 0;
  try {
    const result = await client.execute({
      sql,
      args: params || [],
    });
    if (recorder) {
      recorder.push({
        sql,
        params: params || [],
        ms: performance.now() - startedAt,
        rowsReturned: result.rows.length,
      });
    }
    return result;
  } catch (error) {
    console.error('Database query error:', { sql, params, error });
    throw error;
  }
}

export async function queryOne(sql: string, params?: any[]) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

export async function queryAll(sql: string, params?: any[]) {
  const result = await query(sql, params);
  return result.rows;
}

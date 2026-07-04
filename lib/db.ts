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

export async function query(sql: string, params?: any[]) {
  const client = getDb();
  try {
    const result = await client.execute({
      sql,
      args: params || [],
    });
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

import { createClient } from '@libsql/client';

let db: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    db = createClient({
      url: databaseUrl,
    });
  }
  return db;
}

export async function closeDb() {
  if (db) {
    await db.close();
    db = null;
  }
}

import { query, queryAll } from './db';
import { isPointerText, mergeAccount } from './suggestionText';

/**
 * One-shot repair of stat history that recorded a pointer instead of an
 * explanation.
 *
 * While suggestions had two text boxes, only `reason` reached StatHistory. Any
 * time the real account went in the testimony box and `reason` said "see other
 * relevant box", the permanent record kept the pointer. This walks the
 * already-applied suggestion history and rewrites those rows with the merged
 * account.
 *
 * Runs lazily (from the suggestions listing) rather than as a deploy step,
 * matching how the rest of the app migrates itself. A marker row makes it a
 * genuine one-shot across cold starts; the in-process flag keeps concurrent
 * requests in the same lambda from racing.
 */

const MARKER = 'statHistory-pointer-reasons-v1';
let doneInProcess = false;

async function ensureMarkerTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS AppMigration (
       key       TEXT PRIMARY KEY,
       appliedAt TEXT NOT NULL,
       note      TEXT
     )`
  );
}

export async function backfillPointerHistory(): Promise<{ repaired: number; skipped: boolean }> {
  if (doneInProcess) return { repaired: 0, skipped: true };

  await ensureMarkerTable();
  const already = await queryAll('SELECT key FROM AppMigration WHERE key = ?', [MARKER]);
  if (already.length > 0) {
    doneInProcess = true;
    return { repaired: 0, skipped: true };
  }

  // applyApproval() stamps the StatHistory row with the same timestamp it sets
  // resolvedAt to, so statId + playerId + timestamp identifies the exact row a
  // suggestion produced. (Same join the suggestions listing relies on.)
  let candidates: unknown[] = [];
  try {
    candidates = await queryAll(
      `SELECT sh.id       AS historyId,
              sh.reason   AS historyReason,
              sg.reason   AS suggestionReason,
              sg.testimony AS testimony
       FROM StatHistory sh
       JOIN StatValue sv ON sh.statValueId = sv.id
       JOIN Suggestion sg
         ON sg.statId = sv.statId
        AND sg.playerId = sv.playerId
        AND sg.resolvedAt = sh.createdAt
       WHERE sh.source = 'suggestion'
         AND sg.testimony IS NOT NULL
         AND TRIM(sg.testimony) != ''`
    );
  } catch (e: unknown) {
    // No testimony column at all means nothing was ever split in two.
    if (!/no such column|no column named/i.test(String((e as Error)?.message))) throw e;
    candidates = [];
  }

  let repaired = 0;
  for (const row of candidates as Record<string, unknown>[]) {
    const historyReason = String(row.historyReason ?? '');
    const merged = mergeAccount(String(row.suggestionReason ?? ''), String(row.testimony ?? ''));

    // Only touch rows whose stored reason is a pointer (or empty). A history
    // row that already carries a real explanation is left exactly as it is.
    if (!isPointerText(historyReason)) continue;
    if (!merged || merged === historyReason) continue;

    await query('UPDATE StatHistory SET reason = ? WHERE id = ?', [merged, String(row.historyId)]);
    repaired++;
  }

  await query('INSERT OR REPLACE INTO AppMigration (key, appliedAt, note) VALUES (?, ?, ?)', [
    MARKER,
    new Date().toISOString(),
    `repaired ${repaired} pointer reason(s)`,
  ]);
  doneInProcess = true;
  return { repaired, skipped: false };
}

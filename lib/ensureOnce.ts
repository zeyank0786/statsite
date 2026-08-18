/**
 * Run a table-creation block at most once per process.
 *
 * This app creates its tables lazily — every feature's `ensure*()` fires a
 * handful of `CREATE TABLE IF NOT EXISTS` statements at the top of whatever
 * request touches it. That is a good property (no migration step to forget)
 * with one bad consequence: on hot paths it means a dozen DDL round trips
 * before the request does any real work, several times a minute, forever,
 * to create tables that have existed for months.
 *
 * A serverless instance is reused across requests, so remembering the result
 * for the life of the process removes essentially all of that while keeping
 * the lazy behaviour: a cold instance still checks once, and a genuinely
 * missing table is still created on first contact.
 *
 * Failures are not remembered, so a transient error retries on the next call
 * rather than leaving the feature permanently convinced its tables exist.
 */
const ready = new Map<string, Promise<void>>();

export function ensureOnce(key: string, create: () => Promise<void>): Promise<void> {
  const existing = ready.get(key);
  if (existing) return existing;

  // Stored as the in-flight promise so concurrent callers on the same
  // instance await one pass rather than racing to create the same tables.
  const pending = create().catch((error) => {
    ready.delete(key);
    throw error;
  });
  ready.set(key, pending);
  return pending;
}

/** Test/maintenance escape hatch: forget what has been ensured. */
export function resetEnsured(): void {
  ready.clear();
}

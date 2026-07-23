import { query, queryAll } from './db';
import { v4 as uuid } from 'uuid';

/**
 * Per-player feature lockouts — the admin can bar a player from PARTICIPATING
 * in a feature while leaving them able to view everything. Their stats remain
 * fully suggestable by others (lockouts are about what THEY can do, not what
 * can be done about them).
 *
 * A row's existence = locked. Vote math treats a vote-locked player as
 * non-existent: they leave the eligible-voter pool, so majorities shrink and
 * their previously-cast votes on pending suggestions stop counting while the
 * lock stands (and count again if it's lifted).
 */

export const LOCKABLE_FEATURES = [
  { key: 'suggest', label: 'Suggesting', description: 'Creating suggestions and presets' },
  { key: 'vote', label: 'Voting', description: 'Voting on suggestions (leaves the eligible-voter pool)' },
  { key: 'evidence', label: 'Evidence', description: 'Posting or editing evidence' },
  { key: 'commit', label: 'Commitments', description: 'Making commitments and checking in on them' },
  { key: 'messages', label: 'Messages', description: 'Posting, replying and reacting on the board' },
  { key: 'reviews', label: 'Reviews', description: 'Joining review sessions' },
  { key: 'targets', label: 'Targets', description: 'Setting or changing targets' },
] as const;

export type LockableFeature = (typeof LOCKABLE_FEATURES)[number]['key'];

const FEATURE_KEYS = new Set<string>(LOCKABLE_FEATURES.map((f) => f.key));

/** Additive table — created on first use, no manual migration. */
async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS FeatureLock (
       id          TEXT PRIMARY KEY,
       playerId    TEXT NOT NULL,
       feature     TEXT NOT NULL,
       reason      TEXT,
       createdById TEXT,
       createdAt   TEXT NOT NULL,
       UNIQUE(playerId, feature)
     )`
  );
}

export function isValidFeature(feature: string): feature is LockableFeature {
  return FEATURE_KEYS.has(feature);
}

/** feature → reason (null reason = locked without one) for one player. */
export async function getLocksForPlayer(playerId: string): Promise<Map<string, string | null>> {
  await ensureTable();
  const rows = await queryAll('SELECT feature, reason FROM FeatureLock WHERE playerId = ?', [playerId]);
  return new Map((rows as any[]).map((r) => [String(r.feature), r.reason ? String(r.reason) : null]));
}

/** Player ids locked out of one feature (for vote math etc.). */
export async function getPlayersLockedFrom(feature: LockableFeature): Promise<Set<string>> {
  await ensureTable();
  const rows = await queryAll('SELECT playerId FROM FeatureLock WHERE feature = ?', [feature]);
  return new Set((rows as any[]).map((r) => String(r.playerId)));
}

/**
 * Guard for participation endpoints. Returns the human message to send back
 * with a 403 when locked, or null when the player is free to act.
 */
export async function featureLockMessage(
  playerId: string,
  feature: LockableFeature
): Promise<string | null> {
  const locks = await getLocksForPlayer(playerId);
  if (!locks.has(feature)) return null;
  const reason = locks.get(feature);
  const label = LOCKABLE_FEATURES.find((f) => f.key === feature)?.label || feature;
  return `You are locked out of ${label} by the admin${reason ? ` — ${reason}` : ''}. You can view, but not participate.`;
}

/** Admin: set or clear one lock. */
export async function setFeatureLock(params: {
  playerId: string;
  feature: LockableFeature;
  locked: boolean;
  reason?: string | null;
  createdById?: string | null;
}): Promise<void> {
  await ensureTable();
  const { playerId, feature, locked, reason, createdById } = params;
  await query('DELETE FROM FeatureLock WHERE playerId = ? AND feature = ?', [playerId, feature]);
  if (locked) {
    await query(
      'INSERT INTO FeatureLock (id, playerId, feature, reason, createdById, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), playerId, feature, reason?.trim() || null, createdById || null, new Date().toISOString()]
    );
  }
}

/** Every lock in the system, for the admin UI. */
export async function getAllLocks(): Promise<
  { playerId: string; feature: string; reason: string | null; createdAt: string }[]
> {
  await ensureTable();
  const rows = await queryAll('SELECT playerId, feature, reason, createdAt FROM FeatureLock');
  return (rows as any[]).map((r) => ({
    playerId: String(r.playerId),
    feature: String(r.feature),
    reason: r.reason ? String(r.reason) : null,
    createdAt: String(r.createdAt),
  }));
}

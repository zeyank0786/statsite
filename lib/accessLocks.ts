import { queryAll } from './db';

/**
 * Account-level lockouts, above the per-feature ones in featureLocks.
 *
 * The per-feature locks are a list of named things a player may not do, which
 * has one structural problem: a feature shipped after the list was written is
 * not on it. Every new feature has therefore arrived unlocked for everybody,
 * including accounts the admin had barred from everything else.
 *
 * These two levels fail CLOSED instead. They are enforced by request METHOD in
 * proxy.ts rather than by naming features, so a route added tomorrow is covered
 * the moment it exists:
 *
 *   interact — may read anything, may write nothing. Watching from the
 *              sidelines: the app looks normal, every control is disabled.
 *   full     — may not even read. Every page redirects to /locked.
 *
 * A small allowlist survives `interact`, covering things that affect nobody
 * else: clearing your own unread badges, your own reminders, and your own push
 * subscription (without which you could not be told the lock had lifted).
 */

export const ACCESS_LOCKS = [
  {
    key: 'interact',
    label: 'Locked out of everything',
    description: 'Can view the whole app but cannot post, vote, play or change anything',
  },
  {
    key: 'full',
    label: 'No access at all',
    description: 'Cannot even view — every page shows the lockout screen',
  },
] as const;

export type AccessLock = (typeof ACCESS_LOCKS)[number]['key'];

const ACCESS_KEYS = new Set<string>(ACCESS_LOCKS.map((l) => l.key));

export function isAccessLock(feature: string): feature is AccessLock {
  return ACCESS_KEYS.has(feature);
}

/** Strongest lock in force for a player, or null. `full` implies `interact`. */
export type AccessLevel = { level: AccessLock; reason: string | null } | null;

/**
 * What a locked account can still reach, as path prefixes.
 *
 * Deliberately short, and deliberately explicit rather than pattern-based: an
 * allowlist that grows by accident is the exact failure this file exists to
 * prevent. Everything here is personal bookkeeping that no one else can see.
 */
export const INTERACT_ALLOWED_PREFIXES = [
  '/api/auth', // sign in / out, session refresh
  '/api/push', // their own device subscription
  '/api/reminders', // reminders to themselves
  '/api/notifications', // marking their own bell read
  '/api/messages/unread', // marking the board read
  '/api/evidence/unread', // marking the board read
  '/api/suggestions/recap/seen', // their own "caught up" watermark
  '/api/feature-locks/me', // so the UI can explain the lock
] as const;

/** Human-readable version of the same list, shown to the locked player. */
export const STILL_ALLOWED: { title: string; detail: string }[] = [
  { title: 'View everything', detail: 'Every page, every stat, every post — nothing is hidden from you.' },
  { title: 'Clear your notifications', detail: 'Your bell, unread badges and caught-up markers still work.' },
  { title: 'Your own reminders', detail: 'Set, edit and delete reminders to yourself. Nobody else sees them.' },
  { title: 'Push notifications', detail: 'Stay subscribed — it is how you will hear when the lock lifts.' },
];

export function isAllowedWhileLocked(pathname: string): boolean {
  return INTERACT_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Access level for every locked player, in one query.
 *
 * Cached in-process because this is consulted on essentially every request and
 * locks change perhaps a handful of times ever. One query per instance per TTL
 * for the whole crew, not one per request per player.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; byPlayer: Map<string, AccessLevel> } | null = null;

export async function getAllAccessLocks(): Promise<Map<string, AccessLevel>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.byPlayer;

  const byPlayer = new Map<string, AccessLevel>();
  try {
    const rows = await queryAll(
      `SELECT playerId, feature, reason FROM FeatureLock WHERE feature IN ('interact','full')`
    );
    for (const r of rows as Record<string, unknown>[]) {
      const playerId = String(r.playerId);
      const level = String(r.feature) as AccessLock;
      const reason = r.reason ? String(r.reason) : null;
      // `full` outranks `interact` when both are set.
      const existing = byPlayer.get(playerId);
      if (!existing || level === 'full') byPlayer.set(playerId, { level, reason });
    }
  } catch {
    // Table absent on a fresh database — nobody is locked.
  }

  cache = { at: Date.now(), byPlayer };
  return byPlayer;
}

export async function getAccessLevel(playerId: string): Promise<AccessLevel> {
  return (await getAllAccessLocks()).get(playerId) ?? null;
}

/** Drop the cache so an admin's change takes effect immediately. */
export function invalidateAccessLocks(): void {
  cache = null;
}

/** The message a blocked request gets back. */
export function accessLockMessage(access: NonNullable<AccessLevel>): string {
  const base =
    access.level === 'full'
      ? 'Your account has been locked by the admin.'
      : 'You are locked out of taking part by the admin. You can view everything, but not participate.';
  return access.reason ? `${base} — ${access.reason}` : base;
}

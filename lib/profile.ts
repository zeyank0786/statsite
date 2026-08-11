import { query, queryAll, queryOne } from './db';

/**
 * Per-player profile customisation.
 *
 * Everything here is cosmetic and self-served — none of it touches stats, so
 * it needs no vote. Stored as additive columns on Player rather than a side
 * table, because every read of a player already selects from Player and a join
 * per avatar would be a lot of query for a hex code.
 */

export interface PlayerProfile {
  playerId: string;
  /** Custom accent colour as #rrggbb, or null to keep the auto-assigned one. */
  accentColor: string | null;
  avatarUrl: string | null;
  avatarPublicId: string | null;
  bannerUrl: string | null;
  bannerPublicId: string | null;
  bio: string | null;
  /** Achievement id displayed as a title next to their name. */
  flairAchievementId: string | null;
  flairLabel: string | null;
}

export const MAX_BIO_LENGTH = 160;
export const MAX_FLAIR_LABEL_LENGTH = 40;

const PROFILE_COLUMNS = [
  'accentColor',
  'avatarUrl',
  'avatarPublicId',
  'bannerUrl',
  'bannerPublicId',
  'bio',
  'flairAchievementId',
  'flairLabel',
] as const;

let columnsEnsured = false;

/**
 * Add the profile columns if they aren't there yet. Additive and idempotent —
 * the app self-migrates on first use rather than needing a deploy step, which
 * is how every other table here evolves.
 */
export async function ensureProfileColumns(): Promise<void> {
  if (columnsEnsured) return;
  for (const column of PROFILE_COLUMNS) {
    try {
      await query(`ALTER TABLE Player ADD COLUMN ${column} TEXT`);
    } catch {
      /* already exists */
    }
  }
  columnsEnsured = true;
}

/** #rgb / #rrggbb → normalised #rrggbb, or null if it isn't a colour. */
export function normaliseHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();
  const short = /^#?([0-9a-f]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const long = /^#?([0-9a-f]{6})$/.exec(raw);
  return long ? `#${long[1]}` : null;
}

function mapRow(row: Record<string, unknown>): PlayerProfile {
  const text = (key: string) => {
    const value = row[key];
    return value === null || value === undefined || String(value) === '' ? null : String(value);
  };
  return {
    playerId: String(row.id),
    accentColor: normaliseHex(text('accentColor')),
    avatarUrl: text('avatarUrl'),
    avatarPublicId: text('avatarPublicId'),
    bannerUrl: text('bannerUrl'),
    bannerPublicId: text('bannerPublicId'),
    bio: text('bio'),
    flairAchievementId: text('flairAchievementId'),
    flairLabel: text('flairLabel'),
  };
}

/**
 * Every player's profile, for the app-wide colour/avatar registry.
 *
 * Returns an empty list rather than throwing if the columns don't exist yet,
 * so a page render never depends on the migration having run.
 */
export async function getAllProfiles(): Promise<PlayerProfile[]> {
  try {
    await ensureProfileColumns();
    const rows = await queryAll(
      `SELECT id, ${PROFILE_COLUMNS.join(', ')} FROM Player`
    );
    return (rows as Record<string, unknown>[]).map(mapRow);
  } catch (e) {
    console.error('Failed to load profiles (falling back to defaults):', e);
    return [];
  }
}

export async function getProfile(playerId: string): Promise<PlayerProfile | null> {
  await ensureProfileColumns();
  const row = await queryOne(
    `SELECT id, ${PROFILE_COLUMNS.join(', ')} FROM Player WHERE id = ?`,
    [playerId]
  );
  return row ? mapRow(row as Record<string, unknown>) : null;
}

/**
 * Colours already claimed by OTHER players — a custom pick that collides makes
 * two people indistinguishable on every chart, so the API rejects it.
 */
export async function takenAccentColors(excludePlayerId: string): Promise<Set<string>> {
  await ensureProfileColumns();
  const rows = await queryAll(
    'SELECT id, accentColor FROM Player WHERE accentColor IS NOT NULL AND id != ?',
    [excludePlayerId]
  );
  const taken = new Set<string>();
  for (const row of rows as Record<string, unknown>[]) {
    const hex = normaliseHex(row.accentColor);
    if (hex) taken.add(hex);
  }
  return taken;
}

export interface ProfileUpdate {
  accentColor?: string | null;
  avatarUrl?: string | null;
  avatarPublicId?: string | null;
  bannerUrl?: string | null;
  bannerPublicId?: string | null;
  bio?: string | null;
  flairAchievementId?: string | null;
  flairLabel?: string | null;
}

/** Write only the fields present on `update`; anything omitted is untouched. */
export async function updateProfile(playerId: string, update: ProfileUpdate): Promise<void> {
  await ensureProfileColumns();
  const sets: string[] = [];
  const args: (string | null)[] = [];
  for (const column of PROFILE_COLUMNS) {
    if (!(column in update)) continue;
    const value = update[column as keyof ProfileUpdate];
    sets.push(`${column} = ?`);
    args.push(value === undefined || value === null || value === '' ? null : String(value));
  }
  if (sets.length === 0) return;
  args.push(playerId);
  await query(`UPDATE Player SET ${sets.join(', ')} WHERE id = ?`, args);
}

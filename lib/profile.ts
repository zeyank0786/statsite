import { query, queryAll, queryOne } from './db';
import { BIO_PLACE_KEYS, type BioPlace } from './bioPlaces';

export { BIO_PLACES, type BioPlace } from './bioPlaces';

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
  /** "x,y,w,h" as fractions of the source image; null means centre-crop it. */
  avatarCrop: string | null;
  bannerUrl: string | null;
  bannerPublicId: string | null;
  bannerCrop: string | null;
  bio: string | null;
  /**
   * Places this player has switched their bio OFF. Stored as the exceptions
   * rather than the inclusions so a bio shows up everywhere by default — and so
   * a place added later starts on for everyone instead of silently missing.
   */
  bioHiddenPlaces: string[];
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
  'avatarCrop',
  'bannerUrl',
  'bannerPublicId',
  'bannerCrop',
  'bio',
  'bioHiddenPlaces',
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

/**
 * A crop rectangle as four fractions of the source image, "x,y,w,h".
 * Rejects anything that isn't four numbers in range, so a hand-crafted PATCH
 * can't smuggle arbitrary text into a delivery URL.
 */
export function normaliseCrop(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const parts = input.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts;
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x > 1 || y > 1 || w > 1 || h > 1) return null;
  const round = (n: number) => String(Math.round(n * 10000) / 10000);
  return [x, y, w, h].map(round).join(',');
}

/** CSV of known place keys, or null when the bio shows everywhere. */
export function normaliseBioHiddenPlaces(input: unknown): string | null {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];
  const keys = [
    ...new Set(
      raw
        .map((v) => String(v).trim())
        .filter((v) => BIO_PLACE_KEYS.includes(v))
    ),
  ];
  return keys.length > 0 ? keys.join(',') : null;
}

function mapRow(row: Record<string, unknown>): PlayerProfile {
  const text = (key: string) => {
    const value = row[key];
    return value === null || value === undefined || String(value) === '' ? null : String(value);
  };
  const hidden = text('bioHiddenPlaces');
  return {
    playerId: String(row.id),
    accentColor: normaliseHex(text('accentColor')),
    avatarUrl: text('avatarUrl'),
    avatarPublicId: text('avatarPublicId'),
    avatarCrop: normaliseCrop(text('avatarCrop')),
    bannerUrl: text('bannerUrl'),
    bannerPublicId: text('bannerPublicId'),
    bannerCrop: normaliseCrop(text('bannerCrop')),
    bio: text('bio'),
    bioHiddenPlaces: hidden
      ? hidden.split(',').filter((k) => BIO_PLACE_KEYS.includes(k))
      : [],
    flairAchievementId: text('flairAchievementId'),
    flairLabel: text('flairLabel'),
  };
}

/** Whether a player's bio should render in a given place. */
export function bioVisibleIn(profile: Pick<PlayerProfile, 'bio' | 'bioHiddenPlaces'>, place: BioPlace) {
  return Boolean(profile.bio) && !profile.bioHiddenPlaces.includes(place);
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
  avatarCrop?: string | null;
  bannerUrl?: string | null;
  bannerPublicId?: string | null;
  bannerCrop?: string | null;
  bio?: string | null;
  bioHiddenPlaces?: string | null;
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

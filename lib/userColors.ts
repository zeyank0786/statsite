/**
 * Consistent per-user color identity, shared across the whole app
 * (message board, avatars, comparison charts, leaderboards...).
 *
 * With a known roster (call setKnownRoster once players load), colors are
 * assigned collision-free: each player claims their hash-preferred palette
 * slot in a stable order; collisions probe to the next free slot; rosters
 * larger than the palette get deterministic golden-angle HSL colors.
 * Without a roster (e.g. archived players in old history), falls back to the
 * original hash so colors stay consistent with what people are used to.
 *
 * A player who has picked a custom accent color (setCustomColors) overrides
 * all of that — their pick wins everywhere, and the automatic assignment still
 * runs underneath so anyone who hasn't chosen keeps a stable, distinct color.
 */

interface ColorEntry {
  color: string;
  hex: string;
  rgb: string;
}

const PALETTE: ColorEntry[] = [
  { color: 'var(--accent-cyan)', hex: '#22d3ee', rgb: '34, 211, 238' },
  { color: 'var(--accent-pink)', hex: '#ec4899', rgb: '236, 72, 153' },
  { color: 'var(--accent-purple)', hex: '#a855f7', rgb: '168, 85, 247' },
  { color: 'var(--accent-orange)', hex: '#f97316', rgb: '249, 115, 22' },
  { color: 'var(--accent-green)', hex: '#34d399', rgb: '52, 211, 153' },
  { color: 'var(--accent-blue)', hex: '#3b82f6', rgb: '59, 130, 246' },
  { color: 'var(--accent-red)', hex: '#ef4444', rgb: '239, 68, 68' },
];

function hashIndex(userId: string): number {
  if (!userId) return 0;
  const hash = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
  return hash % PALETTE.length;
}

function hslToEntry(h: number, s: number, l: number): ColorEntry {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lN - c / 2;
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  const hex = `#${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return { color: hex, hex, rgb: `${R}, ${G}, ${B}` };
}

/** Golden-angle spread keeps additional colors far apart and deterministic. */
function goldenAngleEntry(position: number): ColorEntry {
  const hue = (position * 137.508) % 360;
  return hslToEntry(hue, 82, 62);
}

const assigned = new Map<string, ColorEntry>();
/** Explicit player picks; consulted before anything automatic. */
const custom = new Map<string, ColorEntry>();

/** #rrggbb → a palette entry, so custom picks flow through the same helpers. */
function hexToEntry(hex: string): ColorEntry {
  const clean = hex.trim().toLowerCase();
  const r = parseInt(clean.slice(1, 3), 16);
  const g = parseInt(clean.slice(3, 5), 16);
  const b = parseInt(clean.slice(5, 7), 16);
  return { color: clean, hex: clean, rgb: `${r}, ${g}, ${b}` };
}

/**
 * Register players' chosen accent colors. Pass the full map each time — it
 * replaces the previous set, so clearing a pick takes effect immediately.
 * Ignores anything that isn't a #rrggbb value.
 */
export function setCustomColors(colors: Record<string, string | null | undefined>) {
  custom.clear();
  for (const [id, hex] of Object.entries(colors)) {
    if (!id || typeof hex !== 'string') continue;
    if (!/^#[0-9a-f]{6}$/i.test(hex.trim())) continue;
    custom.set(id, hexToEntry(hex));
  }
}

/**
 * Register the current roster (any stable id list — active players at minimum).
 * Safe to call repeatedly; reassigns from scratch each time so results are
 * deterministic for a given set of ids regardless of call order.
 */
export function setKnownRoster(userIds: string[]) {
  assigned.clear();
  const ids = [...new Set(userIds)].sort();
  const taken = new Set<number>();

  for (const id of ids) {
    if (taken.size >= PALETTE.length) break;
    let idx = hashIndex(id);
    let probes = 0;
    while (taken.has(idx) && probes < PALETTE.length) {
      idx = (idx + 1) % PALETTE.length;
      probes++;
    }
    if (!taken.has(idx)) {
      taken.add(idx);
      assigned.set(id, PALETTE[idx]);
    }
  }

  // Roster larger than the palette: deterministic golden-angle colors.
  let overflow = 0;
  for (const id of ids) {
    if (!assigned.has(id)) {
      assigned.set(id, goldenAngleEntry(overflow + 3)); // offset avoids palette-like hues
      overflow++;
    }
  }
}

function entryFor(userId: string): ColorEntry {
  return custom.get(userId) || assigned.get(userId) || PALETTE[hashIndex(userId)];
}

/**
 * The rest of a player's cosmetic identity, registered the same way colours
 * are so any component can render a picture or title without prop-drilling a
 * profile through the tree.
 */
const avatars = new Map<string, string>();
const flairs = new Map<string, string>();

export function setPlayerProfiles(
  profiles: { playerId: string; avatarUrl?: string | null; flairLabel?: string | null }[]
) {
  avatars.clear();
  flairs.clear();
  for (const p of profiles) {
    if (!p.playerId) continue;
    if (p.avatarUrl) avatars.set(p.playerId, p.avatarUrl);
    if (p.flairLabel) flairs.set(p.playerId, p.flairLabel);
  }
}

/** Uploaded profile picture, or null when they're still on initials. */
export function getUserAvatarUrl(userId: string): string | null {
  return avatars.get(userId) || null;
}

/** The earned title a player chose to wear, or null. */
export function getUserFlair(userId: string): string | null {
  return flairs.get(userId) || null;
}

/** The palette people choose from in settings — the app's own accent family. */
export const PICKABLE_COLORS: string[] = [
  '#22d3ee',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#34d399',
  '#14b8a6',
  '#0ea5e9',
];

export function getUserColor(userId: string): string {
  return entryFor(userId).color;
}

export function getUserColorHex(userId: string): string {
  return entryFor(userId).hex;
}

export function getUserColorRgb(userId: string): string {
  return entryFor(userId).rgb;
}

/** rgba() background for a user's color at the given opacity. */
export function getUserColorBg(userId: string, opacity: number): string {
  return `rgba(${entryFor(userId).rgb}, ${opacity})`;
}

export function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

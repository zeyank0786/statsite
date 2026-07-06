/**
 * Consistent per-user color identity, shared across the whole app
 * (message board, avatars, comparison charts, leaderboards...).
 * Same hash as the original message board so colors don't shift.
 */

const PALETTE = [
  { color: 'var(--accent-cyan)', hex: '#22d3ee', rgb: '34, 211, 238' },
  { color: 'var(--accent-pink)', hex: '#ec4899', rgb: '236, 72, 153' },
  { color: 'var(--accent-purple)', hex: '#a855f7', rgb: '168, 85, 247' },
  { color: 'var(--accent-orange)', hex: '#f97316', rgb: '249, 115, 22' },
  { color: 'var(--accent-green)', hex: '#34d399', rgb: '52, 211, 153' },
  { color: 'var(--accent-blue)', hex: '#3b82f6', rgb: '59, 130, 246' },
  { color: 'var(--accent-red)', hex: '#ef4444', rgb: '239, 68, 68' },
];

function paletteIndex(userId: string): number {
  if (!userId) return 0;
  const hash = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
  return hash % PALETTE.length;
}

export function getUserColor(userId: string): string {
  return PALETTE[paletteIndex(userId)].color;
}

export function getUserColorHex(userId: string): string {
  return PALETTE[paletteIndex(userId)].hex;
}

export function getUserColorRgb(userId: string): string {
  return PALETTE[paletteIndex(userId)].rgb;
}

/** rgba() background for a user's color at the given opacity. */
export function getUserColorBg(userId: string, opacity: number): string {
  return `rgba(${PALETTE[paletteIndex(userId)].rgb}, ${opacity})`;
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

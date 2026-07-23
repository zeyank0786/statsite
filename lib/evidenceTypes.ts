export interface EvidencePost {
  id: string;
  playerId: string;
  playerName: string;
  playerActive: boolean;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  caption: string | null;
  captionHidden: boolean;
  categories: { categoryId: string; code: string; label: string }[];
  suggestionCount: number;
  isOwn: boolean;
  createdAt: string;
}

export interface CategoryOption {
  id: string;
  code: string;
  label: string;
}

export interface EvidencePlayer {
  id: string;
  username: string;
}

/** Bucket a post into a human date group for feed headers. */
export function dateGroup(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = then.getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - 86400000) return 'Yesterday';
  if (t >= startOfToday - 7 * 86400000) return 'Earlier this week';
  if (t >= startOfToday - 30 * 86400000) return 'This month';
  return then.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function relativeTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

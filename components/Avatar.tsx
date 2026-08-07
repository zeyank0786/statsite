'use client';

import { ViewTransition } from 'react';
import { getUserColorHex, getUserColorBg, getInitials } from '@/lib/userColors';

interface AvatarProps {
  id: string;
  name: string;
  size?: number;
  ring?: boolean;
  className?: string;
  /**
   * Opt into the shared-element morph between pages. Pass the same key on the
   * list avatar and the profile hero avatar and the browser animates one
   * element moving, instead of two swapping.
   *
   * Names must be unique per rendered page — only tag the *primary* occurrence
   * of a player on a screen (e.g. the leaderboard podium, not the "fastest
   * riser" callout that repeats the same person).
   */
  morphKey?: string;
}

export default function Avatar({
  id,
  name,
  size = 40,
  ring = false,
  className = '',
  morphKey,
}: AvatarProps) {
  const hex = getUserColorHex(id);
  const el = (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${hex}, ${hex}99)`,
        boxShadow: ring
          ? `0 0 0 2px var(--background), 0 0 0 4px ${hex}66`
          : `0 2px 10px ${getUserColorBg(id, 0.35)}`,
      }}
      title={name}
    >
      {getInitials(name)}
    </span>
  );

  if (!morphKey) return el;

  return (
    <ViewTransition name={morphKey} share="morph">
      {el}
    </ViewTransition>
  );
}

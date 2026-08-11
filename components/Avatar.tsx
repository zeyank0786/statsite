'use client';

import { ViewTransition } from 'react';
import { getUserColorHex, getUserColorBg, getInitials, getUserAvatarUrl } from '@/lib/userColors';
import { cldThumb } from '@/lib/cloudinary';

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
  /**
   * Override the registered picture. Pass null to force initials — used by the
   * settings preview, which has to show a pending upload before it's saved.
   */
  imageUrl?: string | null;
}

export default function Avatar({
  id,
  name,
  size = 40,
  ring = false,
  className = '',
  morphKey,
  imageUrl,
}: AvatarProps) {
  const hex = getUserColorHex(id);
  // `undefined` means "use whatever is registered"; an explicit null means
  // "show initials", which is how the settings preview clears a picture.
  const picture = imageUrl === undefined ? getUserAvatarUrl(id) : imageUrl;

  const el = (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        // The gradient stays behind an uploaded picture: it shows through
        // transparent PNGs and covers the gap while the image loads.
        background: `linear-gradient(135deg, ${hex}, ${hex}99)`,
        boxShadow: ring
          ? `0 0 0 2px var(--background), 0 0 0 4px ${hex}66`
          : `0 2px 10px ${getUserColorBg(id, 0.35)}`,
      }}
      title={name}
    >
      {picture ? (
        // Square-cropped by Cloudinary at twice the rendered size, so it stays
        // sharp on retina without shipping a full-resolution photo.
        <img
          src={cldThumb(picture, Math.round(size * 2))}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );

  if (!morphKey) return el;

  return (
    <ViewTransition name={morphKey} share="morph">
      {el}
    </ViewTransition>
  );
}

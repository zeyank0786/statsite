'use client';

import { ViewTransition } from 'react';
import {
  getUserColorHex,
  getUserColorBg,
  getInitials,
  getUserAvatarUrl,
  getUserAvatarCrop,
} from '@/lib/userColors';
import { useProfileRegistry } from '@/lib/useProfileRegistry';
import { cldThumb } from '@/lib/cloudinary';
import ProfileHoverCard from './ProfileHoverCard';

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
  /**
   * Override the registered crop, as "x,y,w,h". Only meaningful alongside
   * `imageUrl` — again, for previewing a crop that isn't saved yet.
   */
  imageCrop?: string | null;
  /**
   * Show the profile popover on hover/tap. On by default, since an avatar is
   * the natural handle for "who is this?" — turn it off inside pickers and
   * previews, where the avatar is a control rather than a person.
   */
  profileCard?: boolean;
}

export default function Avatar({
  id,
  name,
  size = 40,
  ring = false,
  className = '',
  morphKey,
  imageUrl,
  imageCrop,
  profileCard = true,
}: AvatarProps) {
  // Pictures, crops and colours all arrive from AppShell after first paint.
  useProfileRegistry();

  const hex = getUserColorHex(id);
  // `undefined` means "use whatever is registered"; an explicit null means
  // "show initials", which is how the settings preview clears a picture.
  const overriding = imageUrl !== undefined;
  const picture = overriding ? imageUrl : getUserAvatarUrl(id);
  const crop = overriding ? imageCrop ?? null : getUserAvatarCrop(id);

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
        // Cropped to the player's chosen framing, then squared off by
        // Cloudinary at twice the rendered size, so it stays sharp on retina
        // without shipping a full-resolution photo.
        <img
          src={cldThumb(picture, Math.round(size * 2), crop)}
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

  const morphed = morphKey ? (
    <ViewTransition name={morphKey} share="morph">
      {el}
    </ViewTransition>
  ) : (
    el
  );

  // A preview of an unsaved picture isn't a person you can look up, so it never
  // gets a card.
  if (!profileCard || overriding || !id) return morphed;

  return (
    <ProfileHoverCard playerId={id} name={name}>
      {morphed}
    </ProfileHoverCard>
  );
}

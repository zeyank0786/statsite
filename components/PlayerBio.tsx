'use client';

import { getUserBio } from '@/lib/userColors';
import { useProfileRegistry } from '@/lib/useProfileRegistry';
import type { BioPlace } from '@/lib/bioPlaces';

/**
 * A player's bio, rendered wherever they've allowed it.
 *
 * Every site that shows a bio goes through here, so the per-place toggle is
 * enforced in exactly one file — and adding a new place is a matter of adding
 * the key to `BIO_PLACES` and dropping this component in.
 *
 * Renders nothing when they have no bio or have switched this place off, which
 * is why the callers don't guard it themselves.
 */
export default function PlayerBio({
  playerId,
  place,
  className = 'text-[11px]',
  clamp = true,
}: {
  playerId: string;
  place: BioPlace;
  className?: string;
  /** One truncated line, with the full text on hover. Off for roomy layouts. */
  clamp?: boolean;
}) {
  useProfileRegistry();
  const bio = getUserBio(playerId, place);
  if (!bio) return null;

  return (
    <span
      className={`block ${clamp ? 'truncate' : 'break-words'} ${className}`}
      style={{ color: 'var(--text-secondary)' }}
      title={clamp ? bio : undefined}
    >
      {bio}
    </span>
  );
}

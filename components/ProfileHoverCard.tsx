'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  getUserBanner,
  getUserBio,
  getUserColorHex,
  getUserFlair,
} from '@/lib/userColors';
import { useProfileRegistry } from '@/lib/useProfileRegistry';
import { cldBanner } from '@/lib/cloudinary';
import Avatar from './Avatar';

/**
 * The popover that appears when you hover (or tap) someone's avatar.
 *
 * It's the one place a player's whole cosmetic identity shows up together —
 * banner, picture, title and bio — without leaving the page you're on. The bio
 * line obeys that player's own `hovercard` toggle; everything else always
 * shows, because the card is really just a shortcut to their profile.
 *
 * Rendered through a portal: avatars live inside cards and table cells with
 * `overflow: hidden`, which would clip an absolutely-positioned child.
 */

const CARD_WIDTH = 264;
const OPEN_DELAY = 260;
const CLOSE_DELAY = 140;

export default function ProfileHoverCard({
  playerId,
  name,
  children,
}: {
  playerId: string;
  name: string;
  children: React.ReactNode;
}) {
  useProfileRegistry();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A tap opens the card instead of following the link underneath it. */
  const swallowClick = useRef(false);
  const swallowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (swallowTimer.current) clearTimeout(swallowTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const place = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.bottom + 200 > window.innerHeight && rect.top > 220;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - CARD_WIDTH / 2),
      Math.max(8, window.innerWidth - CARD_WIDTH - 8)
    );
    setPosition({ top: above ? rect.top - 8 : rect.bottom + 8, left, above });
  }, []);

  const open = useCallback(
    (delay: number) => {
      clearTimers();
      openTimer.current = setTimeout(place, delay);
    },
    [place]
  );

  const close = (delay = CLOSE_DELAY) => {
    clearTimers();
    closeTimer.current = setTimeout(() => setPosition(null), delay);
  };

  useEffect(() => clearTimers, []);

  // Scrolling or resizing moves the anchor out from under a fixed-position
  // card, so dismiss rather than chase it. A tap anywhere else closes it too —
  // touch has no pointerleave to rely on.
  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    const onOutside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (cardRef.current?.contains(target) || anchorRef.current?.contains(target))) return;
      dismiss();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [position]);

  if (!playerId) return <>{children}</>;

  const hex = getUserColorHex(playerId);
  const bio = getUserBio(playerId, 'hovercard');
  const flair = getUserFlair(playerId);
  const banner = getUserBanner(playerId);

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex shrink-0"
        onPointerEnter={(e) => {
          if (e.pointerType === 'touch') return;
          open(OPEN_DELAY);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch') return;
          close();
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          // On touch there's no hover to trigger on, and the avatar is usually
          // inside a link — so the first tap opens the card and the card's own
          // button is what navigates.
          if (!position) {
            open(0); // clears pending timers, so arm the swallow flag after it
            swallowClick.current = true;
            // If the tap turns into a scroll no click ever arrives — drop the
            // flag so it can't eat an unrelated click later on.
            swallowTimer.current = setTimeout(() => {
              swallowClick.current = false;
            }, 700);
          }
        }}
        onClickCapture={(e) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </span>

      {position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={cardRef}
            className="fixed z-[70] animate-rise"
            style={{
              top: position.top,
              left: position.left,
              width: CARD_WIDTH,
              transform: position.above ? 'translateY(-100%)' : undefined,
            }}
            onPointerEnter={clearTimers}
            onPointerLeave={() => close()}
          >
            <div className="overlay-panel card-shadow-lg overflow-hidden rounded-2xl">
              <div
                className="h-14 w-full"
                style={{
                  background: banner
                    ? `url(${cldBanner(banner.url, 600, banner.crop)}) center/cover`
                    : `linear-gradient(120deg, ${hex}55, transparent 75%)`,
                }}
              />
              <div className="px-3.5 pb-3.5 -mt-7">
                <div style={{ boxShadow: '0 0 0 3px var(--background)', borderRadius: 999, width: 'fit-content' }}>
                  <Avatar id={playerId} name={name} size={48} profileCard={false} />
                </div>
                <p className="font-display font-bold text-white mt-2 leading-tight truncate">{name}</p>
                {flair && (
                  <span
                    className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: `${hex}22`, color: hex }}
                  >
                    {flair}
                  </span>
                )}
                {bio && (
                  <p className="text-xs mt-1.5 break-words" style={{ color: 'var(--text-secondary)' }}>
                    {bio}
                  </p>
                )}
                <Link
                  href={`/players/${playerId}`}
                  className="btn-ghost text-xs w-full justify-center mt-3"
                  onClick={() => setPosition(null)}
                >
                  View profile
                </Link>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

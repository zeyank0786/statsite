'use client';

import { useSyncExternalStore } from 'react';
import { getProfilesVersion, subscribeToProfiles } from './userColors';

/**
 * Re-render when the app-wide profile registry changes.
 *
 * AppShell loads every player's colour, picture, banner and bio in an effect —
 * which lands *after* the page that wants to draw them has already painted.
 * Anything reading the registry (avatars, bios, hover cards) calls this so the
 * late arrival repaints it, instead of relying on some unrelated state change
 * happening to come along afterwards.
 *
 * The server snapshot is pinned at 0: the registry is client-only, so hydration
 * always starts from "nothing registered yet" and fills in on the first commit.
 */
export function useProfileRegistry(): number {
  return useSyncExternalStore(subscribeToProfiles, getProfilesVersion, () => 0);
}

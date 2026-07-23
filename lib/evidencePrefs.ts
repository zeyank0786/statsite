'use client';

import { useEffect, useState } from 'react';

/**
 * Evidence board view preferences, persisted per device.
 *
 * Read from localStorage in an effect rather than during render — reading it
 * during render would desync the server-rendered HTML from the first client
 * paint and trip a hydration error.
 */

export type EvidenceView = 'feed' | 'grid' | 'columns';
export type EvidenceSort = 'newest' | 'oldest' | 'cited';
export type MediaFilter = 'all' | 'photo' | 'video' | 'text';

export interface EvidencePrefs {
  view: EvidenceView;
  sort: EvidenceSort;
  compact: boolean;
  playerIds: string[]; // empty = everyone
  categoryIds: string[]; // empty = all categories
  media: MediaFilter;
  citedOnly: boolean;
  search: string;
}

export const DEFAULT_PREFS: EvidencePrefs = {
  view: 'feed',
  sort: 'newest',
  compact: false,
  playerIds: [],
  categoryIds: [],
  media: 'all',
  citedOnly: false,
  search: '',
};

const KEY = '4ward:evidence-prefs';

export function useEvidencePrefs() {
  const [prefs, setPrefs] = useState<EvidencePrefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // Search is deliberately not restored — a stale filter that hides
        // everything is confusing when you come back to the page.
        setPrefs({ ...DEFAULT_PREFS, ...saved, search: '' });
      }
    } catch {
      /* corrupt or unavailable storage — defaults are fine */
    }
    setHydrated(true);
  }, []);

  const update = (patch: Partial<EvidencePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        const { search, ...persisted } = next;
        localStorage.setItem(KEY, JSON.stringify(persisted));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return { prefs, update, hydrated };
}

/** How many filters are narrowing the board right now (for the badge). */
export function activeFilterCount(p: EvidencePrefs): number {
  return (
    (p.playerIds.length > 0 ? 1 : 0) +
    (p.categoryIds.length > 0 ? 1 : 0) +
    (p.media !== 'all' ? 1 : 0) +
    (p.citedOnly ? 1 : 0) +
    (p.search.trim() ? 1 : 0)
  );
}

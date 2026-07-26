'use client';

import { useEffect, useState } from 'react';
import { MentionablePlayer } from './mentions';

/**
 * The active roster (id + username), for @mention autocomplete and rendering.
 * Fetched once per mount; cheap and unauthenticated-safe via /api/players.
 */
export function usePlayers(enabled = true): MentionablePlayer[] {
  const [players, setPlayers] = useState<MentionablePlayer[]>([]);

  useEffect(() => {
    if (!enabled) return;
    fetch('/api/players')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data.players || [];
        setPlayers(list.map((p: any) => ({ id: String(p.id), username: String(p.username) })));
      })
      .catch(() => {});
  }, [enabled]);

  return players;
}

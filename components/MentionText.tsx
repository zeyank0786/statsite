'use client';

import Link from 'next/link';
import { splitByMentions, MentionablePlayer } from '@/lib/mentions';

/**
 * Renders text with @mentions highlighted as chips that link to the mentioned
 * player's profile. Everything else renders verbatim (whitespace preserved).
 * Pass the current roster so it knows which "@…" runs are real people.
 */
export default function MentionText({
  content,
  players,
  className = '',
}: {
  content: string;
  players: MentionablePlayer[];
  className?: string;
}) {
  const segments = splitByMentions(content, players);

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {segments.map((seg, i) =>
        seg.type === 'mention' ? (
          <Link
            key={i}
            href={`/players/${seg.playerId}`}
            className="font-semibold rounded px-1 -mx-0.5 transition hover:brightness-125"
            style={{ color: 'var(--accent-cyan)', background: 'rgba(34,211,238,0.12)' }}
          >
            @{seg.username}
          </Link>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}

'use client';

import { useState } from 'react';
import { CameraIcon, CheckIcon } from './icons';

/**
 * Downloads a rendered share card PNG.
 *
 * The card routes require a session, so the file is fetched with cookies and
 * saved locally rather than linked — a bare URL would 401 for anyone the crew
 * shared it with, and making it public would expose the crew's stats and board
 * to link-holders.
 */

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';
}

export function ShareCard({
  endpoint,
  filename,
  label = 'Share card',
  title = 'Download a shareable PNG',
  className = 'btn-ghost text-sm',
  iconSize = 15,
}: {
  /** Card route to fetch, e.g. `/api/og/card/abc`. */
  endpoint: string;
  /** Saved file name, without the .png extension. */
  filename: string;
  label?: string;
  title?: string;
  className?: string;
  iconSize?: number;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const download = async () => {
    setState('working');
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`card request failed: ${res.status}`);
      const blob = await res.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      setState('done');
      setTimeout(() => setState('idle'), 2500);
    } catch (error) {
      console.error('Failed to download share card:', error);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  return (
    <button onClick={download} disabled={state === 'working'} className={className} title={title}>
      {state === 'done' ? <CheckIcon size={iconSize} /> : <CameraIcon size={iconSize} />}
      {state === 'working'
        ? 'Rendering…'
        : state === 'done'
        ? 'Saved'
        : state === 'error'
        ? 'Failed — retry'
        : label}
    </button>
  );
}

/** A player's stat card. */
export default function ShareCardButton({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName: string;
}) {
  return (
    <ShareCard
      endpoint={`/api/og/card/${playerId}`}
      filename={`4ward-${slugify(playerName)}`}
      title="Download a shareable PNG of these stats"
    />
  );
}

/** A board message as a quote card — how milestones get shared outside the app. */
export function ShareMessageButton({
  messageId,
  authorName,
}: {
  messageId: string;
  authorName: string;
}) {
  return (
    <ShareCard
      endpoint={`/api/og/message/${messageId}`}
      filename={`4ward-message-${slugify(authorName)}`}
      label="Share"
      title="Download this message as a shareable image"
      className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition"
      iconSize={13}
    />
  );
}

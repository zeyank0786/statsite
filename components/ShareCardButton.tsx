'use client';

import { useState } from 'react';
import { CameraIcon, CheckIcon } from './icons';

/**
 * Downloads the player's stat card PNG.
 *
 * The card route requires a session, so the file is fetched with cookies and
 * saved locally rather than linked — a bare URL would 401 for anyone the crew
 * shared it with, and making it public would expose stats to link-holders.
 */
export default function ShareCardButton({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName: string;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const download = async () => {
    setState('working');
    try {
      const res = await fetch(`/api/og/card/${playerId}`);
      if (!res.ok) throw new Error(`card request failed: ${res.status}`);
      const blob = await res.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `4ward-${playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      setState('done');
      setTimeout(() => setState('idle'), 2500);
    } catch (error) {
      console.error('Failed to download stat card:', error);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  return (
    <button
      onClick={download}
      disabled={state === 'working'}
      className="btn-ghost text-sm"
      title="Download a shareable PNG of these stats"
    >
      {state === 'done' ? <CheckIcon size={15} /> : <CameraIcon size={15} />}
      {state === 'working'
        ? 'Rendering…'
        : state === 'done'
        ? 'Saved'
        : state === 'error'
        ? 'Failed — retry'
        : 'Share card'}
    </button>
  );
}

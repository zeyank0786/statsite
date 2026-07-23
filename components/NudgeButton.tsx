'use client';

import { useEffect, useRef, useState } from 'react';
import { HandIcon, XIcon } from './icons';

interface NudgeKind {
  key: string;
  label: string;
}

/**
 * Poke another player. Opens a small menu of preset nudges; the server
 * enforces the real cooldown, this just reflects it so the button doesn't
 * look broken.
 */
export default function NudgeButton({
  targetPlayerId,
  targetName,
}: {
  targetPlayerId: string;
  targetName: string;
}) {
  const [kinds, setKinds] = useState<NudgeKind[]>([]);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/nudge?targetPlayerId=${targetPlayerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setKinds(d.kinds || []);
        setCooldownMs(d.cooldownMs || 0);
      })
      .catch(() => {});
  }, [targetPlayerId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const send = async (kind: string) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await fetch('/api/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlayerId, kind }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setNote(`Nudged ${targetName}`);
        setCooldownMs((d.cooldownHours || 12) * 3600_000);
        setOpen(false);
        setTimeout(() => setNote(''), 4000);
      } else {
        setError(d.error || 'Could not send that nudge');
        setOpen(false);
        setTimeout(() => setError(''), 5000);
      }
    } catch {
      setError('Could not send that nudge');
    } finally {
      setBusy(false);
    }
  };

  const onCooldown = cooldownMs > 0;

  return (
    <div className="relative inline-flex" ref={wrapRef}>
      <button
        onClick={() => !onCooldown && setOpen(!open)}
        disabled={busy || onCooldown}
        className="btn-ghost text-sm py-2 disabled:opacity-40 disabled:cursor-not-allowed"
        title={
          onCooldown
            ? `Already nudged ${targetName} recently`
            : `Give ${targetName} a nudge`
        }
      >
        <HandIcon size={15} />
        {onCooldown ? 'Nudged' : 'Nudge'}
      </button>

      {open && kinds.length > 0 && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded-2xl border z-50 overflow-hidden card-shadow-lg"
          style={{ backgroundColor: 'rgba(14,14,20,0.98)', borderColor: 'var(--surface-border-strong)' }}
        >
          <div
            className="px-3.5 py-2.5 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--surface-border)' }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Nudge {targetName}
            </p>
            <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white transition">
              <XIcon size={13} />
            </button>
          </div>
          {kinds.map((k) => (
            <button
              key={k.key}
              onClick={() => send(k.key)}
              disabled={busy}
              className="w-full text-left px-3.5 py-2.5 text-sm text-neutral-200 hover:bg-white/[0.06] transition disabled:opacity-50"
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {(note || error) && (
        <span
          className="absolute right-0 top-full mt-2 whitespace-nowrap text-xs font-semibold px-2.5 py-1.5 rounded-lg z-50"
          style={{
            background: error ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)',
            color: error ? 'var(--accent-red)' : 'var(--accent-green)',
          }}
        >
          {error || note}
        </span>
      )}
    </div>
  );
}

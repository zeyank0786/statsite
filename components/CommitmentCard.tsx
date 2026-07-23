'use client';

import { useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import { getCategoryMeta } from '@/lib/categories';
import { CheckIcon, XIcon, ClockIcon, HandIcon } from './icons';

export interface CommitmentStat {
  statId: string;
  delta: number;
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
}

export interface Commitment {
  id: string;
  playerId: string;
  playerName: string;
  title: string;
  detail: string | null;
  cadence: string;
  deadline: string;
  status: string;
  withdrawReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  stats: CommitmentStat[];
  checkInCount: number;
  lastCheckInAt: string | null;
  isSubject: boolean;
  tally: {
    kind: 'verdict' | 'withdrawal';
    eligibleCount: number;
    votesNeeded: number;
    yes: number;
    no: number;
    waitingOn: string[];
    yourVote: string | null;
    canVote: boolean;
  } | null;
}

export const STATUS_META: Record<string, { label: string; hex: string }> = {
  active: { label: 'Active', hex: '#22d3ee' },
  awaiting_verdict: { label: 'Awaiting verdict', hex: '#a855f7' },
  withdraw_pending: { label: 'Withdrawal requested', hex: '#fbbf24' },
  kept: { label: 'Kept', hex: '#34d399' },
  missed: { label: 'Missed', hex: '#ef4444' },
  withdrawn: { label: 'Withdrawn', hex: '#9ca3af' },
};

export function timeLeft(deadline: string): string {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'deadline passed';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days !== 1 ? 's' : ''} left`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.floor(ms / 60000))}m left`;
}

export default function CommitmentCard({
  commitment: c,
  onChanged,
}: {
  commitment: Commitment;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[c.status] || STATUS_META.active;
  const overdue = c.status === 'active' && new Date(c.deadline).getTime() < Date.now();

  const vote = async (choice: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/commitments/${c.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to vote');
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="glass card-shadow p-5" style={{ borderLeft: `3px solid ${meta.hex}` }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar id={c.playerId} name={c.playerName} size={36} />
          <div className="min-w-0">
            <Link href={`/commitments/${c.id}`} className="font-display font-bold text-white hover:underline block truncate">
              {c.title}
            </Link>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {c.playerName}
              {c.isSubject && ' (you)'} ·{' '}
              {c.status === 'active' ? (
                <span style={{ color: overdue ? 'var(--accent-yellow)' : undefined }}>{timeLeft(c.deadline)}</span>
              ) : (
                new Date(c.resolvedAt || c.deadline).toLocaleDateString()
              )}
              {c.cadence === 'weekly' && ' · weekly check-ins'}
            </p>
          </div>
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide shrink-0"
          style={{ background: `${meta.hex}22`, color: meta.hex }}
        >
          {meta.label}
        </span>
      </div>

      {c.detail && (
        <p className="text-sm mb-3 whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>
          {c.detail}
        </p>
      )}

      {c.stats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {c.stats.map((s) => {
            const cm = getCategoryMeta(s.categoryCode, s.categoryLabel);
            const dc = s.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
            return (
              <span
                key={s.statId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
                style={{ borderColor: `${cm.hex}44`, background: `${cm.hex}0f`, color: 'white' }}
              >
                <span style={{ color: dc }}>
                  {s.delta > 0 ? '+' : ''}
                  {s.delta}
                </span>
                {s.label}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] mb-3" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1">
          <ClockIcon size={12} />
          {c.checkInCount} check-in{c.checkInCount !== 1 ? 's' : ''}
        </span>
        <Link href={`/commitments/${c.id}`} className="hover:underline" style={{ color: 'var(--accent-cyan)' }}>
          Open →
        </Link>
      </div>

      {/* Withdrawal request context */}
      {c.status === 'withdraw_pending' && c.withdrawReason && (
        <div
          className="rounded-xl px-3.5 py-2.5 mb-3 text-sm border"
          style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-yellow)' }}>
            Withdrawal reason — needs everyone to agree
          </p>
          <p className="text-neutral-200 whitespace-pre-wrap break-words">{c.withdrawReason}</p>
        </div>
      )}

      {/* Voting */}
      {c.tally && (
        <div className="border-t pt-3.5" style={{ borderColor: 'var(--surface-border)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {c.tally.kind === 'withdrawal' ? (
                  <>
                    <span style={{ color: 'var(--accent-yellow)' }}>{c.tally.yes}</span> of {c.tally.eligibleCount} agreed
                    — needs everyone
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--accent-green)' }}>{c.tally.yes} kept</span> ·{' '}
                    <span style={{ color: 'var(--accent-red)' }}>{c.tally.no} missed</span> — needs{' '}
                    {c.tally.votesNeeded} of {c.tally.eligibleCount}
                  </>
                )}
              </p>
              {c.tally.waitingOn.length > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  ⏳ Waiting on: <span className="text-neutral-300 font-medium">{c.tally.waitingOn.join(', ')}</span>
                </p>
              )}
            </div>

            {c.tally.canVote ? (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => vote(c.tally!.kind === 'withdrawal' ? 'yes' : 'kept')}
                  disabled={busy}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 ${
                    c.tally.yourVote === 'kept' || c.tally.yourVote === 'yes'
                      ? 'text-white border-emerald-400 bg-emerald-500/30'
                      : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'
                  }`}
                >
                  <CheckIcon size={14} /> {c.tally.kind === 'withdrawal' ? 'Allow' : 'They did it'}
                </button>
                <button
                  onClick={() => vote(c.tally!.kind === 'withdrawal' ? 'no' : 'missed')}
                  disabled={busy}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 ${
                    c.tally.yourVote === 'missed' || c.tally.yourVote === 'no'
                      ? 'text-white border-red-400 bg-red-500/30'
                      : 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20'
                  }`}
                >
                  <XIcon size={14} /> {c.tally.kind === 'withdrawal' ? 'Object' : 'They didn’t'}
                </button>
              </div>
            ) : c.isSubject ? (
              <p className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                Your commitment — the crew decides
              </p>
            ) : null}
          </div>
        </div>
      )}
    </article>
  );
}

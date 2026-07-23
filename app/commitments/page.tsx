'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import LockoutBanner, { useMyLockouts } from '@/components/LockoutBanner';
import CommitmentCard, { Commitment } from '@/components/CommitmentCard';
import { PlusIcon } from '@/components/icons';

interface Record_ {
  kept: number;
  missed: number;
  withdrawn: number;
  rate: number | null;
}

export default function CommitmentsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const myLockouts = useMyLockouts(status === 'authenticated');
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [records, setRecords] = useState<Record<string, Record_>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'open' | 'mine' | 'done'>('open');

  const currentPlayerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      load();
      const interval = setInterval(load, 20000);
      return () => clearInterval(interval);
    }
  }, [status, router]);

  const load = async () => {
    try {
      const res = await fetch('/api/commitments');
      if (res.ok) {
        const data = await res.json();
        setCommitments(data.commitments || []);
        setRecords(data.records || {});
      }
    } catch (e) {
      console.error('Failed to load commitments:', e);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell width="narrow">
        <PageHeader title="Commitments" eyebrow="Promises" eyebrowColor="var(--accent-green)" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  const open = commitments.filter((c) => ['active', 'awaiting_verdict', 'withdraw_pending'].includes(c.status));
  const mine = commitments.filter((c) => c.playerId === currentPlayerId);
  const done = commitments.filter((c) => ['kept', 'missed', 'withdrawn'].includes(c.status));
  const shown = tab === 'open' ? open : tab === 'mine' ? mine : done;

  const myRecord = records[currentPlayerId];
  const needsMyVote = open.filter((c) => c.tally?.canVote && !c.tally?.yourVote).length;

  return (
    <AppShell width="narrow">
      <PageHeader
        title="Commitments"
        subtitle="Promise something with a deadline. The crew decides whether you delivered."
        eyebrow="Promises"
        eyebrowColor="var(--accent-green)"
        actions={
          'commit' in myLockouts ? undefined : (
            <Link href="/commitments/new" className="btn-gradient text-sm">
              <PlusIcon size={16} />
              New commitment
            </Link>
          )
        }
      />

      <LockoutBanner locks={myLockouts} feature="commit" />

      {/* Your record */}
      {myRecord && (myRecord.kept > 0 || myRecord.missed > 0 || myRecord.withdrawn > 0) && (
        <div className="glass card-shadow p-4 mb-5 flex items-center gap-4 flex-wrap animate-rise">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Your record
            </p>
            <p className="font-display text-2xl font-bold" style={{ color: 'var(--accent-green)' }}>
              {myRecord.rate === null ? '—' : `${Math.round(myRecord.rate * 100)}%`}
              <span className="text-sm font-medium opacity-60"> kept</span>
            </p>
          </div>
          <div className="flex gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>
              <span className="font-bold" style={{ color: 'var(--accent-green)' }}>
                {myRecord.kept}
              </span>{' '}
              kept
            </span>
            <span>
              <span className="font-bold" style={{ color: 'var(--accent-red)' }}>
                {myRecord.missed}
              </span>{' '}
              missed
            </span>
            {myRecord.withdrawn > 0 && <span>{myRecord.withdrawn} withdrawn</span>}
          </div>
        </div>
      )}

      {needsMyVote > 0 && (
        <div
          className="glass p-3.5 mb-5 text-sm animate-rise"
          style={{ borderColor: 'rgba(168,85,247,0.4)', color: 'var(--text-secondary)' }}
        >
          <span className="font-semibold" style={{ color: 'var(--accent-purple)' }}>
            {needsMyVote} commitment{needsMyVote !== 1 ? 's' : ''} need your judgement.
          </span>{' '}
          Did they do what they said?
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-xl border w-fit mb-6" style={{ borderColor: 'var(--surface-border)' }}>
        {(
          [
            { key: 'open', label: `Live (${open.length})` },
            { key: 'mine', label: `Mine (${mine.length})` },
            { key: 'done', label: `History (${done.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key ? 'text-white' : 'text-neutral-400 hover:text-white'
            }`}
            style={tab === t.key ? { background: 'rgba(52,211,153,0.25)' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="glass card-shadow text-center py-16 px-6">
          <p className="text-lg mb-5" style={{ color: 'var(--text-secondary)' }}>
            {tab === 'open'
              ? 'Nothing live. What are you going to do next?'
              : tab === 'mine'
              ? "You haven't committed to anything yet."
              : 'Nothing resolved yet.'}
          </p>
          {tab !== 'done' && !('commit' in myLockouts) && (
            <Link href="/commitments/new" className="btn-gradient inline-flex">
              <PlusIcon size={16} />
              Make a commitment
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((c) => (
            <CommitmentCard key={c.id} commitment={c} onChanged={load} />
          ))}
        </div>
      )}

      {/* Crew records */}
      {Object.keys(records).length > 0 && (
        <section className="glass card-shadow p-5 mt-8">
          <h2 className="font-display text-lg font-bold text-white mb-4">Crew record</h2>
          <div className="space-y-2">
            {Object.entries(records)
              .sort((a, b) => (b[1].rate ?? -1) - (a[1].rate ?? -1))
              .map(([pid, r]) => {
                const name = commitments.find((c) => c.playerId === pid)?.playerName || 'Unknown';
                return (
                  <div key={pid} className="flex items-center gap-3">
                    <Avatar id={pid} name={name} size={26} />
                    <span className="text-sm text-white flex-1 min-w-0 truncate">{name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {r.kept}/{r.kept + r.missed}
                    </span>
                    <span className="text-sm font-bold w-12 text-right" style={{ color: 'var(--accent-green)' }}>
                      {r.rate === null ? '—' : `${Math.round(r.rate * 100)}%`}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </AppShell>
  );
}

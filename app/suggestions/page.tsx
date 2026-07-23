'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { getCategoryMeta } from '@/lib/categories';
import { cldImage, cldThumb, cldVideoThumb } from '@/lib/cloudinary';
import LockoutBanner, { useMyLockouts } from '@/components/LockoutBanner';
import { PlusIcon, CheckIcon, XIcon, ImageIcon, ChevronDownIcon } from '@/components/icons';

interface EvidenceRef {
  id: string;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  posterName: string;
}

interface Suggestion {
  id: string;
  batchId: string | null;
  waitingOn: string[];
  subjectId: string;
  subjectName: string;
  proposerId: string;
  proposerName: string;
  statCode: string;
  statLabel: string;
  categoryCode: string;
  categoryLabel: string;
  currentValue: number;
  appliedOldValue: number | null;
  appliedNewValue: number | null;
  delta: number;
  reason: string;
  testimony: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  evidence: EvidenceRef[];
  yesVotes: number;
  noVotes: number;
  eligibleCount: number;
  votesNeeded: number;
  voters: { playerId: string; name: string; choice: string }[];
  yourVote: string | null;
  canVote: boolean;
  isSubject: boolean;
  isProposer: boolean;
}

/** A batch = suggestions created together (shared reason/evidence/testimony). */
interface Batch {
  key: string;
  items: Suggestion[];
}

/**
 * What numbers to show for a suggestion.
 *
 * Pending  → live value → what it would become (the live value is what the
 *            delta will actually apply to, so it's the honest preview).
 * Approved → the real before/after recorded when it was applied. Never
 *            recompute from the live value: that already includes this change,
 *            so "current + delta" double counts it.
 * Rejected → no before/after at all. Nothing happened, and the value it was
 *            proposed against is long stale — showing numbers would imply a
 *            change that never occurred.
 */
function valueDisplay(sg: Suggestion): { from: number; to: number } | null {
  if (sg.status === 'approved') {
    if (sg.appliedOldValue === null || sg.appliedNewValue === null) return null;
    return { from: sg.appliedOldValue, to: sg.appliedNewValue };
  }
  if (sg.status === 'pending') {
    return { from: sg.currentValue, to: Math.max(0, sg.currentValue + sg.delta) };
  }
  return null;
}

function groupByBatch(list: Suggestion[]): Batch[] {
  const map = new Map<string, Suggestion[]>();
  for (const sg of list) {
    const key = sg.batchId || sg.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(sg);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

export default function SuggestionsPage() {
  const { status } = useSession();
  const router = useRouter();
  const myLockouts = useMyLockouts(status === 'authenticated');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const [voting, setVoting] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<EvidenceRef | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadSuggestions();
      const interval = setInterval(loadSuggestions, 8000);
      return () => clearInterval(interval);
    }
  }, [status, router]);

  const loadSuggestions = async () => {
    try {
      const res = await fetch('/api/suggestions');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleVote = async (suggestionId: string, vote: 'yes' | 'no') => {
    setVoting(suggestionId);
    try {
      const res = await fetch(`/api/suggestions/${suggestionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }),
      });
      if (res.ok) {
        await loadSuggestions();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to vote');
      }
    } catch (error) {
      console.error('Failed to vote:', error);
    } finally {
      setVoting(null);
    }
  };

  const bulkVote = async (ids: string[], vote: 'yes' | 'no') => {
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/suggestions/bulk-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionIds: ids, vote }),
      });
      const data = await res.json();
      if (res.ok) {
        flash(`Voted ${vote.toUpperCase()} on ${data.voted} suggestion${data.voted !== 1 ? 's' : ''}`);
        setSelected(new Set());
        setSelectMode(false);
        await loadSuggestions();
      } else {
        alert(data.error || 'Bulk vote failed');
      }
    } catch (error) {
      console.error('Bulk vote failed:', error);
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell width="narrow">
        <PageHeader title="Suggestions" eyebrow="Crew Votes" eyebrowColor="var(--accent-purple)" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  const pending = suggestions.filter((s) => s.status === 'pending');
  const resolved = suggestions.filter((s) => s.status !== 'pending');
  const shown = tab === 'pending' ? pending : resolved;
  const batches = groupByBatch(shown);
  const votableIds = pending.filter((s) => s.canVote && s.yourVote === null).map((s) => s.id);

  return (
    <AppShell width="narrow">
      <PageHeader
        title="Suggestions"
        subtitle="The only way stats change: propose with evidence, the crew votes, majority decides."
        eyebrow="Crew Votes"
        eyebrowColor="var(--accent-purple)"
        actions={
          'suggest' in myLockouts ? undefined : (
            <Link href="/suggestions/new" className="btn-gradient text-sm">
              <PlusIcon size={16} />
              New suggestion
            </Link>
          )
        }
      />

      <LockoutBanner locks={myLockouts} feature="vote" />
      <LockoutBanner locks={myLockouts} feature="suggest" />

      {notice && (
        <div
          className="glass p-3 mb-4 text-sm font-medium animate-rise"
          style={{ borderColor: 'rgba(52,211,153,0.4)', color: 'var(--accent-green)' }}
        >
          {notice}
        </div>
      )}

      {/* Tabs + bulk-vote toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-6">
        <div className="flex gap-1 p-1 rounded-xl border w-fit" style={{ borderColor: 'var(--surface-border)' }}>
          {(
            [
              { key: 'pending', label: `Live queue (${pending.length})` },
              { key: 'resolved', label: `Resolved (${resolved.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSelectMode(false);
                setSelected(new Set());
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t.key ? 'text-white' : 'text-neutral-400 hover:text-white'
              }`}
              style={tab === t.key ? { background: 'rgba(168,85,247,0.25)' } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'pending' && votableIds.length > 1 && !('vote' in myLockouts) && (
          <button
            onClick={() => {
              setSelectMode(!selectMode);
              setSelected(new Set());
            }}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition ${
              selectMode ? 'text-white border-purple-400 bg-purple-500/25' : 'text-neutral-300 hover:text-white'
            }`}
            style={selectMode ? {} : { borderColor: 'var(--surface-border)' }}
          >
            {selectMode ? 'Cancel bulk vote' : 'Bulk vote'}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="glass card-shadow text-center py-16 px-6">
          <p className="text-lg mb-5" style={{ color: 'var(--text-secondary)' }}>
            {tab === 'pending'
              ? 'No live suggestions. Spot progress on the evidence board? Call it.'
              : 'Nothing resolved yet.'}
          </p>
          {tab === 'pending' && (
            <Link href="/evidence" className="btn-ghost inline-flex">
              Browse the evidence board
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const first = batch.items[0];
            const isGroup = batch.items.length > 1;
            const isOpen = expanded.has(batch.key);
            const groupVotable = batch.items.filter((s) => s.canVote && s.yourVote === null);
            const anyPending = batch.items.some((s) => s.status === 'pending');

            return (
              <article
                key={batch.key}
                className="glass card-shadow p-5"
                style={{ borderLeft: `3px solid ${getCategoryMeta(first.categoryCode, first.categoryLabel).hex}` }}
              >
                {/* Shared header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {selectMode && anyPending && groupVotable.length > 0 && (
                      <input
                        type="checkbox"
                        checked={groupVotable.every((s) => selected.has(s.id))}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            groupVotable.forEach((s) => (e.target.checked ? next.add(s.id) : next.delete(s.id)));
                            return next;
                          });
                        }}
                        className="w-5 h-5 accent-purple-500 shrink-0"
                      />
                    )}
                    <Avatar id={first.subjectId} name={first.subjectName} size={38} />
                    <div className="min-w-0">
                      <p className="font-display font-bold text-white truncate">{first.subjectName}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        proposed by {first.proposerName}
                        {first.isProposer && ' (you)'} · {new Date(first.createdAt).toLocaleDateString()}
                        {isGroup && ` · ${batch.items.length} changes`}
                      </p>
                    </div>
                  </div>
                  {!isGroup && first.status !== 'pending' && <StatusChip status={first.status} />}
                </div>

                <p className="text-sm italic mb-3" style={{ color: 'var(--text-secondary)' }}>
                  "{first.reason}"
                </p>

                {first.testimony && (
                  <div
                    className="rounded-xl px-3.5 py-2.5 mb-3 text-sm border"
                    style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)' }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-yellow)' }}>
                      Witness testimony — {first.proposerName}
                    </p>
                    <p className="text-neutral-200 whitespace-pre-wrap break-words">{first.testimony}</p>
                  </div>
                )}

                {first.evidence.length > 0 && (
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {first.evidence.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => setLightbox(ev)}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border transition hover:brightness-110"
                        style={{ borderColor: 'var(--surface-border-strong)' }}
                        title={ev.caption || `Evidence from ${ev.posterName}`}
                      >
                        {ev.mediaUrl ? (
                          ev.mediaType === 'video' ? (
                            <>
                              <img src={cldVideoThumb(ev.mediaUrl, 64)} alt="" className="w-full h-full object-cover" />
                              <span className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/20 text-[10px]">
                                ▶
                              </span>
                            </>
                          ) : (
                            <img src={cldThumb(ev.mediaUrl, 64)} alt="" className="w-full h-full object-cover" />
                          )
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-neutral-500">
                            <ImageIcon size={18} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {isGroup ? (
                  <>
                    {/* Collapsed summary: one chip per stat change */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {batch.items.map((sg) => {
                        const meta = getCategoryMeta(sg.categoryCode, sg.categoryLabel);
                        const dc = sg.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                        return (
                          <span
                            key={sg.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
                            style={{ borderColor: `${meta.hex}44`, background: `${meta.hex}0f`, color: 'white' }}
                          >
                            <span style={{ color: dc }}>
                              {sg.delta > 0 ? '+' : ''}
                              {sg.delta}
                            </span>
                            {sg.statLabel}
                            {sg.status !== 'pending' && (
                              <span style={{ color: sg.status === 'approved' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                {sg.status === 'approved' ? '✓' : '✗'}
                              </span>
                            )}
                            {sg.status === 'pending' && sg.yourVote && (
                              <span className="opacity-70">({sg.yourVote === 'yes' ? 'you ✓' : 'you ✗'})</span>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* Group actions */}
                    <div className="flex items-center gap-2 flex-wrap border-t pt-3.5" style={{ borderColor: 'var(--surface-border)' }}>
                      {anyPending && groupVotable.length > 0 && !selectMode && (
                        <>
                          <button
                            onClick={() => bulkVote(groupVotable.map((s) => s.id), 'yes')}
                            disabled={bulkBusy}
                            className="px-3.5 py-2 rounded-xl text-sm font-semibold border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <CheckIcon size={14} /> Yes to all ({groupVotable.length})
                          </button>
                          <button
                            onClick={() => bulkVote(groupVotable.map((s) => s.id), 'no')}
                            disabled={bulkBusy}
                            className="px-3.5 py-2 rounded-xl text-sm font-semibold border text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <XIcon size={14} /> No to all
                          </button>
                        </>
                      )}
                      <button
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(batch.key)) next.delete(batch.key);
                            else next.add(batch.key);
                            return next;
                          })
                        }
                        className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-neutral-300 hover:text-white border transition"
                        style={{ borderColor: 'var(--surface-border)' }}
                      >
                        <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                          <ChevronDownIcon size={14} />
                        </span>
                        {isOpen ? 'Collapse' : 'Vote individually'}
                      </button>
                    </div>

                    {/* Expanded: one row per stat with its own vote controls */}
                    {isOpen && (
                      <div className="mt-3 space-y-2.5">
                        {batch.items.map((sg) => (
                          <StatVoteRow
                            key={sg.id}
                            sg={sg}
                            voting={voting}
                            onVote={handleVote}
                            selectMode={selectMode}
                            selected={selected.has(sg.id)}
                            onToggleSelect={() => toggleSelected(sg.id)}
                          />
                        ))}
                      </div>
                    )}

                    {anyPending && first.waitingOn.length > 0 && (
                      <p className="text-[11px] mt-3" style={{ color: 'var(--text-secondary)' }}>
                        ⏳ Waiting on: <span className="text-neutral-300 font-medium">{first.waitingOn.join(', ')}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <SingleSuggestionBody
                    sg={first}
                    voting={voting}
                    onVote={handleVote}
                    selectMode={selectMode}
                    selected={selected.has(first.id)}
                    onToggleSelect={() => toggleSelected(first.id)}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Sticky bulk-vote action bar */}
      {selectMode && selected.size > 0 && (
        <div
          className="fixed bottom-20 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 rounded-2xl border backdrop-blur-xl p-3 flex items-center gap-2.5 justify-center flex-wrap card-shadow-lg"
          style={{ backgroundColor: 'rgba(14,14,20,0.95)', borderColor: 'rgba(168,85,247,0.5)' }}
        >
          <span className="text-sm font-semibold text-white">{selected.size} selected</span>
          <button
            onClick={() => bulkVote([...selected], 'yes')}
            disabled={bulkBusy}
            className="px-4 py-2 rounded-xl text-sm font-semibold border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <CheckIcon size={14} /> Vote yes
          </button>
          <button
            onClick={() => bulkVote([...selected], 'no')}
            disabled={bulkBusy}
            className="px-4 py-2 rounded-xl text-sm font-semibold border text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <XIcon size={14} /> Vote no
          </button>
        </div>
      )}

      {/* Evidence lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            {lightbox.mediaUrl &&
              (lightbox.mediaType === 'video' ? (
                <video src={lightbox.mediaUrl} className="w-full max-h-[70vh] object-contain rounded-2xl" controls autoPlay />
              ) : (
                <img src={cldImage(lightbox.mediaUrl)} alt="" className="w-full max-h-[70vh] object-contain rounded-2xl" />
              ))}
            <div className="flex items-start justify-between gap-3 mt-3">
              <div>
                {lightbox.caption && <p className="text-sm text-white">{lightbox.caption}</p>}
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Posted by {lightbox.posterName}
                </p>
              </div>
              <button onClick={() => setLightbox(null)} className="btn-ghost py-1.5 px-3 text-sm shrink-0">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide shrink-0"
      style={{
        background: status === 'approved' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
        color: status === 'approved' ? 'var(--accent-green)' : 'var(--accent-red)',
      }}
    >
      {status}
    </span>
  );
}

function VoteButtons({
  sg,
  voting,
  onVote,
  compact = false,
}: {
  sg: Suggestion;
  voting: string | null;
  onVote: (id: string, vote: 'yes' | 'no') => void;
  compact?: boolean;
}) {
  const pad = compact ? 'px-3 py-1.5' : 'px-4 py-2';
  return (
    <div className="flex gap-2 shrink-0">
      <button
        onClick={() => onVote(sg.id, 'yes')}
        disabled={voting === sg.id}
        className={`${pad} rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 ${
          sg.yourVote === 'yes'
            ? 'text-white border-emerald-400 bg-emerald-500/30'
            : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'
        }`}
      >
        <CheckIcon size={14} /> Yes
      </button>
      <button
        onClick={() => onVote(sg.id, 'no')}
        disabled={voting === sg.id}
        className={`${pad} rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 ${
          sg.yourVote === 'no'
            ? 'text-white border-red-400 bg-red-500/30'
            : 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20'
        }`}
      >
        <XIcon size={14} /> No
      </button>
    </div>
  );
}

function VoteTally({ sg }: { sg: Suggestion }) {
  return (
    <div className="flex-1 min-w-[160px]">
      <div className="flex items-center justify-between text-[11px] font-semibold mb-1.5">
        <span style={{ color: 'var(--accent-green)' }}>{sg.yesVotes} yes</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          needs {sg.votesNeeded} of {sg.eligibleCount}
        </span>
        <span style={{ color: 'var(--accent-red)' }}>{sg.noVotes} no</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full transition-all"
          style={{ width: `${(sg.yesVotes / Math.max(1, sg.eligibleCount)) * 100}%`, background: 'var(--accent-green)' }}
        />
        <div className="flex-1" />
        <div
          className="h-full transition-all"
          style={{ width: `${(sg.noVotes / Math.max(1, sg.eligibleCount)) * 100}%`, background: 'var(--accent-red)' }}
        />
      </div>
      {sg.voters.length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {sg.voters.map((v) => (
            <span
              key={v.playerId}
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: v.choice === 'yes' ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
                color: v.choice === 'yes' ? 'var(--accent-green)' : 'var(--accent-red)',
              }}
            >
              {v.name} {v.choice === 'yes' ? '✓' : '✗'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact per-stat row inside an expanded batch card. */
function StatVoteRow({
  sg,
  voting,
  onVote,
  selectMode,
  selected,
  onToggleSelect,
}: {
  sg: Suggestion;
  voting: string | null;
  onVote: (id: string, vote: 'yes' | 'no') => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const meta = getCategoryMeta(sg.categoryCode, sg.categoryLabel);
  const dc = sg.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  const values = valueDisplay(sg);
  const votable = sg.status === 'pending' && sg.canVote;

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: `${meta.hex}33`, background: `${meta.hex}08` }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {selectMode && votable && sg.yourVote === null && (
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-4 h-4 accent-purple-500 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{sg.statLabel}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.hex }}>
              {sg.statCode}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {values && <span className="text-sm font-bold text-neutral-400">{values.from}</span>}
          <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: `color-mix(in srgb, ${dc} 18%, transparent)`, color: dc }}>
            {sg.delta > 0 ? '+' : ''}
            {sg.delta}
          </span>
          {values && (
            <span className="text-sm font-bold" style={{ color: dc }}>
              → {values.to}
            </span>
          )}
          {sg.status !== 'pending' && <StatusChip status={sg.status} />}
        </div>
      </div>
      {sg.status === 'pending' && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <VoteTally sg={sg} />
          {sg.isSubject ? (
            <p className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
              Your stats — no vote
            </p>
          ) : votable && !selectMode ? (
            <VoteButtons sg={sg} voting={voting} onVote={onVote} compact />
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The body of a classic single-stat suggestion card. */
function SingleSuggestionBody({
  sg,
  voting,
  onVote,
  selectMode,
  selected,
  onToggleSelect,
}: {
  sg: Suggestion;
  voting: string | null;
  onVote: (id: string, vote: 'yes' | 'no') => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const meta = getCategoryMeta(sg.categoryCode, sg.categoryLabel);
  const dc = sg.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  const values = valueDisplay(sg);
  const votable = sg.status === 'pending' && sg.canVote && sg.yourVote === null;

  return (
    <>
      <div
        className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-3 border"
        style={{ borderColor: `${meta.hex}33`, background: `${meta.hex}0c` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {selectMode && votable && (
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-5 h-5 accent-purple-500 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{sg.statLabel}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: meta.hex }}>
              {sg.statCode} · {sg.categoryLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {values && <span className="text-lg font-bold text-neutral-400">{values.from}</span>}
          <span
            className="px-2 py-0.5 rounded-lg text-sm font-bold"
            style={{ background: `color-mix(in srgb, ${dc} 18%, transparent)`, color: dc }}
          >
            {sg.delta > 0 ? '+' : ''}
            {sg.delta}
          </span>
          {values && (
            <span className="text-lg font-bold" style={{ color: dc }}>
              → {values.to}
            </span>
          )}
          {sg.status === 'rejected' && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              not applied
            </span>
          )}
        </div>
      </div>

      <div className="border-t pt-3.5" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <VoteTally sg={sg} />
          {sg.status === 'pending' &&
            (sg.isSubject ? (
              <p className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                Your stats — you don't vote on this one
              </p>
            ) : sg.canVote && !selectMode ? (
              <VoteButtons sg={sg} voting={voting} onVote={onVote} />
            ) : null)}
        </div>
        {sg.status === 'pending' && sg.waitingOn.length > 0 && (
          <p className="text-[11px] mt-2.5" style={{ color: 'var(--text-secondary)' }}>
            ⏳ Waiting on: <span className="text-neutral-300 font-medium">{sg.waitingOn.join(', ')}</span>
          </p>
        )}
      </div>
    </>
  );
}

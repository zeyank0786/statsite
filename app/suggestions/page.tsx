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
import { PlusIcon, CheckIcon, XIcon, ImageIcon } from '@/components/icons';

interface EvidenceRef {
  id: string;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  posterName: string;
}

interface Suggestion {
  id: string;
  subjectId: string;
  subjectName: string;
  proposerId: string;
  proposerName: string;
  statCode: string;
  statLabel: string;
  categoryCode: string;
  categoryLabel: string;
  currentValue: number;
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

export default function SuggestionsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const [voting, setVoting] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<EvidenceRef | null>(null);

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

  return (
    <AppShell width="narrow">
      <PageHeader
        title="Suggestions"
        subtitle="The only way stats change: propose with evidence, the crew votes, majority decides."
        eyebrow="Crew Votes"
        eyebrowColor="var(--accent-purple)"
        actions={
          <Link href="/suggestions/new" className="btn-gradient text-sm">
            <PlusIcon size={16} />
            New suggestion
          </Link>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl border w-fit mb-6" style={{ borderColor: 'var(--surface-border)' }}>
        {(
          [
            { key: 'pending', label: `Live queue (${pending.length})` },
            { key: 'resolved', label: `Resolved (${resolved.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key ? 'text-white' : 'text-neutral-400 hover:text-white'
            }`}
            style={tab === t.key ? { background: 'rgba(168,85,247,0.25)' } : {}}
          >
            {t.label}
          </button>
        ))}
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
          {shown.map((sg) => {
            const meta = getCategoryMeta(sg.categoryCode, sg.categoryLabel);
            const positive = sg.delta > 0;
            const deltaColor = positive ? 'var(--accent-green)' : 'var(--accent-red)';
            const projected = Math.max(0, sg.currentValue + sg.delta);

            return (
              <article
                key={sg.id}
                className="glass card-shadow p-5"
                style={{ borderLeft: `3px solid ${meta.hex}` }}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar id={sg.subjectId} name={sg.subjectName} size={38} />
                    <div className="min-w-0">
                      <p className="font-display font-bold text-white truncate">{sg.subjectName}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        proposed by {sg.proposerName}
                        {sg.isProposer && ' (you)'} · {new Date(sg.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {sg.status !== 'pending' && (
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide shrink-0"
                      style={{
                        background:
                          sg.status === 'approved' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
                        color: sg.status === 'approved' ? 'var(--accent-green)' : 'var(--accent-red)',
                      }}
                    >
                      {sg.status}
                    </span>
                  )}
                </div>

                {/* Stat + delta */}
                <div
                  className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-3 border"
                  style={{ borderColor: `${meta.hex}33`, background: `${meta.hex}0c` }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{sg.statLabel}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: meta.hex }}>
                      {sg.statCode} · {sg.categoryLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-lg font-bold text-neutral-400">{sg.currentValue}</span>
                    <span
                      className="px-2 py-0.5 rounded-lg text-sm font-bold"
                      style={{ background: `color-mix(in srgb, ${deltaColor} 18%, transparent)`, color: deltaColor }}
                    >
                      {positive ? '+' : ''}
                      {sg.delta}
                    </span>
                    <span className="text-lg font-bold" style={{ color: deltaColor }}>
                      → {projected}
                    </span>
                  </div>
                </div>

                <p className="text-sm italic mb-3" style={{ color: 'var(--text-secondary)' }}>
                  "{sg.reason}"
                </p>

                {/* Written witness testimony (substitutes for media evidence) */}
                {sg.testimony && (
                  <div
                    className="rounded-xl px-3.5 py-2.5 mb-3 text-sm border"
                    style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)' }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-yellow)' }}>
                      Witness testimony — {sg.proposerName}
                    </p>
                    <p className="text-neutral-200 whitespace-pre-wrap break-words">{sg.testimony}</p>
                  </div>
                )}

                {/* Evidence thumbnails */}
                {sg.evidence.length > 0 && (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {sg.evidence.map((ev) => (
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

                {/* Vote tally + controls */}
                <div className="border-t pt-3.5" style={{ borderColor: 'var(--surface-border)' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center justify-between text-[11px] font-semibold mb-1.5">
                        <span style={{ color: 'var(--accent-green)' }}>
                          {sg.yesVotes} yes
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          needs {sg.votesNeeded} of {sg.eligibleCount}
                        </span>
                        <span style={{ color: 'var(--accent-red)' }}>{sg.noVotes} no</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${(sg.yesVotes / Math.max(1, sg.eligibleCount)) * 100}%`,
                            background: 'var(--accent-green)',
                          }}
                        />
                        <div className="flex-1" />
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${(sg.noVotes / Math.max(1, sg.eligibleCount)) * 100}%`,
                            background: 'var(--accent-red)',
                          }}
                        />
                      </div>
                      {sg.voters.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {sg.voters.map((v) => (
                            <span
                              key={v.playerId}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{
                                background:
                                  v.choice === 'yes' ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
                                color: v.choice === 'yes' ? 'var(--accent-green)' : 'var(--accent-red)',
                              }}
                            >
                              {v.name} {v.choice === 'yes' ? '✓' : '✗'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {sg.status === 'pending' &&
                      (sg.isSubject ? (
                        <p className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                          Your stats — you don't vote on this one
                        </p>
                      ) : sg.canVote ? (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleVote(sg.id, 'yes')}
                            disabled={voting === sg.id}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 ${
                              sg.yourVote === 'yes'
                                ? 'text-white border-emerald-400 bg-emerald-500/30'
                                : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'
                            }`}
                          >
                            <CheckIcon size={14} /> Yes
                          </button>
                          <button
                            onClick={() => handleVote(sg.id, 'no')}
                            disabled={voting === sg.id}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 ${
                              sg.yourVote === 'no'
                                ? 'text-white border-red-400 bg-red-500/30'
                                : 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20'
                            }`}
                          >
                            <XIcon size={14} /> No
                          </button>
                        </div>
                      ) : null)}
                  </div>
                </div>
              </article>
            );
          })}
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

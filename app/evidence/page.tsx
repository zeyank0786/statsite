'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { getUserColorHex } from '@/lib/userColors';
import { orderCategories } from '@/lib/categories';
import { cloudinaryConfigured } from '@/lib/cloudinary';
import LockoutBanner, { useMyLockouts } from '@/components/LockoutBanner';
import EvidenceCard, { EvidenceTile, CardHandlers } from '@/components/EvidenceCard';
import EvidenceToolbar from '@/components/EvidenceToolbar';
import EvidenceComposer from '@/components/EvidenceComposer';
import EvidenceDetailModal from '@/components/EvidenceDetailModal';
import { useEvidencePrefs, activeFilterCount } from '@/lib/evidencePrefs';
import { EvidencePost, CategoryOption, EvidencePlayer, dateGroup } from '@/lib/evidenceTypes';
import { CameraIcon, ChevronDownIcon } from '@/components/icons';

export default function EvidenceBoardPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const { prefs, update } = useEvidencePrefs();

  const [players, setPlayers] = useState<EvidencePlayer[]>([]);
  const [posts, setPosts] = useState<EvidencePost[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [detail, setDetail] = useState<EvidencePost | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const currentPlayerId = (session?.user as any)?.playerId;
  const myLockouts = useMyLockouts(status === 'authenticated');
  const evidenceLocked = 'evidence' in myLockouts;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') loadAll();
  }, [status, router]);

  const loadAll = async () => {
    try {
      const [playersRes, postsRes, categoriesRes] = await Promise.all([
        fetch('/api/players'),
        fetch('/api/evidence'),
        fetch('/api/categories'),
      ]);
      if (playersRes.ok) setPlayers(await playersRes.json());
      if (postsRes.ok) {
        const loaded: EvidencePost[] = await postsRes.json();
        setPosts(loaded);
        // Seeing the board = reading it; clears the nav badge (own posts never count)
        const seenIds = loaded.filter((p) => !p.isOwn).map((p) => p.id);
        if (seenIds.length > 0) {
          fetch('/api/evidence/unread', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evidenceIds: seenIds }),
          }).catch(() => {});
        }
      }
      if (categoriesRes.ok) setCategories(orderCategories(await categoriesRes.json()));
    } catch (error) {
      console.error('Failed to load evidence board:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveCaption = async (evidenceId: string, caption: string) => {
    try {
      const res = await fetch('/api/evidence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, caption }),
      });
      if (res.ok) {
        await loadAll();
        setDetail((d) => (d && d.id === evidenceId ? { ...d, caption } : d));
      }
    } catch (error) {
      console.error('Failed to save caption:', error);
    }
  };

  const handlers: CardHandlers = {
    onOpen: (post) => setDetail(post),
    onEdit: (post) => setDetail(post), // editing happens in the detail modal
    onToggleCaption: async (post) => {
      try {
        await fetch('/api/evidence', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ evidenceId: post.id, captionHidden: !post.captionHidden }),
        });
        await loadAll();
        setDetail((d) => (d && d.id === post.id ? { ...d, captionHidden: !post.captionHidden } : d));
      } catch (error) {
        console.error('Failed to toggle caption:', error);
      }
    },
    onDelete: async (post) => {
      if (!confirm('Delete this evidence post? This cannot be undone.')) return;
      try {
        const res = await fetch('/api/evidence', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ evidenceId: post.id }),
        });
        if (res.ok) {
          setDetail(null);
          await loadAll();
        } else {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Failed to delete');
        }
      } catch (error) {
        console.error('Failed to delete evidence:', error);
      }
    },
  };

  /** Filter + sort once, reused by every view. */
  const visible = useMemo(() => {
    const needle = prefs.search.trim().toLowerCase();
    const catSet = new Set(prefs.categoryIds);
    const playerSet = new Set(prefs.playerIds);

    const filtered = posts.filter((p) => {
      if (playerSet.size > 0 && !playerSet.has(p.playerId)) return false;
      if (catSet.size > 0 && !p.categories.some((c) => catSet.has(c.categoryId))) return false;
      if (prefs.media === 'photo' && p.mediaType !== 'image') return false;
      if (prefs.media === 'video' && p.mediaType !== 'video') return false;
      if (prefs.media === 'text' && p.mediaUrl) return false;
      if (prefs.citedOnly && p.suggestionCount === 0) return false;
      if (needle) {
        const hay = `${p.caption || ''} ${p.playerName} ${p.categories.map((c) => c.label).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (prefs.sort === 'cited') return b.suggestionCount - a.suggestionCount || (a.createdAt < b.createdAt ? 1 : -1);
      if (prefs.sort === 'oldest') return a.createdAt < b.createdAt ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }, [posts, prefs]);

  /** Feed view groups by date so the stream has structure. */
  const grouped = useMemo(() => {
    const map = new Map<string, EvidencePost[]>();
    for (const p of visible) {
      const key = dateGroup(p.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()];
  }, [visible]);

  if (status === 'loading' || loading) {
    return (
      <AppShell width="wide">
        <PageHeader title="Evidence Board" eyebrow="Receipts" eyebrowColor="var(--accent-orange)" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  const filtersOn = activeFilterCount(prefs) > 0;

  const emptyState = (
    <div className="glass card-shadow text-center py-16 px-6">
      <p className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>
        {filtersOn ? 'Nothing matches those filters.' : 'No evidence yet.'}
      </p>
      {filtersOn ? (
        <button
          onClick={() => update({ playerIds: [], categoryIds: [], media: 'all', citedOnly: false, search: '' })}
          className="btn-ghost inline-flex mt-2"
        >
          Clear filters
        </button>
      ) : (
        !evidenceLocked && (
          <button onClick={() => setComposerOpen(true)} className="btn-gradient inline-flex mt-2">
            <CameraIcon size={16} />
            Post the first one
          </button>
        )
      )}
    </div>
  );

  return (
    <AppShell width="wide">
      <PageHeader
        title="Evidence Board"
        subtitle="Post proof of your progress. Suggestions must cite it — no receipts, no stat changes."
        eyebrow="Receipts"
        eyebrowColor="var(--accent-orange)"
        actions={
          !evidenceLocked ? (
            <button onClick={() => setComposerOpen(true)} className="btn-gradient text-sm">
              <CameraIcon size={16} />
              Post evidence
            </button>
          ) : undefined
        }
      />

      <LockoutBanner locks={myLockouts} feature="evidence" />

      {!cloudinaryConfigured && (
        <div
          className="glass p-4 mb-5 text-sm animate-rise"
          style={{ borderColor: 'rgba(251,191,36,0.35)', color: 'var(--text-secondary)' }}
        >
          <span className="font-semibold" style={{ color: 'var(--accent-yellow)' }}>
            Media uploads not configured yet.
          </span>{' '}
          Caption-only posts work fine — photo/video uploads switch on once the Cloudinary env vars are set (see
          CLOUDINARY-SETUP.md).
        </div>
      )}

      <EvidenceToolbar
        prefs={prefs}
        update={update}
        players={players}
        categories={categories}
        shown={visible.length}
        total={posts.length}
      />

      {visible.length === 0 ? (
        emptyState
      ) : prefs.view === 'grid' ? (
        /* ===== Grid: dense gallery, tap to open ===== */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {visible.map((post) => (
            <EvidenceTile key={post.id} post={post} onOpen={handlers.onOpen} />
          ))}
        </div>
      ) : prefs.view === 'columns' ? (
        /* ===== Columns: one per player, collapsible ===== */
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none">
          {players
            .filter((p) => prefs.playerIds.length === 0 || prefs.playerIds.includes(p.id))
            .map((player) => {
              const hex = getUserColorHex(player.id);
              const playerPosts = visible.filter((p) => p.playerId === player.id);
              const isCollapsed = collapsed.has(player.id);

              return (
                <section key={player.id} className="flex-1 min-w-[280px] max-w-[420px] snap-start">
                  <button
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(player.id)) next.delete(player.id);
                        else next.add(player.id);
                        return next;
                      })
                    }
                    className="glass p-3.5 mb-3 flex items-center gap-2.5 w-full text-left hover:bg-white/[0.03] transition"
                    style={{ borderTop: `3px solid ${hex}`, backgroundColor: 'rgba(16,16,24,0.92)' }}
                  >
                    <Avatar id={player.id} name={player.username} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-white truncate">{player.username}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {playerPosts.length} post{playerPosts.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className={`transition-transform shrink-0 ${isCollapsed ? '-rotate-90' : ''}`}>
                      <ChevronDownIcon size={16} />
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-3">
                      {playerPosts.length === 0 && (
                        <div
                          className="rounded-2xl border border-dashed py-10 text-center text-sm"
                          style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
                        >
                          Nothing here
                        </div>
                      )}
                      {playerPosts.map((post) => (
                        <EvidenceCard
                          key={post.id}
                          post={post}
                          handlers={handlers}
                          compact={prefs.compact}
                          showAuthor={false}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
        </div>
      ) : (
        /* ===== Feed: chronological, grouped by date ===== */
        <div className="space-y-6">
          {grouped.map(([label, group]) => (
            <section key={label}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--text-secondary)' }}>
                  {label}
                </h2>
                <span className="h-px flex-1" style={{ background: 'var(--surface-border)' }} />
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {group.length}
                </span>
              </div>
              <div
                className={
                  prefs.compact
                    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl'
                }
              >
                {group.map((post) => (
                  <EvidenceCard key={post.id} post={post} handlers={handlers} compact={prefs.compact} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {composerOpen && (
        <EvidenceComposer
          categories={categories}
          onClose={() => setComposerOpen(false)}
          onPosted={loadAll}
          onReloadCategories={loadAll}
        />
      )}

      {detail && (
        <EvidenceDetailModal
          post={detail}
          handlers={handlers}
          onClose={() => setDetail(null)}
          onSaveCaption={saveCaption}
        />
      )}
    </AppShell>
  );
}

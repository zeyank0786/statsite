'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import { getUserColorHex } from '@/lib/userColors';
import { getCategoryMeta, orderCategories } from '@/lib/categories';
import { cloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary';
import {
  UploadIcon,
  XIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  LightbulbIcon,
  LinkIcon,
  CameraIcon,
  CheckIcon,
} from '@/components/icons';

interface CategoryOption {
  id: string;
  code: string;
  label: string;
}

interface EvidencePost {
  id: string;
  playerId: string;
  playerName: string;
  playerActive: boolean;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  caption: string | null;
  captionHidden: boolean;
  categories: { categoryId: string; code: string; label: string }[];
  suggestionCount: number;
  isOwn: boolean;
  createdAt: string;
}

interface Player {
  id: string;
  username: string;
}

export default function EvidenceBoardPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [posts, setPosts] = useState<EvidencePost[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState('');

  const currentPlayerId = (session?.user as any)?.playerId;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') {
      loadAll();
    }
  }, [status, router]);

  const loadAll = async () => {
    try {
      const [playersRes, postsRes, categoriesRes] = await Promise.all([
        fetch('/api/players'),
        fetch('/api/evidence'),
        fetch('/api/categories'),
      ]);
      if (playersRes.ok) setPlayers(await playersRes.json());
      if (postsRes.ok) setPosts(await postsRes.json());
      if (categoriesRes.ok) {
        const cats = await categoriesRes.json();
        setCategories(orderCategories(cats));
      }
    } catch (error) {
      console.error('Failed to load evidence board:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilePick = (picked: File | null) => {
    setFile(picked);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(picked ? URL.createObjectURL(picked) : null);
  };

  const resetComposer = () => {
    setComposerOpen(false);
    handleFilePick(null);
    setCaption('');
    setSelectedCategoryIds([]);
    setComposerError('');
  };

  const handlePost = async () => {
    setComposerError('');
    if (selectedCategoryIds.length === 0) {
      setComposerError('Pick at least one category this evidence relates to');
      return;
    }
    if (!file && !caption.trim()) {
      setComposerError('Add a photo/video or at least a caption');
      return;
    }

    setPosting(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      let cloudinaryPublicId: string | null = null;

      if (file) {
        const uploaded = await uploadToCloudinary(file);
        mediaUrl = uploaded.url;
        mediaType = uploaded.mediaType;
        cloudinaryPublicId = uploaded.publicId;
      }

      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrl,
          mediaType,
          cloudinaryPublicId,
          caption: caption.trim() || null,
          categoryIds: selectedCategoryIds,
        }),
      });
      if (res.ok) {
        resetComposer();
        await loadAll();
      } else {
        const err = await res.json();
        setComposerError(err.error || 'Failed to post');
      }
    } catch (error: any) {
      setComposerError(error.message || 'Upload failed');
    } finally {
      setPosting(false);
    }
  };

  const handleSaveCaption = async (evidenceId: string) => {
    try {
      const res = await fetch('/api/evidence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, caption: editingCaption }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditingCaption('');
        await loadAll();
      }
    } catch (error) {
      console.error('Failed to save caption:', error);
    }
  };

  const handleToggleCaption = async (post: EvidencePost) => {
    try {
      await fetch('/api/evidence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId: post.id, captionHidden: !post.captionHidden }),
      });
      await loadAll();
    } catch (error) {
      console.error('Failed to toggle caption:', error);
    }
  };

  const handleDelete = async (post: EvidencePost) => {
    if (!confirm('Delete this evidence post? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/evidence', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId: post.id }),
      });
      if (res.ok) {
        await loadAll();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Failed to delete evidence:', error);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <AppShell width="wide">
        <PageHeader title="Evidence Board" eyebrow="Receipts" eyebrowColor="var(--accent-orange)" />
        <div className="glass h-96 animate-pulse" />
      </AppShell>
    );
  }

  return (
    <AppShell width="wide">
      <PageHeader
        title="Evidence Board"
        subtitle="Post proof of your progress. Suggestions must cite it — no receipts, no stat changes."
        eyebrow="Receipts"
        eyebrowColor="var(--accent-orange)"
      />

      {!cloudinaryConfigured && (
        <div
          className="glass p-4 mb-5 text-sm animate-rise"
          style={{ borderColor: 'rgba(251,191,36,0.35)', color: 'var(--text-secondary)' }}
        >
          <span className="font-semibold" style={{ color: 'var(--accent-yellow)' }}>
            Media uploads not configured yet.
          </span>{' '}
          Caption-only posts work fine — photo/video uploads switch on once the Cloudinary env vars are set
          (see CLOUDINARY-SETUP.md).
        </div>
      )}

      {/* One column per active player, reflows with roster size */}
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none">
        {players.map((player) => {
          const hex = getUserColorHex(player.id);
          const isOwn = player.id === currentPlayerId;
          const playerPosts = posts.filter((p) => p.playerId === player.id);

          return (
            <section
              key={player.id}
              className="flex-1 min-w-[280px] max-w-[420px] snap-start"
            >
              {/* Column header */}
              <div
                className="glass p-3.5 mb-3 flex items-center gap-2.5"
                style={{ borderTop: `3px solid ${hex}`, backgroundColor: 'rgba(16,16,24,0.92)' }}
              >
                <Avatar id={player.id} name={player.username} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-white truncate">{player.username}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {playerPosts.length} post{playerPosts.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {isOwn && (
                  <button
                    onClick={() => setComposerOpen(!composerOpen)}
                    className="btn-gradient text-xs py-1.5 px-3"
                  >
                    <CameraIcon size={14} />
                    Post
                  </button>
                )}
              </div>

              {/* Composer — only in your own column */}
              {isOwn && composerOpen && (
                <div className="glass-strong card-shadow p-4 mb-3 animate-rise">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handleFilePick(e.target.files?.[0] || null)}
                  />

                  {filePreview && file ? (
                    <div className="relative mb-3 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--surface-border)' }}>
                      {file.type.startsWith('video') ? (
                        <video src={filePreview} className="w-full max-h-56 object-cover" controls muted />
                      ) : (
                        <img src={filePreview} alt="Preview" className="w-full max-h-56 object-cover" />
                      )}
                      <button
                        onClick={() => handleFilePick(null)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-black transition"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!cloudinaryConfigured}
                      className="w-full mb-3 py-6 rounded-xl border border-dashed flex flex-col items-center gap-1.5 text-sm transition hover:bg-white/[0.03] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ borderColor: 'var(--surface-border-strong)', color: 'var(--text-secondary)' }}
                    >
                      <UploadIcon size={20} />
                      {cloudinaryConfigured ? 'Add photo or video' : 'Uploads not configured'}
                    </button>
                  )}

                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Caption — what does this prove?"
                    className="field resize-none text-sm mb-3"
                    rows={2}
                  />

                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Categories this relates to
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {categories.map((cat) => {
                      const meta = getCategoryMeta(cat.code, cat.label);
                      const selected = selectedCategoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() =>
                            setSelectedCategoryIds(
                              selected
                                ? selectedCategoryIds.filter((id) => id !== cat.id)
                                : [...selectedCategoryIds, cat.id]
                            )
                          }
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border transition ${
                            selected ? 'text-white' : 'text-neutral-400 hover:text-white'
                          }`}
                          style={
                            selected
                              ? { background: `${meta.hex}30`, borderColor: `${meta.hex}90` }
                              : { borderColor: 'var(--surface-border)' }
                          }
                        >
                          {meta.short}
                        </button>
                      );
                    })}
                  </div>

                  {composerError && (
                    <p className="text-xs text-red-400 mb-3">{composerError}</p>
                  )}

                  <div className="flex gap-2">
                    <button onClick={handlePost} disabled={posting} className="btn-gradient text-sm py-2 flex-1">
                      {posting ? 'Posting...' : 'Post evidence'}
                    </button>
                    <button onClick={resetComposer} className="btn-ghost text-sm py-2">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Posts */}
              <div className="space-y-3">
                {playerPosts.length === 0 && (
                  <div
                    className="rounded-2xl border border-dashed py-10 text-center text-sm"
                    style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
                  >
                    No evidence yet
                  </div>
                )}
                {playerPosts.map((post) => (
                  <article key={post.id} className="glass card-shadow overflow-hidden">
                    {post.mediaUrl && (
                      <div className="bg-black/40">
                        {post.mediaType === 'video' ? (
                          <video src={post.mediaUrl} className="w-full max-h-72 object-contain" controls playsInline />
                        ) : (
                          <img src={post.mediaUrl} alt={post.caption || 'Evidence'} className="w-full max-h-72 object-contain" loading="lazy" />
                        )}
                      </div>
                    )}

                    <div className="p-3.5">
                      {/* Caption */}
                      {editingId === post.id ? (
                        <div className="mb-2.5">
                          <textarea
                            value={editingCaption}
                            onChange={(e) => setEditingCaption(e.target.value)}
                            className="field resize-none text-sm mb-2"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveCaption(post.id)} className="btn-primary text-xs py-1.5">
                              <CheckIcon size={13} /> Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditingCaption('');
                              }}
                              className="btn-ghost text-xs py-1.5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {post.caption && !post.captionHidden && (
                            <p className="text-sm text-neutral-200 mb-2.5 whitespace-pre-wrap break-words">
                              {post.caption}
                            </p>
                          )}
                          {post.caption && post.captionHidden && post.isOwn && (
                            <p className="text-xs italic mb-2.5" style={{ color: 'var(--text-secondary)' }}>
                              Caption hidden (only you see this note)
                            </p>
                          )}
                        </>
                      )}

                      {/* Category tags */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {post.categories.map((cat) => {
                          const meta = getCategoryMeta(cat.code, cat.label);
                          return (
                            <span
                              key={cat.categoryId}
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                              style={{ background: `${meta.hex}1f`, color: meta.hex }}
                            >
                              {meta.short}
                            </span>
                          );
                        })}
                        <span className="text-[10px] ml-auto self-center" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {!post.isOwn && post.playerActive && (
                          <Link
                            href={`/suggestions/new?subject=${post.playerId}&evidenceId=${post.id}`}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-purple-300 border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 transition"
                          >
                            <LightbulbIcon size={13} />
                            Suggest from this
                          </Link>
                        )}
                        <Link
                          href={`/messages?evidenceRef=${post.id}`}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
                        >
                          <LinkIcon size={13} />
                          Reference
                        </Link>

                        {post.isOwn && (
                          <span className="flex items-center gap-1 ml-auto">
                            {post.caption && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingId(post.id);
                                    setEditingCaption(post.caption || '');
                                  }}
                                  className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                                  title="Edit caption"
                                >
                                  <PencilIcon size={13} />
                                </button>
                                <button
                                  onClick={() => handleToggleCaption(post)}
                                  className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                                  title={post.captionHidden ? 'Show caption' : 'Hide caption (media stays up)'}
                                >
                                  {post.captionHidden ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
                                </button>
                              </>
                            )}
                            {post.suggestionCount === 0 && (
                              <button
                                onClick={() => handleDelete(post)}
                                className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                                title="Delete post"
                              >
                                <TrashIcon size={13} />
                              </button>
                            )}
                          </span>
                        )}
                        {post.suggestionCount > 0 && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-auto"
                            style={{ background: 'rgba(168,85,247,0.12)', color: 'var(--accent-purple)' }}
                            title="Cited by suggestions — can no longer be deleted"
                          >
                            cited ×{post.suggestionCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

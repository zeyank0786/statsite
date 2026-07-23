'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Avatar from './Avatar';
import { getCategoryMeta } from '@/lib/categories';
import { cldImage } from '@/lib/cloudinary';
import { EvidencePost, relativeTime } from '@/lib/evidenceTypes';
import { CardHandlers } from './EvidenceCard';
import { XIcon, LightbulbIcon, LinkIcon, PencilIcon, TrashIcon, EyeIcon, EyeOffIcon, CheckIcon } from './icons';

/** Full-size view of one evidence post, with every action in one place. */
export default function EvidenceDetailModal({
  post,
  handlers,
  onClose,
  onSaveCaption,
}: {
  post: EvidencePost;
  handlers: Omit<CardHandlers, 'onOpen' | 'onEdit'>;
  onClose: () => void;
  onSaveCaption: (id: string, caption: string) => Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.caption || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  const showCaption = post.caption && !post.captionHidden;

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border card-shadow-lg max-h-[92vh] overflow-y-auto animate-rise"
        style={{ background: '#13131b', borderColor: 'var(--surface-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center gap-2.5 px-4 py-3 border-b"
          style={{ background: '#13131b', borderColor: 'var(--surface-border)' }}
        >
          <Avatar id={post.playerId} name={post.playerName} size={30} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{post.playerName}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {relativeTime(post.createdAt)} · {new Date(post.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition">
            <XIcon size={18} />
          </button>
        </div>

        {post.mediaUrl && (
          <div className="bg-black/50">
            {post.mediaType === 'video' ? (
              <video src={post.mediaUrl} className="w-full max-h-[60vh] object-contain" controls autoPlay playsInline />
            ) : (
              <img src={cldImage(post.mediaUrl)} alt={post.caption || 'Evidence'} className="w-full max-h-[60vh] object-contain" />
            )}
          </div>
        )}

        <div className="p-4">
          {editing ? (
            <div className="mb-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="field resize-none text-sm mb-2"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setSaving(true);
                    await onSaveCaption(post.id, draft);
                    setSaving(false);
                    setEditing(false);
                  }}
                  disabled={saving}
                  className="btn-primary text-xs py-1.5"
                >
                  <CheckIcon size={13} /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(post.caption || '');
                  }}
                  className="btn-ghost text-xs py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {showCaption && (
                <p className="text-sm text-neutral-200 mb-3 whitespace-pre-wrap break-words">{post.caption}</p>
              )}
              {post.caption && post.captionHidden && post.isOwn && (
                <p className="text-xs italic mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Caption hidden (only you see this note)
                </p>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.categories.map((cat) => {
              const meta = getCategoryMeta(cat.code, cat.label);
              return (
                <span
                  key={cat.categoryId}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: `${meta.hex}1f`, color: meta.hex }}
                >
                  {meta.short} · {cat.label}
                </span>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {!post.isOwn && post.playerActive && (
              <Link
                href={`/suggestions/new?subject=${post.playerId}&evidenceId=${post.id}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-purple-300 border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 transition"
              >
                <LightbulbIcon size={13} />
                Suggest from this
              </Link>
            )}
            <Link
              href={`/messages?evidenceRef=${post.id}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-cyan-300 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
            >
              <LinkIcon size={13} />
              Reference
            </Link>

            {post.isOwn && !editing && (
              <span className="flex items-center gap-1 ml-auto">
                {post.caption && (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                      title="Edit caption"
                    >
                      <PencilIcon size={14} />
                    </button>
                    <button
                      onClick={() => handlers.onToggleCaption(post)}
                      className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                      title={post.captionHidden ? 'Show caption' : 'Hide caption (media stays up)'}
                    >
                      {post.captionHidden ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
                    </button>
                  </>
                )}
                {post.suggestionCount === 0 && (
                  <button
                    onClick={() => {
                      handlers.onDelete(post);
                      onClose();
                    }}
                    className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                    title="Delete post"
                  >
                    <TrashIcon size={14} />
                  </button>
                )}
              </span>
            )}
          </div>

          {post.suggestionCount > 0 && (
            <p
              className="text-[11px] mt-3 px-2.5 py-1.5 rounded-lg inline-block"
              style={{ background: 'rgba(168,85,247,0.12)', color: 'var(--accent-purple)' }}
            >
              Cited by {post.suggestionCount} suggestion{post.suggestionCount !== 1 ? 's' : ''} — it can no longer be
              deleted.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

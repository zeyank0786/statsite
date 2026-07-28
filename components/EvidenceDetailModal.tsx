'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Avatar from './Avatar';
import { getCategoryMeta } from '@/lib/categories';
import { cldImage } from '@/lib/cloudinary';
import { EvidencePost, FolderOption, relativeTime } from '@/lib/evidenceTypes';
import { CardHandlers } from './EvidenceCard';
import { XIcon, LightbulbIcon, LinkIcon, PencilIcon, TrashIcon, EyeIcon, EyeOffIcon, CheckIcon, PlusIcon } from './icons';

/** Full-size view of one evidence post, with every action in one place. */
export default function EvidenceDetailModal({
  post,
  handlers,
  onClose,
  onSaveCaption,
  myFolders,
  onSaveFolders,
  onCreateFolder,
}: {
  post: EvidencePost;
  handlers: Omit<CardHandlers, 'onOpen' | 'onEdit'>;
  onClose: () => void;
  onSaveCaption: (id: string, caption: string) => Promise<void>;
  myFolders: FolderOption[];
  onSaveFolders: (evidenceId: string, folderIds: string[]) => Promise<void>;
  onCreateFolder: (name: string) => Promise<FolderOption | null>;
}) {
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.caption || '');
  const [saving, setSaving] = useState(false);
  const [folderIds, setFolderIds] = useState<string[]>(post.folders.map((f) => f.id));
  const [newFolder, setNewFolder] = useState('');

  useEffect(() => setMounted(true), []);

  // Resync folder selection if a different post is shown in the same instance.
  useEffect(() => {
    setFolderIds(post.folders.map((f) => f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const toggleFolder = (id: string) => {
    const next = folderIds.includes(id) ? folderIds.filter((x) => x !== id) : [...folderIds, id];
    setFolderIds(next);
    onSaveFolders(post.id, next);
  };

  const addFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    const created = await onCreateFolder(name);
    if (created) {
      const next = [...folderIds, created.id];
      setFolderIds(next);
      onSaveFolders(post.id, next);
      setNewFolder('');
    }
  };

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

          {/* Folders */}
          {post.isOwn ? (
            <div className="mb-4 rounded-xl border p-3" style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.015)' }}>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                📁 Folders
              </p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {myFolders.map((f) => {
                  const on = folderIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFolder(f.id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                        on ? 'text-white' : 'text-neutral-400 hover:text-white'
                      }`}
                      style={{
                        borderColor: on ? 'rgba(34,211,238,0.7)' : 'var(--surface-border)',
                        background: on ? 'rgba(34,211,238,0.15)' : 'transparent',
                      }}
                    >
                      {f.name}
                      {on && <CheckIcon size={11} className="inline ml-1" />}
                    </button>
                  );
                })}
                <span className="inline-flex items-center gap-1">
                  <input
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value.slice(0, 40))}
                    onKeyDown={(e) => e.key === 'Enter' && addFolder()}
                    placeholder="New folder…"
                    className="field w-32 py-1 text-xs"
                  />
                  <button onClick={addFolder} disabled={!newFolder.trim()} className="btn-ghost py-1 px-2 text-xs">
                    <PlusIcon size={12} />
                  </button>
                </span>
              </div>
            </div>
          ) : (
            post.folders.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {post.folders.map((f) => (
                  <span
                    key={f.id}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)' }}
                  >
                    📁 {f.name}
                  </span>
                ))}
              </div>
            )
          )}

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

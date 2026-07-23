'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCategoryMeta } from '@/lib/categories';
import {
  cloudinaryConfigured,
  uploadToCloudinary,
  fileTooLargeError,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from '@/lib/cloudinary';
import { CategoryOption } from '@/lib/evidenceTypes';
import { UploadIcon, XIcon } from './icons';

/**
 * Post evidence. Lives in a modal rather than inline in your board column —
 * the composer is the same job regardless of which view you're in, and
 * inline it forced the column layout to exist.
 *
 * Portaled to <body>: the page's blurred/animated containers create CSS
 * containing blocks that trap position:fixed children.
 */
export default function EvidenceComposer({
  categories,
  onClose,
  onPosted,
  onReloadCategories,
}: {
  categories: CategoryOption[];
  onClose: () => void;
  onPosted: () => void;
  onReloadCategories: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Revoke the object URL when we're done with it
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  const pickFile = (picked: File | null) => {
    if (picked) {
      const tooLarge = fileTooLargeError(picked);
      if (tooLarge) {
        setError(tooLarge);
        return; // keep whatever was already chosen
      }
      setError('');
    }
    setFilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return picked ? URL.createObjectURL(picked) : null;
    });
    setFile(picked);
  };

  const submit = async () => {
    setError('');
    if (selectedCategoryIds.length === 0) {
      setError('Pick at least one category this evidence relates to');
      return;
    }
    if (!file && !caption.trim()) {
      setError('Add a photo/video or at least a caption');
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
        onPosted();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to post');
      }
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setPosting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border card-shadow-lg max-h-[92vh] overflow-y-auto animate-rise"
        style={{ background: '#13131b', borderColor: 'var(--surface-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-4 border-b"
          style={{ background: '#13131b', borderColor: 'var(--surface-border)' }}
        >
          <h2 className="font-display text-lg font-bold text-white">Post evidence</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition">
            <XIcon size={18} />
          </button>
        </div>

        <div className="p-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] || null)}
          />

          {filePreview && file ? (
            <div className="relative mb-4 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--surface-border)' }}>
              {file.type.startsWith('video') ? (
                <video src={filePreview} className="w-full max-h-64 object-cover" controls muted />
              ) : (
                <img src={filePreview} alt="Preview" className="w-full max-h-64 object-cover" />
              )}
              <button
                onClick={() => pickFile(null)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-black transition"
              >
                <XIcon size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!cloudinaryConfigured}
              className="w-full mb-4 py-8 rounded-xl border border-dashed flex flex-col items-center gap-1.5 text-sm transition hover:bg-white/[0.03] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--surface-border-strong)', color: 'var(--text-secondary)' }}
            >
              <UploadIcon size={22} />
              {cloudinaryConfigured ? 'Add photo or video' : 'Uploads not configured'}
              {cloudinaryConfigured && (
                <span className="text-xs opacity-70">
                  Max {Math.round(MAX_IMAGE_BYTES / 1048576)} MB image · {Math.round(MAX_VIDEO_BYTES / 1048576)} MB video
                </span>
              )}
            </button>
          )}

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption — what does this prove?"
            className="field resize-none text-sm mb-4"
            rows={3}
          />

          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
            Categories this relates to
          </p>
          {categories.length === 0 && (
            <p className="text-xs text-red-400 mb-3">
              Couldn&apos;t load the category list — posting needs at least one category.{' '}
              <button onClick={onReloadCategories} className="underline hover:text-red-300">
                Retry
              </button>
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {categories.map((cat) => {
              const meta = getCategoryMeta(cat.code, cat.label);
              const selected = selectedCategoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() =>
                    setSelectedCategoryIds(
                      selected ? selectedCategoryIds.filter((id) => id !== cat.id) : [...selectedCategoryIds, cat.id]
                    )
                  }
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide border transition ${
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

          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

          <div className="flex gap-2">
            <button onClick={submit} disabled={posting} className="btn-gradient text-sm py-2.5 flex-1">
              {posting ? 'Posting…' : 'Post evidence'}
            </button>
            <button onClick={onClose} className="btn-ghost text-sm py-2.5">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

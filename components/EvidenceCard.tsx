'use client';

import Link from 'next/link';
import Avatar from './Avatar';
import { getCategoryMeta } from '@/lib/categories';
import { getUserColorHex } from '@/lib/userColors';
import { cldImage, cldThumb, cldVideoThumb } from '@/lib/cloudinary';
import { EvidencePost, relativeTime } from '@/lib/evidenceTypes';
import { LightbulbIcon, LinkIcon, PencilIcon, TrashIcon, EyeIcon, EyeOffIcon, ImageIcon, FilmIcon } from './icons';

export interface CardHandlers {
  onOpen: (post: EvidencePost) => void;
  onEdit: (post: EvidencePost) => void;
  onToggleCaption: (post: EvidencePost) => void;
  onDelete: (post: EvidencePost) => void;
}

function CategoryTags({ post, max }: { post: EvidencePost; max?: number }) {
  const shown = max ? post.categories.slice(0, max) : post.categories;
  const rest = post.categories.length - shown.length;
  return (
    <>
      {shown.map((cat) => {
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
      {rest > 0 && (
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>
          +{rest}
        </span>
      )}
    </>
  );
}

/** Compact square tile for grid view — media-first, tap to open. */
export function EvidenceTile({ post, onOpen }: { post: EvidencePost; onOpen: (p: EvidencePost) => void }) {
  const hex = getUserColorHex(post.playerId);
  const showCaption = post.caption && !post.captionHidden;

  return (
    <button
      onClick={() => onOpen(post)}
      className="relative aspect-square rounded-xl overflow-hidden border group text-left w-full"
      style={{ borderColor: 'var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}
      title={showCaption ? post.caption! : `Evidence from ${post.playerName}`}
    >
      {post.mediaUrl ? (
        post.mediaType === 'video' ? (
          <>
            <img src={cldVideoThumb(post.mediaUrl, 400)} alt="" className="w-full h-full object-cover" loading="lazy" />
            <span className="absolute top-1.5 right-1.5 text-white/90 bg-black/50 rounded px-1">
              <FilmIcon size={12} />
            </span>
          </>
        ) : (
          <img src={cldThumb(post.mediaUrl, 400)} alt="" className="w-full h-full object-cover" loading="lazy" />
        )
      ) : (
        // Caption-only post: show the words, since there's no image to show
        <span className="absolute inset-0 p-3 flex items-center justify-center text-center">
          <span className="text-[11px] leading-snug text-neutral-300 line-clamp-5">
            {showCaption ? post.caption : <ImageIcon size={20} />}
          </span>
        </span>
      )}

      {/* Author strip */}
      <span
        className="absolute inset-x-0 bottom-0 px-2 py-1.5 flex items-center gap-1.5"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hex }} />
        <span className="text-[10px] font-semibold text-white truncate">{post.playerName}</span>
        {post.suggestionCount > 0 && (
          <span className="ml-auto text-[9px] font-bold px-1 rounded" style={{ background: 'rgba(168,85,247,0.35)', color: '#e9d5ff' }}>
            ×{post.suggestionCount}
          </span>
        )}
      </span>
    </button>
  );
}

/** Full card for feed and column views. */
export default function EvidenceCard({
  post,
  handlers,
  compact = false,
  showAuthor = true,
}: {
  post: EvidencePost;
  handlers: CardHandlers;
  compact?: boolean;
  showAuthor?: boolean;
}) {
  const hex = getUserColorHex(post.playerId);
  const showCaption = post.caption && !post.captionHidden;
  const mediaHeight = compact ? 'max-h-40' : 'max-h-72';

  return (
    <article className="glass card-shadow overflow-hidden">
      {showAuthor && (
        <div className="flex items-center gap-2.5 px-3.5 pt-3">
          <Avatar id={post.playerId} name={post.playerName} size={26} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white truncate leading-tight">{post.playerName}</span>
            <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              {relativeTime(post.createdAt)}
            </span>
          </span>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hex }} />
        </div>
      )}

      {post.mediaUrl && (
        <button onClick={() => handlers.onOpen(post)} className="block w-full bg-black/40 mt-3" title="Open">
          {post.mediaType === 'video' ? (
            <video src={post.mediaUrl} className={`w-full ${mediaHeight} object-contain`} controls playsInline />
          ) : (
            <img
              src={cldImage(post.mediaUrl)}
              alt={post.caption || 'Evidence'}
              className={`w-full ${mediaHeight} object-contain`}
              loading="lazy"
            />
          )}
        </button>
      )}

      <div className="p-3.5">
        {showCaption && (
          <p className={`text-sm text-neutral-200 mb-2.5 whitespace-pre-wrap break-words ${compact ? 'line-clamp-2' : ''}`}>
            {post.caption}
          </p>
        )}
        {post.caption && post.captionHidden && post.isOwn && (
          <p className="text-xs italic mb-2.5" style={{ color: 'var(--text-secondary)' }}>
            Caption hidden (only you see this note)
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 mb-3 items-center">
          <CategoryTags post={post} max={compact ? 3 : undefined} />
          {!showAuthor && (
            <span className="text-[10px] ml-auto" style={{ color: 'var(--text-secondary)' }}>
              {relativeTime(post.createdAt)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {!post.isOwn && post.playerActive && (
            <Link
              href={`/suggestions/new?subject=${post.playerId}&evidenceId=${post.id}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-purple-300 border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 transition"
            >
              <LightbulbIcon size={13} />
              Suggest
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
                    onClick={() => handlers.onEdit(post)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                    title="Edit caption"
                  >
                    <PencilIcon size={13} />
                  </button>
                  <button
                    onClick={() => handlers.onToggleCaption(post)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition"
                    title={post.captionHidden ? 'Show caption' : 'Hide caption (media stays up)'}
                  >
                    {post.captionHidden ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
                  </button>
                </>
              )}
              {post.suggestionCount === 0 && (
                <button
                  onClick={() => handlers.onDelete(post)}
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
  );
}

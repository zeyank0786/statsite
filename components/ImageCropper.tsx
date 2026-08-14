'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, XIcon } from './icons';
import { cldImage, parseCrop, serialiseCrop, type CropBox } from '@/lib/cloudinary';

/**
 * Pan-and-zoom crop editor for profile pictures and banners.
 *
 * The frame never moves — the image slides and scales behind it — so the
 * viewport IS the crop, and there's no "outside the selection" to dim. What
 * comes back out is the crop as fractions of the source (0–1), never a new
 * file: the full upload stays on Cloudinary and the framing is applied at
 * delivery, so the same photo can be re-framed forever without re-uploading.
 */

interface ImageCropperProps {
  /** The uncropped Cloudinary URL. */
  src: string;
  /** width / height of the crop frame — 1 for avatars, 3 for banners. */
  aspect: number;
  /** Existing crop to re-open, as "x,y,w,h". */
  initialCrop?: string | null;
  title: string;
  /** Draws a circular mask over the frame, matching how avatars render. */
  circle?: boolean;
  onCancel: () => void;
  onApply: (crop: string) => void;
}

const MAX_ZOOM = 4;

interface View {
  zoom: number;
  offset: { x: number; y: number };
}

export default function ImageCropper({
  src,
  aspect,
  initialCrop,
  title,
  circle = false,
  onCancel,
  onApply,
}: ImageCropperProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  /**
   * Only what the user has actually adjusted. Null means "still at the opening
   * framing", which is *derived* below rather than seeded into state — the
   * frame and the image both arrive asynchronously, and writing the starting
   * view from an effect would render once against a wrong one first.
   */
  const [view, setView] = useState<View | null>(null);

  const frameHeight = frameWidth / aspect;

  // Zoom 1 is "cover" — the smallest scale that leaves no empty frame. Every
  // clamp below is expressed against it, so the image can never be dragged
  // away from an edge and expose the background.
  const baseScale =
    natural && frameWidth > 0
      ? Math.max(frameWidth / natural.w, frameHeight / natural.h)
      : 1;

  const clampOffset = useCallback(
    (next: { x: number; y: number }, atScale: number) => {
      if (!natural || frameWidth === 0) return next;
      const minX = frameWidth - natural.w * atScale;
      const minY = frameHeight - natural.h * atScale;
      return {
        x: Math.min(0, Math.max(minX, next.x)),
        y: Math.min(0, Math.max(minY, next.y)),
      };
    },
    [natural, frameWidth, frameHeight]
  );

  // The opening framing: the saved crop if there is one, otherwise centred.
  const initialView = useMemo<View>(() => {
    if (!natural || frameWidth === 0) return { zoom: 1, offset: { x: 0, y: 0 } };

    const saved: CropBox | null = parseCrop(initialCrop);
    if (saved) {
      const zoom = Math.max(
        1,
        Math.min(MAX_ZOOM, frameWidth / (saved.w * natural.w) / baseScale)
      );
      const scale = baseScale * zoom;
      return {
        zoom,
        offset: clampOffset({ x: -saved.x * natural.w * scale, y: -saved.y * natural.h * scale }, scale),
      };
    }
    return {
      zoom: 1,
      offset: {
        x: (frameWidth - natural.w * baseScale) / 2,
        y: (frameHeight - natural.h * baseScale) / 2,
      },
    };
  }, [natural, frameWidth, frameHeight, baseScale, initialCrop, clampOffset]);

  const { zoom, offset } = view ?? initialView;
  const scale = baseScale * zoom;

  /** Adjust from wherever the view currently sits, seeded or not. */
  const update = useCallback(
    (fn: (current: View) => View) => setView((current) => fn(current ?? initialView)),
    [initialView]
  );

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load the source at a sane working size rather than the full upload — a
  // 12 MP phone photo would otherwise be decoded just to be dragged around.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => !cancelled && setFailed(true);
    img.src = cldImage(src, 1600);
    return () => {
      cancelled = true;
    };
  }, [src]);

  /** Zoom while holding whatever sits under `anchor` (frame px) in place. */
  const zoomAround = useCallback(
    (nextZoom: number, anchor: { x: number; y: number }) => {
      update((current) => {
        const clamped = Math.max(1, Math.min(MAX_ZOOM, nextZoom));
        if (clamped === current.zoom) return current;
        const ratio = clamped / current.zoom;
        return {
          zoom: clamped,
          offset: clampOffset(
            {
              x: anchor.x - (anchor.x - current.offset.x) * ratio,
              y: anchor.y - (anchor.y - current.offset.y) * ratio,
            },
            baseScale * clamped
          ),
        };
      });
    },
    [update, baseScale, clampOffset]
  );

  // --- Pointer handling: one pointer drags, two pinch. -----------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinchStart.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.current.values()];

    if (points.length >= 2) {
      const [a, b] = points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pinchStart.current) {
        pinchStart.current = { distance, zoom };
        return;
      }
      if (pinchStart.current.distance > 0) {
        const midpoint = localPoint({
          clientX: (a.x + b.x) / 2,
          clientY: (a.y + b.y) / 2,
        });
        zoomAround((pinchStart.current.zoom * distance) / pinchStart.current.distance, midpoint);
      }
      return;
    }

    const dx = e.clientX - previous.x;
    const dy = e.clientY - previous.y;
    update((current) => ({
      ...current,
      offset: clampOffset(
        { x: current.offset.x + dx, y: current.offset.y + dy },
        baseScale * current.zoom
      ),
    }));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  // Non-passive so the page doesn't scroll out from under a zoom gesture.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAround(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, zoomAround]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const apply = () => {
    if (!natural || frameWidth === 0) return;
    onApply(
      serialiseCrop({
        x: Math.max(0, -offset.x / scale / natural.w),
        y: Math.max(0, -offset.y / scale / natural.h),
        w: Math.min(1, frameWidth / scale / natural.w),
        h: Math.min(1, frameHeight / scale / natural.h),
      })
    );
  };

  const setZoomFromSlider = (next: number) =>
    zoomAround(next, { x: frameWidth / 2, y: frameHeight / 2 });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="glass card-shadow p-5 w-full max-w-lg">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-base font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
            aria-label="Cancel"
          >
            <XIcon size={16} />
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Drag to reposition · pinch, scroll or use the slider to zoom.
        </p>

        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          className="relative w-full overflow-hidden rounded-2xl border select-none touch-none cursor-grab active:cursor-grabbing"
          style={{
            aspectRatio: String(aspect),
            borderColor: 'var(--surface-border)',
            background: 'rgba(0,0,0,0.45)',
          }}
        >
          {failed ? (
            <p className="absolute inset-0 grid place-items-center text-xs px-4 text-center" style={{ color: 'var(--accent-yellow)' }}>
              Couldn&apos;t load that image to crop it.
            </p>
          ) : natural && frameWidth > 0 ? (
            <img
              src={cldImage(src, 1600)}
              alt=""
              draggable={false}
              className="absolute top-0 left-0 max-w-none origin-top-left pointer-events-none"
              style={{
                width: natural.w,
                height: natural.h,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            />
          ) : (
            <div className="absolute inset-0 animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
          )}

          {/* Framing aids: rule-of-thirds, plus the round mask for avatars so
              people can see what actually survives the circle. */}
          <div className="absolute inset-0 pointer-events-none">
            {circle && (
              <div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
              />
            )}
            {[33.333, 66.666].map((p) => (
              <span key={`v${p}`} className="absolute top-0 bottom-0 w-px" style={{ left: `${p}%`, background: 'rgba(255,255,255,0.18)' }} />
            ))}
            {[33.333, 66.666].map((p) => (
              <span key={`h${p}`} className="absolute left-0 right-0 h-px" style={{ top: `${p}%`, background: 'rgba(255,255,255,0.18)' }} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
            Zoom
          </span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomFromSlider(Number(e.target.value))}
            disabled={!natural}
            className="w-full accent-cyan-400"
            aria-label="Zoom"
          />
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1 justify-center text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!natural || failed}
            className="btn-gradient flex-1 justify-center text-sm disabled:opacity-50"
          >
            <CheckIcon size={15} />
            Apply crop
          </button>
        </div>
      </div>
    </div>
  );
}

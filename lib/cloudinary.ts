/**
 * Client-side Cloudinary unsigned upload.
 *
 * Requires two public env vars (inlined at build time):
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    — your cloud name (dashboard home)
 *   NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET — an UNSIGNED upload preset
 *
 * Size/duration caps are enforced by the preset itself (incoming
 * transformations + max file size), so nothing here trusts the client.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export const cloudinaryConfigured = Boolean(CLOUD_NAME && UPLOAD_PRESET);

/**
 * Client-side size caps (bytes). Enforced in the browser before we waste
 * time/bandwidth uploading, so the user gets an instant, friendly error
 * instead of a slow failed upload. Tweak these here — no Cloudinary UI needed.
 * (Cloudinary's plan/preset limits are still the ultimate backstop.)
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; //  10 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

/** Returns a human-readable error if the file is too big, else null. */
export function fileTooLargeError(file: File): string | null {
  const isVideo = file.type.startsWith('video/');
  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size <= limit) return null;
  const mb = (n: number) => Math.round(n / (1024 * 1024));
  return `That ${isVideo ? 'video' : 'image'} is ${mb(file.size)} MB — max is ${mb(limit)} MB. ${
    isVideo ? 'Try a shorter clip.' : 'Try a lower-resolution photo.'
  }`;
}

/**
 * Delivery-time transforms, inserted into the URL after "/upload/". These
 * are generated on first request and cached from then on — unlike
 * incoming/eager transforms (applied during the upload call itself), they
 * never hit Cloudinary's "too large to process synchronously" limit. This
 * is why optimization happens here, at render time, and NOT via an incoming
 * transformation on the upload preset (see CLOUDINARY-SETUP.md).
 */
function insertTransform(url: string, transform: string): string {
  const marker = '/upload/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const insertAt = i + marker.length;
  return url.slice(0, insertAt) + transform + '/' + url.slice(insertAt);
}

/**
 * A crop rectangle as fractions of the source image (0–1), so it survives the
 * original being re-encoded or served at any size. Stored on the profile rather
 * than baked into the file: the full upload is kept, the crop is applied at
 * delivery, and re-adjusting it later never needs the photo again.
 */
export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** "x,y,w,h" → a crop box, or null if it isn't four sane numbers. */
export function parseCrop(value: string | null | undefined): CropBox | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts;
  // A zero-size box would render nothing — treat it as "no crop" instead.
  if (w <= 0 || h <= 0) return null;
  return {
    x: clamp01(x),
    y: clamp01(y),
    // Cloudinary reads a relative dimension of exactly 1 as ONE PIXEL, not
    // 100% — so a full-frame crop has to stop just short of the edge.
    w: Math.min(0.9999, Math.max(0.01, w)),
    h: Math.min(0.9999, Math.max(0.01, h)),
  };
}

export function serialiseCrop(box: CropBox): string {
  return [box.x, box.y, box.w, box.h].map((n) => round4(n)).join(',');
}

/** Leading `c_crop` component (with trailing slash), or '' when uncropped. */
function cropPrefix(crop: CropBox | string | null | undefined): string {
  const box = typeof crop === 'string' || crop == null ? parseCrop(crop) : crop;
  if (!box) return '';
  const n = (v: number) => round4(v).toFixed(4);
  return `c_crop,x_${n(box.x)},y_${n(box.y)},w_${n(box.w)},h_${n(box.h)}/`;
}

/** Full-size optimized image (evidence board posts, lightboxes). */
export function cldImage(url: string, maxSize = 1600, crop?: CropBox | string | null): string {
  return insertTransform(url, `${cropPrefix(crop)}c_limit,w_${maxSize},h_${maxSize},q_auto,f_auto`);
}

/** Small square image thumbnail (grids, lists). */
export function cldThumb(url: string, size = 96, crop?: CropBox | string | null): string {
  return insertTransform(url, `${cropPrefix(crop)}c_fill,w_${size},h_${size},q_auto,f_auto`);
}

/** Banners are cropped 3:1 everywhere they're shown; avatars 1:1. */
export const BANNER_ASPECT = 3;
export const AVATAR_ASPECT = 1;

/**
 * Wide image at a fixed aspect — banners. The player's crop decides what's in
 * frame; `c_fill` then squeezes that region into the slot it's rendered in.
 */
export function cldBanner(
  url: string,
  width = 1200,
  crop?: CropBox | string | null,
  aspect = BANNER_ASPECT
): string {
  const height = Math.round(width / aspect);
  return insertTransform(url, `${cropPrefix(crop)}c_fill,w_${width},h_${height},q_auto,f_auto`);
}

/**
 * Still-frame JPG of a video, sized as a thumbnail — for small preview
 * slots where loading/seeking a whole video just to show an icon would be
 * wasteful. Swapping the extension to .jpg on a /video/upload/ URL tells
 * Cloudinary to hand back a frame instead of the video itself.
 */
export function cldVideoThumb(url: string, size = 96): string {
  const withTransform = insertTransform(url, `c_fill,w_${size},h_${size},q_auto,f_auto`);
  return withTransform.replace(/\.\w+($|\?)/, '.jpg$1');
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  mediaType: 'image' | 'video';
}

export async function uploadToCloudinary(file: File): Promise<CloudinaryUploadResult> {
  if (!cloudinaryConfigured) {
    throw new Error('Cloudinary is not configured yet (missing NEXT_PUBLIC_CLOUDINARY_* env vars)');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET as string);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let message = 'Upload failed';
    try {
      const err = await res.json();
      message = err?.error?.message || message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }

  const data = await res.json();
  return {
    url: String(data.secure_url),
    publicId: String(data.public_id),
    mediaType: data.resource_type === 'video' ? 'video' : 'image',
  };
}

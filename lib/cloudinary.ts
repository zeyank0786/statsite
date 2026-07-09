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

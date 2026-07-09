import crypto from 'crypto';

/**
 * Server-side Cloudinary asset deletion (frees storage when an evidence post
 * is deleted). Uses the signed destroy endpoint, so it needs two SERVER env
 * vars (Cloudinary dashboard → same page as the cloud name):
 *
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Without them this is a graceful no-op — the DB delete still goes through,
 * the asset just stays in Cloudinary.
 */
export async function destroyCloudinaryAsset(
  publicId: string,
  mediaType: string | null
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret || !publicId) {
    return { ok: false, skipped: true };
  }

  const resourceType = mediaType === 'video' ? 'video' : 'image';
  const timestamp = Math.floor(Date.now() / 1000);
  // Signature = sha1 of the alphabetically-sorted params + secret
  const signature = crypto
    .createHash('sha1')
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  try {
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: apiKey,
      signature,
    });
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
      { method: 'POST', body }
    );
    const data = await res.json().catch(() => ({}));
    // Cloudinary returns { result: "ok" } on success, { result: "not found" } if already gone
    if (res.ok && (data.result === 'ok' || data.result === 'not found')) {
      return { ok: true };
    }
    return { ok: false, error: data.result || data.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

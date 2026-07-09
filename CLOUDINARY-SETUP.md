# Cloudinary setup for the Evidence Board (~5 minutes)

Uploads go straight from the browser to Cloudinary using an **unsigned upload
preset**. The preset itself enforces the size/duration caps, so nobody has to
manually keep files small. Until you do this, the evidence board works in
caption-only mode.

## 1. Create the account
1. Go to https://cloudinary.com and sign up (free tier — 25 GB storage/bandwidth per month, way more than enough).
2. After signup, on the **Dashboard** page, note your **Cloud name** (e.g. `dk3xxxxxx`).

## 2. Create the unsigned upload preset
1. Left sidebar → **Settings** (gear icon) → **Upload** tab.
2. Scroll to **Upload presets** → **Add upload preset**.
3. Set:
   - **Preset name**: `4ward-evidence` (or anything — you'll copy it into the env var)
   - **Signing mode**: **Unsigned** ← the important one
   - **Folder**: `4ward` (optional, keeps the media library tidy)
4. Under the preset's **Transformations → Incoming transformation**, click *Edit* and paste this raw transformation:
   ```
   c_limit,w_1600,h_1600,q_auto:good
   ```
   This auto-shrinks big photos on upload (max 1600px, compressed) so a phone
   photo lands around 200–400 KB instead of 8 MB.
5. Under **Upload control** (same preset page):
   - **Max file size**: `10000000` (10 MB — this is the pre-compression limit; videos need headroom)
   - **Max video duration**: `20` (seconds) — if your plan/UI shows it under *Media analysis / video limits*; if the field isn't there, the incoming transformation below covers practical size.
6. Save the preset.

> Videos: the free tier auto-transcodes; with `q_auto` delivery they stream
> compressed. The app also requests `resource_type=auto` so images and videos
> both work through the same preset.

## 3. Wire it into the app
Add to `stats-app/.env` (local) **and** your hosting env vars (Vercel → Project → Settings → Environment Variables):

```
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name_here
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=4ward-evidence
```

### Optional but recommended: auto-delete assets (saves storage)
When someone deletes an evidence post, the app can also delete the photo/video
from Cloudinary. That needs the **API key + secret** from the same dashboard
page as your cloud name (Dashboard → "API Keys"):

```
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

These are server-side secrets (no `NEXT_PUBLIC_` prefix — never expose them to
the browser). Without them everything still works; deleted posts just leave
their media behind in Cloudinary.

> File size limits are enforced by the app itself (10 MB images / 100 MB
> videos, `lib/cloudinary.ts`) — you can skip the preset's max-file-size
> setting entirely.

Redeploy (these are build-time variables). The "uploads not configured" banner
on the evidence board disappears and the photo/video picker goes live.

## 4. Test
Post something on your own evidence column with a photo. If Cloudinary rejects
it you'll see its error message inline in the composer (e.g. file too large).

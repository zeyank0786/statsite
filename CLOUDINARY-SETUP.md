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
4. Leave **Transformations → Incoming transformation** empty. Do **not** put a
   resize/compress transformation there — see the warning below.
5. Save the preset.

> **Don't set an incoming transformation.** It sounded like a good idea
> (auto-shrink photos on upload) but Cloudinary processes incoming
> transformations *synchronously*, during the upload call itself — and for
> anything but a short video that's too slow, so Cloudinary rejects it with
> "video too large to process synchronously, please use eager transformation
> with eager_async = true". If your preset currently has one set (from an
> earlier version of this guide), open it and clear that field — this fixes
> video uploads immediately, no code change or redeploy needed.
>
> Compression instead happens **at delivery time** (`lib/cloudinary.ts` —
> `cldImage`/`cldThumb`/`cldVideoThumb`), which Cloudinary generates on first
> view and caches from then on. It never hits this synchronous limit, works
> for both images and videos, and needs zero preset configuration.

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

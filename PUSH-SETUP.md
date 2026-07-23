# Push notifications setup (~2 minutes)

Everything is built. The only outstanding step is pasting two keys into Vercel.

> Instructions to send the crew live in **CREW-INSTRUCTIONS.md** — plain-text,
> copy/paste straight into the group chat, covers iPhone and Android.

## 1. Add the VAPID keys to Vercel

Vercel → your project → **Settings** → **Environment Variables**. Add all three
(Production, Preview and Development):

```
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:itzzedk@gmail.com
CRON_SECRET=<random string>
```

> ⚠️ **Never paste the real values into this file, or any other tracked file.**
> This repo is public. The live values belong in exactly two places: Vercel's
> environment variables, and your local `stats-app/.env` (which is gitignored).

To generate a fresh set locally:

```bash
# VAPID keypair
npx web-push generate-vapid-keys

# CRON_SECRET (any random string works)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

`CRON_SECRET` protects the daily vote-reminder job — Vercel sends it
automatically as a bearer token on scheduled runs, and the endpoint returns
401 to anyone else. Without it set, the job still runs but anyone who knows
the URL could trigger it (worst case: a duplicate reminder).

**If the VAPID keys are ever rotated, everyone must re-enable notifications.**
Push subscriptions are cryptographically bound to the public key they were
created with, so old subscriptions stop working. The server prunes them
automatically as they fail; each person just re-runs step 3.

Then **redeploy** (env changes only take effect on a new deployment).

> `VAPID_PRIVATE_KEY` is a secret — it's what proves pushes genuinely come from
> 4WARD. Never expose it to the browser (note there's no `NEXT_PUBLIC_` prefix).
> The public key is served to clients at runtime by `/api/push`.
>
> These keys are already in `stats-app/.env` for local dev. That file is
> gitignored, so they are **not** in the repo.

Until this is done nothing breaks — the app behaves exactly as before, and the
Settings page honestly says push isn't switched on yet.

## 2. Everyone installs the app to their home screen

**On iPhone, push only works for home-screen installs — never in a Safari tab.**

Each person: open 4WARD in Safari → Share button → **Add to Home Screen** →
open it from the new icon.

Anyone who already had it added before the PWA update should **delete and
re-add** it, so iOS picks up the new manifest. Note this signs them out (a
home-screen web app has its own isolated storage), so they'll log in again.

## 3. Turn notifications on

In the app: **Settings** → **Notifications** → *Turn on notifications* → Allow.
Then hit **Send test** to confirm one actually lands.

This is per-device — enabling it on a phone doesn't enable it on a laptop.

## What sends a notification

| Event | Who gets it |
| --- | --- |
| A suggestion needs your vote | Everyone eligible to vote (one push per batch, not per stat) |
| Your stat changed after an approved suggestion | The subject |
| You crossed a tier (e.g. into Elite) | The subject, with a louder headline |
| Someone posted evidence | Everyone except the poster |
| Someone nudges you | The person nudged |
| A suggestion has sat unvoted 48h+ | Whoever still owes a vote — one daily push listing the count, never one per suggestion |

Tapping a notification opens the relevant page, focusing the app if it's
already open.

## Troubleshooting

**"Add 4WARD to your home screen first"** — you're in a Safari tab. iOS can't do
push there; install it first.

**Notifications stopped arriving.** iOS discards push subscriptions when an app
is deleted, or sometimes after long disuse. The server prunes dead
subscriptions automatically, so just go to Settings and turn notifications on
again.

**Nothing happens on "Send test".** Check the keys are in Vercel *and* that
you've redeployed since adding them.

**"Notifications are blocked"** — permission was denied at the OS level. On
iPhone: Settings → Notifications → 4WARD → Allow Notifications.

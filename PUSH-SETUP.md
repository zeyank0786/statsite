# Push notifications setup (~2 minutes)

Everything is built. The only outstanding step is pasting two keys into Vercel.

## 1. Add the VAPID keys to Vercel

Vercel → your project → **Settings** → **Environment Variables**. Add all three
(Production, Preview and Development):

```
VAPID_PUBLIC_KEY=BCABrj1xsQpTCwMCTqyjfYXptYxo0uRQ3wXzfF_FcIOH_A3c3nxkZkwjmMwmiLHRIbe8cM36pVS8ryC3AaVi5S8
VAPID_PRIVATE_KEY=09_eAy3IAU3_uyvhWNTPf6AN5KNQoOUNDFRvSwt8Mes
VAPID_SUBJECT=mailto:itzzedk@gmail.com
```

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

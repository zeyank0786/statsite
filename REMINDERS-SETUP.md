# Custom Reminders — one-time setup

Reminders (Settings → Custom reminders, or the **Reminders** tab) let anyone
schedule their own push notifications: every day at a time, on certain weekdays,
monthly, or a one-off. Admins can also set reminders for other people.

Everything is already built and deployed. The **only** thing that needs setting
up is a free "pinger" that pokes the app every ~15 minutes so time-of-day
reminders actually fire on time.

> **Check first: Admin → Schedules.** That tab reports whether each scheduled
> job is actually running, when it last ran, and — most usefully — *who called
> it*. If the reminder pinger shows "Not running", or shows "Running" with a
> last caller of `vercel-cron`, then the 15-minute pinger is dead and reminders
> are landing on the once-a-day backstop instead of at their set time. That is
> the symptom this whole document exists to fix.

## Why this is needed

The reminder-firing endpoint is `/api/cron/reminders`. Something has to call it
regularly. Vercel's Hobby plan only allows a cron that runs **once a day**, which
can't deliver a 4pm reminder at 4pm. So we point a free external scheduler at the
endpoint every 15 minutes. (The daily Vercel cron also runs it once a day as a
backstop, so reminders still work even if the pinger is down — just not on time.)

Accuracy = the pinger's interval. Every 15 min → reminders land within ~15 min of
their time. That's plenty for "remind me at 4pm".

## The endpoint

```
GET https://<your-domain>/api/cron/reminders
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` is the same secret already set in Vercel's environment variables.
If a header is awkward, the secret can instead go in the query string:

```
GET https://<your-domain>/api/cron/reminders?secret=<CRON_SECRET>
```

> ⚠️ This repo is **public**. Never paste the real `CRON_SECRET` into any file you
> commit (workflow files, this doc, anything). It lives only in Vercel's env vars
> and, for option B below, in a GitHub Actions secret.

## Option A — cron-job.org (easiest, no code)

1. Make a free account at https://cron-job.org.
2. **Create cronjob**:
   - **URL:** `https://<your-domain>/api/cron/reminders`
   - **Schedule:** every 15 minutes.
   - **Advanced → Headers:** add `Authorization` = `Bearer <CRON_SECRET>`
     (or skip headers and use `...?secret=<CRON_SECRET>` in the URL instead).
3. Save. Use "Test run" — you should get `{"ok":true,...}`.

That's it. You can delete a cronjob any time to turn the pinger off.

## Option B — GitHub Actions (already written, lives in the repo)

The workflow now exists at **`.github/workflows/cron-pinger.yml`** — nothing to
write. Because the repo is public, the secrets **must** be repository secrets,
never inline in the workflow.

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CRON_SECRET` → the same secret as in Vercel.
   - `APP_URL` → your production origin, e.g. `https://example.vercel.app`.
2. Actions tab → **Cron pinger** → **Run workflow** to test it immediately.

The workflow fails loudly on a 401 or 500 rather than showing a green tick over
a reminder that never fired, so a broken secret is visible in the Actions tab.

> Two caveats. GitHub only runs scheduled workflows from the repository's
> **default branch**, so the file has to be on that branch to fire at all. And
> scheduled Actions are best-effort: they can run several minutes late and pause
> on repos with no activity for 60 days. cron-job.org is more punctual, but it
> can also disable itself after a run of failures — which is exactly what an
> outage produces. Running both is fine; firing twice is a no-op.

## Testing it works

Fastest check of all: **Admin → Schedules**. Within 15 minutes of a working
pinger, the reminder job reads "Running" with a last caller of `github-actions`
or `cron-job.org`.

- Set a reminder for yourself 1–2 minutes from now (make sure push is enabled on
  the device — Settings → notifications, and on iPhone the site must be added to
  the Home Screen).
- Trigger the endpoint once manually (cron-job.org "Test run", the Action's
  "Run workflow" button, or just wait for the next 15-min tick).
- You should get the push, and it shows up in the notification bell too.

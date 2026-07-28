# Custom Reminders — one-time setup

Reminders (Settings → Custom reminders, or the **Reminders** tab) let anyone
schedule their own push notifications: every day at a time, on certain weekdays,
monthly, or a one-off. Admins can also set reminders for other people.

Everything is already built and deployed. The **only** thing that needs setting
up is a free "pinger" that pokes the app every ~15 minutes so time-of-day
reminders actually fire on time.

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

## Option B — GitHub Actions (free, lives in the repo)

Because the repo is public, the secret **must** be a repository secret, never
inline in the workflow.

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `CRON_SECRET`  → value: the same secret as in Vercel.
   - (Optional) `APP_URL` → your production URL.
2. Add `.github/workflows/reminders.yml`:

```yaml
name: Fire reminders
on:
  schedule:
    - cron: '*/15 * * * *' # every 15 minutes (UTC)
  workflow_dispatch: {}
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Hit reminder cron
        run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.APP_URL || 'https://<your-domain>' }}/api/cron/reminders"
```

> Note: GitHub's scheduled Actions are best-effort and can run several minutes
> late (and pause on repos with no activity for 60 days). cron-job.org is more
> punctual — Option A is recommended.

## Testing it works

- Set a reminder for yourself 1–2 minutes from now (make sure push is enabled on
  the device — Settings → notifications, and on iPhone the site must be added to
  the Home Screen).
- Trigger the endpoint once manually (cron-job.org "Test run", the Action's
  "Run workflow" button, or just wait for the next 15-min tick).
- You should get the push, and it shows up in the notification bell too.

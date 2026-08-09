# Changelog

Changes the crew has **not** been told about yet. New entries go here.

When an announcement goes out, move those sections into
[CHANGELOG-ANNOUNCED.md](./CHANGELOG-ANNOUNCED.md) under a dated heading. This
file should always answer one question at a glance: what still needs telling?

---

## Automatic stats, a calmer surface, and a catalog fix — 9 August 2026

### ⚡ Automations — stats that change themselves

New `/automations` page (More menu and ⌘K). A rule is a standing
*entitlement*: while you qualify, its deltas land on your stats on a schedule,
and when you're removed you keep everything already earned.

- **Applies directly, no vote.** Approving the rule is the approval — re-voting
  the same recurring change every week is busywork. Every application still
  lands in history with `source = 'automation'`, next to suggestion- and
  review-sourced changes.
- **Per-stat deltas, negatives allowed** (±1 / ±2), so one rule can reward and
  penalise at once.
- **Cadences:** daily, weekly, monthly, or every N days, with start and optional
  end dates, plus a per-rule *apply the first change straight away*.
- **Admin picks who qualifies.** Adding someone is "you now qualify for X";
  removing them is "you are disqualified from X". Both push.
- **Requests.** Anyone can ask to join a rule or propose a whole new one; both
  land in the admin's queue, and the requester is told either way.
- **Pause, edit, delete** — none of which touch applied history. Resuming
  **skips** whatever was missed rather than paying arrears: at most one cycle
  fires per person per run, and the next slot is computed from *now*. That also
  makes a cron outage harmless.
- Runs off the existing daily Vercel cron; `/api/cron/automations` exists for an
  external pinger if changes should land earlier in the day. Firing twice a day
  is a no-op.

### 🐛 Deleting a stat or category no longer fails

"Catalog action failed" was a missing table. Only the `Target` delete was
wrapped against tables that exist in some environments and not others (most are
created lazily on first use) — every other statement would 500 the whole action
if its table was absent. Reproduced by dropping `StatVisibility` from a copy of
the DB: the old code fails with exactly that error, the new code succeeds.

Deleting a stat now also clears references it used to leave dangling —
`StatNote`, `CommitmentStat`, `CommitmentOriginalStat`, and `SuggestionPreset`
(a JSON blob, so it's rewritten, and a preset left empty is dropped). An
ambition keeps its `statLabel` prose and only has its dead `statId` nulled.

Failures from the admin catalog route now carry the real reason in production.
Safe because the route already rejects non-admins — see `adminErrorPayload`.

### 🔦 The cursor flashlight is gone

The spotlight that tracked the pointer across every glass card has been removed.
Card tilt, the hover border and the achievement holo foil are untouched.

---

## Search, speed and a floor under the app — 7 August 2026

One release covering a user-facing addition and a batch of foundation work.
Only the first item is worth telling the crew about; the rest is invisible
when it works.

### ⌘K — search everything

The app had **no search anywhere**, while carrying ~20 destinations split
across a desktop dropdown and a separate mobile sheet, plus 70 stats whose
detail pages were effectively unreachable without knowing the URL.

`components/CommandPalette.tsx` is the flat index over all of it: pages,
players, all 70 stats, and verbs (*Post evidence*, *New suggestion*, *New
commitment*, *Start a review session*, *Set your targets*, *Sign out*).

- **⌘K / Ctrl+K** on desktop, a **search button in the header** everywhere,
  **long-press the mobile "More" tab**, and a *Search everything* row inside
  the More sheet — the gesture isn't discoverable on its own, so it has a
  visible twin in all three places.
- Fuzzy matching (`lib/fuzzy.ts`) is a ~60-line subsequence scorer, no
  dependency and no index: the corpus is under 100 entries, so ranking on
  every keystroke is nowhere near the cost where anything cleverer would pay
  for itself. Scoring favours consecutive runs, then word starts, then
  earlier positions, with an exact-prefix bonus.
- Results are grouped and capped per group (`Stats` at 8) so 70 stats can't
  bury the six pages. With an empty query, Players and Stats are hidden
  entirely — a bare list of 70 stats is noise until you've typed.
- Stats open on **your** profile, since that's the copy you can act on.
- Players and the stat catalogue load once, lazily, on first open.
  New endpoint: `GET /api/stats/catalog` — read-only, any signed-in member
  (distinct from the admin-gated `/api/admin/catalog`).

### The three most-visited pages now render on the server

Dashboard, Leaderboard and Players were client components that booted, waited
for the session to resolve, *then* fetched — so the most-visited screens in the
app showed a skeleton for a full round trip after JS had already loaded. They
now fetch during the request and ship the numbers inside the HTML.

They also call `getLeaderboard()` / `getDashboardData()` **directly** rather
than making an HTTP request to our own API, so the hop is gone entirely.

Two extractions made that possible without duplicating logic — the route
handlers are now thin wrappers over the same functions:

- `lib/leaderboard.ts` — the board, previously inline in the route
- `lib/trends.ts` — the overall-score timeline, previously inline in the route
- `lib/dashboard.ts` — assembles only the subset the dashboard actually shows

**The trap worth recording.** Per-user colours live in a module map populated
by `setKnownRoster`, which only ever ran in a *client effect*. Server-render a
page with avatars in it and the SSR pass computes fallback hash colours while
hydration computes the assigned ones — and because client components render in
a different module graph from server components, registering the roster
server-side does **not** reach the copy `Avatar` uses. The fix is
`AppShell rosterIds={…}`: server pages pass the roster down, and AppShell
registers it *during render* rather than in an effect, so both passes agree.
It must be the same set the client would have fetched (all players, archived
included) or every avatar silently shifts colour on mount.

### Polling: one request instead of five, and none at all when hidden

Baseline traffic was ~16 requests/minute per open tab before a page added its
own — the shell polled three endpoints every 15s, with the bell and ticker on
separate timers. `/messages` took it to ~28/min; `/reviews` polled **every
second**, and none of it checked whether anyone was looking.

- **`GET /api/pulse`** returns all three badge counts in one round trip.
- **`lib/usePoll.ts`** pauses while `document.visibilityState` is hidden and
  fires once on return, so coming back to a tab shows fresh data instead of
  waiting out the rest of an interval. Every `setInterval` in the app now goes
  through it — there are no bare ones left.
- Cadences are unchanged; a backgrounded tab simply stops costing anything.

`/api/pulse` computes each count in isolation. Consolidating three endpoints
into one otherwise means a single failure — a table that doesn't exist yet on
a given deployment — takes down *every* badge at once, where before it only
broke its own. A count that can't be computed reads 0.

### The leaderboard is cached for 60s

It recomputed every player's aggregates, all 49 achievements, social counts and
streaks on **every** request, and produced an identical answer for every
viewer. Now `unstable_cache` with a 60s TTL and a `crew-stats` tag.

Measured locally: **592ms cold → 35ms warm.**

`invalidateStatsCache()` fires at every one of the 7 `StatHistory` write sites
— every stat change records history, so those are exactly the points where the
board goes stale. Verified end-to-end: a stat write moved the cached overall
from 56 → 69.6 on the very next read.

It uses `revalidateTag(tag, { expire: 0 })`, deliberately *not* the recommended
`'max'` profile. `'max'` is stale-while-revalidate — the next reader gets the
old board while a fresh one builds behind them, so whoever just approved a
suggestion would watch their own change fail to appear. (`updateTag` does this
natively but is Server Actions only; these calls come from route handlers.)

`use cache` was the other option and was rejected: it requires the app-wide
`cacheComponents` flag, which changes the rendering model for every route in
the app to buy caching on one.

### A floor under the whole thing

**Error boundaries.** There were none — anywhere. Any thrown render error gave
a dead screen with no way back, which on a phone is indistinguishable from the
app being down. Added `app/error.tsx` (keeps the shell, offers retry, shows the
digest), `app/global-error.tsx` (catches failures in the root layout itself —
ships its own `<html>`/`<body>` and is styled entirely inline, because
`globals.css` may be exactly what failed), and `app/not-found.tsx`.

Note for future work: Next 16 renamed the retry prop — it's `unstable_retry`,
not `reset`.

**Stopped leaking exception text to the browser.** 108 call sites across 67
route files returned `{ error: '…', details: error.message }` — raw SQL
fragments and driver internals, in a public repo. All now go through
`errorPayload()`, which attaches the detail only outside production. The full
error still hits the server log at every site; only what crosses the wire
changed.

**96 tests, from zero.** Vitest over the pure functions where a silent
regression would change everyone's numbers and nobody would notice: scoring,
tier ladder, radar normalisation, streak weeks, season maths, player
aggregates, and the achievement predicates.

The one worth keeping: a property test that the **no-tanking invariant**
holds — lowering a stat can never turn an unearned achievement into an earned
one, walking the whole tier ladder (5 → 200) and asserting nothing is ever
revoked or gained by dropping. That rule is load-bearing (it's why *Comeback
Story* was removed) and nothing enforced it until now.

Two tests failed first time and were **right to**: crew-relative awards are
deliberately withheld from a solo player, and *Podium* needs a crew larger
than the podium. Both now pinned by tests.

Ran: `npm test` (96 passing), `tsc --noEmit` clean, `next build` clean, and a
signed-in smoke test confirming real data in the server-rendered HTML.

---

_Everything through 7 August 2026 has been announced._

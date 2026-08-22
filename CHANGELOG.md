# Changelog

Changes the crew has **not** been told about yet. New entries go here.

When an announcement goes out, move those sections into
[CHANGELOG-ANNOUNCED.md](./CHANGELOG-ANNOUNCED.md) under a dated heading. This
file should always answer one question at a glance: what still needs telling?

---

## The practice range — 22 August 2026

The Training Facility now has two halves, and they work on opposite principles.

**Ranked drills** are what was already there: eleven games that keep records, a
leaderboard each, and a run good enough to be worth a stat change that a
crewmate can turn into a suggestion.

**The practice range** is ten new drills that record absolutely nothing. No
score, no board, no crew record, not even a personal best. The reason for the
split is that a leaderboard turns every attempt into a performance, and that is
the wrong setting for actually getting better at something — nobody learns a
memory technique while worrying where the attempt lands on a board.

Five are memory drills, five are not:

- **Spatial Memory** — cells flash all at once, tap them back. No order to lean
  on, so you have to hold the shape rather than a sequence.
- **Kim's Game** — study a tray, then say what was taken off it. The options mix
  what went with objects that were never there, so scanning what is left tells
  you nothing.
- **Digit Span** — digits one at a time, typed back. From level 11 they come
  back in reverse, which is a different skill rather than a harder one.
- **Card Pairs** — matching, with turns used reported against the perfect
  number. That gap is how much of what you saw you actually kept.
- **Word List** — memorise a list, find it among decoys. Past level 11 the
  decoys share the studied words' themes, so nothing can be ruled out on feel.
- **Mental Rotation** — same shape turned, or its mirror image?
- **Logic Grid** — a race and a handful of clues, with exactly one order that
  fits. Every puzzle is brute-forced before you see it, so there is never a
  second valid answer.
- **Estimation** — dots flash too fast to count. Close enough counts, and the
  tolerance tightens from 25% down to 6%.
- **Anagrams** — one scrambled word at a time, hints one letter at a time.
- **Pattern Matrix** — nine squares, one missing, rules running across and down.

Every one has a **1–20 difficulty slider** you set yourself — no adaptive ramp,
because the point of a practice range is to drill the level you chose. Where you
left the slider is remembered in your own browser, and it is the only thing that
survives closing the tab. Each drill also gets the same tap-through visual
walkthrough the ranked drills have.

Because nothing is recorded, nothing is fetched or written: the whole tab is
client-side, it costs the database nothing however much anyone plays, and a
player locked out of the ranked drills can still practise.

---

## Knowing whether the scheduled jobs are running — 22 August 2026

Reminders arriving at the wrong time of day had an invisible cause. Several
things only happen because something outside the app pokes an endpoint on a
schedule — reminders firing at their set time, commitment sweeps, automations,
stale-suggestion expiry, the Season Wrapped rollover — and when that stops,
nothing errors. The work simply never happens. During the database outage the
endpoints returned errors for long enough that an external scheduler would have
disabled the job, and nothing in the app noticed or said so.

Every cron run now stamps a row recording when it ran, whether it succeeded, and
**who called it**. That last field is the one that answers the question: if the
reminder endpoint is only ever hit by Vercel's own once-a-day cron, the
15-minute pinger is dead and reminders are landing on the daily backstop instead
of on time.

Admin → **Schedules** shows all of it: each job's state, when it last ran, its
last caller, and what silently stops working when it stops. A dead pinger now
says so in plain words instead of being something you eventually notice.

There is also a GitHub Actions workflow in the repo now
(`.github/workflows/cron-pinger.yml`) that hits the reminder endpoint every 15
minutes for free. It needs two repository secrets and nothing else, and unlike a
third-party scheduler it cannot quietly disable itself.

---

## Lockouts that actually hold — 18 August 2026

Feature lockouts were a list of named things a player couldn't do, and that
list had one structural problem: a feature shipped *after* the list was written
wasn't on it. So every new feature quietly arrived unlocked for accounts the
admin had barred from everything else. Ambitions, group goals, training drills,
automations and evidence folders were all reachable by a "locked" account.

There are now two account-level switches, above the per-feature ones:

- **Locked out of everything** — they can view the whole app and change nothing.
- **No access at all** — every page shows a lockout screen instead.

The important part is *how* they're enforced. Rather than naming features, they
block by request type at the front door (`proxy.ts`), so a feature added next
month is covered the moment it exists, with no code change. The per-feature
toggles remain for finer control, and five missing ones were added
(ambitions, group goals, training, automations, folders).

A locked account can still do a short, deliberate list of things that affect
nobody else: view everything, clear its own notifications and unread badges,
manage its own reminders, and stay subscribed to push — which is how they'll
hear when the lock lifts. That list is shown to them, plainly, on the lockout
banner and screen, so "what am I still allowed to do?" has an answer on the
page rather than by trial and error.

They also now get a **notification** when a lock is applied or lifted, with the
admin's reason. Being silently unable to do anything, with no idea why, was the
worst version of this.

Two smaller things: "Clear all lockouts" now really does clear everything
(it used to clear only the features that existed when the button was written),
and an admin can no longer lock their own account — there'd be no way back in
to undo it.

---

## Search, multi-add, scroll lock, home avatar — and a 92% database cut — 18 August 2026

Four things the crew will notice, and one they won't but the bill will.

**Search every stat list.** One shared picker now backs the suggest flow, "add
stats they missed" and the stat reference, with fuzzy search over label, code
and category. Type `disc` for Discipline, `mtl` to narrow to Mentality. With
the box empty it still shows the familiar category grouping.

**Add several missed stats at once, each with its own value.** Adding a stat a
proposer missed used to be one stat per trip through the panel with a single
+/-. Pick as many as apply and set each one's value independently — one moment
usually demonstrates more than one thing.

**Training drills lock the page.** A stray swipe or space bar used to scroll
the page behind a running drill, which on a timed game costs the attempt. The
board keeps its own scrolling; the page behind it is frozen until you're done.

**Your face on your own dashboard.** The greeting names you — now it shows you
too, linked to your profile.

### The database work

Turso bills rows *read*, and the app was reading roughly 607M a month at this
crew's usage. It's now ~48M — a **92% cut** — with no feature removed.

(Those figures are measured against a database seeded to match the live one:
2,092 StatHistory rows, 1,315 suggestions, 2,694 votes, 20 evidence posts. The
shape matters — this crew suggests and votes constantly and barely posts to the
board, so the tables the hot queries were scanning were the big ones.)

What was actually wrong:

- The notification bell recomputed all 49 achievements for every player, from
  the full stat table and all of StatHistory, **on every poll** — every 30
  seconds, per open tab — and almost always wrote nothing. Achievements derive
  from stats, so they're now recorded when a stat changes, plus a daily cron
  sweep for the few that turn over with the calendar (90-day window, streaks).
- Six surfaces each ran the same crew-wide stat computation for themselves.
  They now share one cached result, dropped the instant a stat changes.
- Almost nothing was indexed. `ORDER BY createdAt DESC LIMIT 30` was reading
  and sorting whole tables to return 30 rows, in the feed, the ticker, the
  evidence board and the suggestions list. 38 indexes fix that, including an
  expression index for the `COALESCE(resolvedAt, createdAt)` ordering.
- The message board returned every message ever posted, then ran 3-4 more
  queries *per message* — about 1,200 round trips — every five seconds. It's
  five queries and a page of 20 now, with "Show older".
- The suggestions list did the same with the whole Suggestion, Vote and
  StatHistory tables. Pending is still shown in full; resolved history pages.
- Housekeeping (expiring week-old suggestions, a one-shot backfill) ran on
  every read of the suggestions list. It runs once a day now.

Timers were also relaxed where they were chasing things that change a few times
a day: messages 5s → 15s, suggestions 8s → 20s.

`scripts/bench/` holds the harness this was measured with — seed a database at
your scale, run the real code paths, price each query from its actual SQLite
query plan. `npm run bench:compare` prints the before/after.

---

## AI starting point for suggestions — 15 August 2026

Picking stats off someone's evidence means holding 70 definitions in your head,
and the ones people miss are always the same ones: the mentality and skillset
stats sitting underneath a physical result. This drafts them for you.

<details>
<summary>Message for the crew — copy everything in the block</summary>

Plain text on purpose: `##` and `**` don't render in WhatsApp / iMessage /
Discord.

```
🚀 4WARD UPDATE — AI starting point on suggestions

Small one. When you're making a suggestion about someone and you attach one of
their evidence posts, there's a new button: "Draft stats from this post".

Press it and it reads what they wrote, then suggests which stats it thinks the
post actually proves — with a +1 or +2 on each and a line on why. It also
writes you a short version of the "what happened" box.

Everything it gives you is a starting point, nothing more. Tick off the ones
you don't agree with, add ones it missed, change any of the numbers, rewrite
the text. Then submit like normal. It cannot change anyone's stats — the crew
still votes on every single one exactly like before.

Two things worth knowing:
- It reads WRITING only. A video with a two-word caption gives it nothing to
  work with, and it'll tell you so. The more you write on your evidence, the
  better this gets for whoever proposes off it.
- You can't run it on your own evidence. It's for whoever's proposing about
  you.

That's it. Ignore it entirely if you'd rather pick by hand.
```

</details>

**What landed**

- **New panel in New Suggestion.** Appears once you've picked a subject and
  attached exactly one of their evidence posts. Drafts up to 6 `{stat, delta}`
  pairs, each with a one-line rationale, plus a compact written account.
- **Everything is a prefill.** Drafted stats land in step 3 as ordinary picks;
  the write-up lands in the step 4 box and saves to stat history exactly as
  submitted. No new path to changing a stat value — `POST /api/suggestions` and
  the vote are untouched.
- **Read once per post.** Cached on the evidence row, so the first press pays
  and everyone after reads the same answer. Cleared when the author edits the
  caption.
- **Can't name an impossible stat.** Hidden and locked stats are stripped from
  the catalogue before the model sees it, the schema constrains `code` to a real
  enum and `delta` to `-2/-1/+1/+2`, and cached hints are re-checked against the
  live catalogue on every read — so a stat locked since generation quietly
  drops out instead of failing on submit.
- **Text only, and honest about it.** Captions under 40 characters are refused
  rather than guessed at. Subjects can't read hints on their own evidence.

**Setup:** one env var, `ANTHROPIC_API_KEY` — see
[AI-SETUP.md](./AI-SETUP.md). Until it's set the button returns a clear message
and nothing else changes. Runs Claude Haiku 4.5 at roughly **$2–3 a year** at
30–50 evidence posts a month.

---

## Seven changes — 11 August 2026

A batch covering a long-standing data loss in suggestions, three new
destinations, and profile customisation.

<details>
<summary>Message for the crew — copy everything in the block</summary>

Plain text on purpose: `##` and `**` don't render in WhatsApp / iMessage /
Discord.

```
🚀 4WARD UPDATE — seven things

Decent sized one this time. Nothing you need to do, just have a read.

✍️ SUGGESTIONS NOW HAVE ONE BOX, NOT TWO

You know how there were two text boxes, and half of us were writing "see other
box" in one of them? Gone. There's one box now, and whatever you write in it is
what gets saved to the stat's history forever.

Two things worth knowing:
• Evidence is now optional. Write what actually happened and the crew votes on
  whether it holds up — same as before, just without the second box to fill in.
• I've gone back and fixed the old ones. Any change in your history that just
  said "see other relevant box" now shows what was actually written at the time.
  Nothing was ever lost, it was just saved in the wrong field.

🎯 CREW GOALS — new

One target, all of us chipping away at it. Think "10,000 push-ups this month".

• Anyone can set one — the target, what's being counted, and what it pays out
• Every contribution needs one of your own evidence posts attached to it.
  No proof, no count.
• It counts the second you log it, no waiting on a vote. But anyone can
  challenge a contribution they don't buy, and it comes straight back off the
  total until it's sorted.
• When it's finished it either splits the points by how much you each did, or
  pays out 1st / 2nd / 3rd — whoever sets the goal decides that up front.

The payout still goes through a normal vote, and you can never file your own.
Someone else files yours, you file theirs.

🧠 TRAINING FACILITY — new

Four games, each with its own crew leaderboard:
• Recall — watch a sequence of tiles, repeat it back, it gets one longer each
  time
• Deduce — crack a hidden colour code from the clues you get back
• Focus — letters stream past, call it when one repeats from two back
• Reflex — hit ten targets as fast as they land

These do NOT hand out points on their own. You get a record and a spot on the
board, and if someone puts up a run that genuinely deserves something, one of us
proposes the stat change and we all vote on it like normal. Otherwise it'd just
turn into a grind.

⏳ COMPARE TO PAST YOU — new

Pick any two dates and see your whole stat sheet on both, plus everything that
moved in between. It's not an estimate — it's exactly what was on the board
those days.

It's under Compare, or "Past You" in the menu.

🎨 MAKE IT YOURS

Settings, then Profile:
• Pick your own colour — it follows you onto every chart, leaderboard and share
  card in the app
• Upload a proper profile picture instead of your initials, then drag it around
  and pinch to zoom until it's framed how you want. Same for your banner. You
  can go back and re-frame either one any time without uploading it again.
• Add a one-line bio — and pick where it shows up. The leaderboard, your posts
  on the message board and evidence, the compare screen, and the little card
  people get when they hover you. Each one has its own switch, so you can put
  it everywhere or nowhere.
• Wear an achievement as a title next to your name (only ones you've actually
  earned, obviously)

Hover anyone's avatar — or tap it on your phone — and you'll get a quick card
with their picture, banner, title and bio, without leaving whatever page you're
on.

Colours are first come first served — if someone's already got it, it'll tell
you.

📸 SHARE ANY MESSAGE AS AN IMAGE

Every message on the board has a Share button now. It saves the message as a
proper image — handy when someone hits a milestone and you want it somewhere
outside the app.

🔔 THE BELL FINALLY SHUTS UP

Before, the only way to clear that badge was to open the bell itself. Now just
opening the page clears those ones — open Suggestions and the suggestion
notifications go quiet on their own.

They stay in the list so you can still scroll back through what's been
happening. They just stop nagging you.
```

</details>

### One box on a suggestion, not two

The bug worth fixing first. A suggestion carried **two** text fields — the
witness `testimony` (step 2) and the `reason` (step 4) — but only `reason` was
ever written to `StatHistory`. So whenever someone put the real account in the
testimony box and "see other relevant box" in the reason, the permanent record
kept the pointer and lost the substance.

- The form now has **one** required box, and it's the one that reaches history.
  Evidence is optional supporting material rather than half of a grounding
  rule.
- `lib/suggestionText.ts` merges the two fields on read, so every existing
  suggestion shows everything that was typed. A pointer on either side defers
  to the side with real content; two real accounts are joined, not truncated.
- `lib/suggestionBackfill.ts` runs once (marker row in a new `AppMigration`
  table) and **repairs `StatHistory` rows whose reason was a pointer**, pulling
  in the testimony that had the actual story. Rows already carrying a real
  explanation are never touched — the pointer patterns are anchored and capped
  at 80 characters because mistaking content for a placeholder would overwrite
  genuine history.
- `POST`/`PATCH` still read `testimony` off the wire so a stale open tab can't
  silently drop what someone typed into it; it's folded into the one field.

### The bell clears per page

Read state was a single `lastSeenAt` watermark, so the badge only cleared by
opening the bell itself. `NotificationSectionSeen` adds a second watermark per
section — the first path segment of an event's link — and landing on `/suggestions`
now clears the suggestion items without a click. Items **stay in the list**
(greyed, no dot) because the feed doubles as the crew's recent-activity log;
removing them would gut that.

### Share a message as an image

`/api/og/message/[messageId]` renders any board message as a quote card —
author, colour, milestone badge, attached stat, reaction counts. Auth-gated and
downloaded as a file like the stat card, because a public URL would let anyone
holding a link read the board. The font loader is now shared (`lib/ogFont.ts`).

### Profile customisation

Accent colour, uploaded profile picture, banner, bio and an earned title, all
self-served in Settings (cosmetic, so no vote). Stored as additive columns on
`Player`. A custom colour follows you onto every chart, leaderboard and share
card; colours already claimed by someone else are blocked, since two people
sharing one makes them indistinguishable everywhere. Titles can only be
achievements you've actually earned — verified server-side, not trusted from
the client.

**Cropping is non-destructive.** Pictures and banners keep their full upload;
what's stored is a crop box as four fractions of the source (`avatarCrop`,
`bannerCrop` — `"x,y,w,h"`), applied by Cloudinary at delivery time via a
`c_crop` component ahead of the existing `c_fill`. So a photo can be re-framed
forever without being re-uploaded, and the framing follows it to every render
site — avatars, hover cards, the profile hero, OG share cards — because they
all go through `cldThumb` / `cldBanner`. The editor (`ImageCropper`) is a fixed
frame with the image panning and scaling behind it, so the viewport *is* the
crop; drag, pinch, scroll or slider, no new dependencies. One gotcha worth
knowing: Cloudinary reads a relative dimension of exactly `1` as **one pixel**,
not 100%, so a full-frame crop is clamped to `0.9999`.

**Bios show in four more places, each with its own toggle.** Leaderboard, the
message board and evidence feeds, the hover card, and compare + share cards —
listed once in `lib/bioPlaces.ts` (its own module because `lib/profile` reaches
for the database, and the settings UI is a client component). The column stores
the places a player has switched **off**, not on, so a bio shows everywhere by
default and a place added later starts on for everyone instead of silently
missing. `PlayerBio` is the only component that reads the toggle, so adding a
place is a key plus a drop-in. Everyone sees whatever you've enabled — there's
no per-viewer privacy layer here, same as the profile page has always been.

**Hover cards.** `ProfileHoverCard` wraps `Avatar` by default (opt out with
`profileCard={false}`, which the pickers, autocompletes and page-header avatars
do) and portals to `document.body`, since avatars sit inside cards and table
cells with `overflow: hidden`. On touch there's no hover, so the first tap opens
the card and swallows the click that would have followed the link underneath.

Two related fixes fell out of this: saving your profile used to call
`setPlayerProfiles` / `setCustomColors` with just yourself, which **wiped
everyone else's** picture and colour from the registry until the next full load
— now `upsertPlayerProfile` / `setCustomColor` merge a single player. And the
registry now notifies subscribers (`useProfileRegistry`), so identities that
arrive from AppShell's effect after a page has painted actually repaint it,
instead of relying on an unrelated re-render happening along.

### Compare to past you — `/wayback`

Any two dates, the whole stat sheet on each, and everything that moved between
them. Values are **rewound exactly** from `StatHistory` (the value on date T is
the `oldValue` of the earliest change after T), not sampled — so a date shows
what was really on the board that day.

### Crew goals — `/group-goals`

One shared target the whole crew chips away at. Every contribution **requires**
an evidence post, and it has to be your own. Contributions count on sight so a
month-long goal keeps moving; the counterweight is that anyone can strike one
they don't believe, which pulls it from the total and leaves the challenge on
the record.

Payout is per-goal: **split by contribution** (largest-remainder, so the awards
sum to exactly the pool) or **podium**. Ties break in favour of whoever got
there first. Crucially the payout does **not** move stats directly — it files
ordinary uncapped suggestions linked by `groupGoalId` that still clear a vote,
and you can never file your own share.

### Training Facility — `/training`

Four playable drills: **Recall** (memory), **Deduce** (mastermind-style
deduction), **Focus** (2-back attention) and **Reflex** (hand-eye). Each keeps
its own scores and crew leaderboard.

Deliberately a **separate track** from stats. A game that paid out points
directly would be the first thing in the app that awards itself, and the first
thing worth grinding — so a strong run produces a record and a board position,
and a crewmate turns that into a normal suggestion the crew votes on. That's
also why client-reported scores are fine: a faked run buys a line your mates
can see, and anything trying to become points goes past them anyway.

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

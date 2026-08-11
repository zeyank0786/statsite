# Changelog

Changes the crew has **not** been told about yet. New entries go here.

When an announcement goes out, move those sections into
[CHANGELOG-ANNOUNCED.md](./CHANGELOG-ANNOUNCED.md) under a dated heading. This
file should always answer one question at a glance: what still needs telling?

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
• Upload a proper profile picture instead of your initials
• Add a banner and a one-line bio
• Wear an achievement as a title next to your name (only ones you've actually
  earned, obviously)

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

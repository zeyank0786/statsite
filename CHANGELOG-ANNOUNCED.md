# Changelog — announced

Releases the crew has already been told about, newest first.

Anything **not** yet announced lives in [CHANGELOG.md](./CHANGELOG.md). When an
announcement goes out, move those sections down into this file under a dated
heading. That way CHANGELOG.md only ever answers one question — what still
needs telling — without losing the record of everything that came before.

---

## Sent to the group chat — 7 August 2026

Covered all three releases below: the visual pass, draw-on charts, and the
holographic trophy case.

<details>
<summary>What the crew was actually told</summary>

```
🆕 Big drop on the stats app — achievements overhaul, share cards, and a fresh coat of paint

🏆 20 new achievements (the list is up from 30 to 49)
Plenty more to chase:
• Streaks — 4 weeks running, a full quarter, half a year without a gap
• Breadth — a net gain in every single category, every category past 100
• Single-stat feats — 200 pts on one stat, two stats at Legendary, every stat at 10+
• Crew standing — top 3 overall, leading 3 categories at once, biggest 90-day gain
• Plus finishing an ambition, and improving a stat after you've flagged it as a target
None of them can be earned by letting a stat drop.

✨ The cards are holographic now
Every achievement has a rarity — Common, Rare, Epic or Mythic — and the rarer it is, the more the card shines. Mythics get the full rainbow foil. On desktop the sheen follows your cursor, on your phone it drifts on its own.
Tap any card to flip it over: it'll tell you when you earned it and which of us already have it. There are only 5 Mythics and some are still unclaimed 👀

🗑️ Comeback Story has been removed
It was the only achievement that needed a stat to go DOWN before you could get it. Didn't sit right — you shouldn't be able to set yourself up for a trophy by tanking something.

🔕 No notification spam, don't worry
Any of the 20 you already qualify for have been quietly marked as earned. Only ones you genuinely earn from here on will pop up and throw confetti at you.

📸 Share cards
There's a Share button on your profile now. It builds a proper image — your radar, overall score, crew rank and top 3 stats — and saves it to your phone so you can post it wherever.
⚠️ It saves an image, not a link. Nothing public, nobody can see the crew's real numbers unless you send them the picture yourself.

🎬 Season Wrapped plays like a story
Your quarterly recap is now full-screen slides you tap or swipe through, like Instagram stories. It plays itself once at the start of a new season, and there's a Play button to watch it again whenever.

🎨 Everything looks different
• Every profile now wears that person's colour
• The big scores roll digit by digit like a fuel counter
• Your avatar physically travels from the leaderboard into your profile when you tap it
• Your radar traces its own outline, the trend lines draw themselves, and the category bars fill up as you scroll
• Loading now shows the shape of what's coming instead of just the word "Loading"
• Cards catch the light as your cursor moves over them, and the background slowly drifts
All cosmetic — every number on screen is exactly the same as it was.

⚙️ Too much? Settings → Reduce effects
Turns all the motion and shine off. It's per-device, so you can have it calm on your phone and full-fat on a laptop.

🔧 Also fixed
• The score on the homepage was rendering as a lone decimal point for some of you. Sorted.
• Commitment achievements were showing on your achievements page but never actually notifying you when you got one. Also sorted.
```

</details>

---

## Holographic trophy case — 7 August 2026

The achievement set went from 30 to 49, and the cards became objects worth
looking at.

### Rarity

Every achievement now declares `common | rare | epic | mythic`, assigned by
hand. Rarity was *not* computed from how many of the crew hold a thing: in a
crew of five, one person earning something would visibly downgrade everyone
else's card, which is the opposite of a reward.

The tier drives the whole treatment through four custom properties — edge
colour, glow, pip colour and the band gradient — so a new tier is a block of
variables, not a new set of rules. Current spread across the 49: 12 common,
17 rare, 15 epic, 5 mythic.

### The card

Pointer-tracked foil over an oversized band gradient: `--fx/--fy` shift the
`background-position`, so the pattern slides across the card as though it were
catching the light rather than printed on. Common gets a plain silver sheen
through `screen`; mythic gets the full spectrum through `color-dodge`.

Tilt comes from the existing `.tilt` plumbing. Foil coordinates were added to
the same delegated `pointermove` listener in `Effects.tsx` as a **separate**
lookup from the glass spotlight — one combined `closest()` would return the
card, and the section's spotlight would die the moment the cursor entered a
card.

Tap or click to flip: the back gives the earn date and which crew members hold
it. An unclaimed mythic says so, which is the point of showing it at all.
Holders come from the freshly computed result rather than the earned table, so
the list is who qualifies *now*.

Two things that would have silently broken the flip:

- Dimming locked cards via `opacity` on the flipping element. Opacity below 1
  forces `transform-style` back to `flat`. The faces are dimmed instead.
- Making the `<button>` itself the grid container. Button-as-grid has a patchy
  history across engines, and a fallback to `block` would stack the two faces
  instead of overlapping them. The grid is a div inside the button.

Touch devices never get a pointer — `Effects.tsx` doesn't even listen on them —
so under `(hover: none)` the foil drifts on a slow ambient loop instead. That's
the phone PWA, which is where most of this will actually be seen.

### The set

**Removed:** Comeback Story. It was the only achievement whose condition
involved a stat going down, so it quietly paid for a dip.

**Added 20**, none of which can be earned by losing ground anywhere:

- *Milestones* — Double Century, Double Legend, Ten Deep, No Weak Links,
  Ground Up
- *Categories* — Specialist, Total Package, Well Rounded, Even Keel
- *Momentum* — Big Swing, Big Day, Four Straight, Season Long, Half-Year Habit,
  The Long Game
- *Crew* — Podium, Triple Crown, Most Improved
- *Community* — Called Your Shot (ambitions), Locked On (targets)

Ground Up keys off a stat's **first** recorded change, not its lowest point —
"carried it up from the 5-point start", never "dropped it and climbed back".

Streaks reuse `computeStreakWeeks` with the same inputs as the leaderboard —
stat changes plus evidence posts — so the two can never quote different
numbers at the same person.

### Rollout without a confetti storm

Shipping 20 definitions at once would read as everyone earning all 20
simultaneously, and celebrations play as a queue of full-screen modals, one at
a time.

`AchievementCatalog` now records every achievement ID the system has ever
computed. The sync distinguishes three cases: first run ever, an award that was
*invented* today, and an award someone actually just earned. Only the last one
gets a real timestamp; the other two back-fill at epoch and stay quiet. Future
batches inherit this automatically.

### Fixed along the way

`fetchSocialCounts` existed twice — once in the achievements route, once in
`notifications.ts` — and the copies had drifted. The notifications one never
fetched commitments, so commitment achievements displayed on the page but were
never recorded, and therefore never celebrated. There's one copy now in
`lib/socialCounts.ts`, imported by both, because the sync has to see exactly
what the page sees. The leaderboard was calling `computeAchievements` with no
social counts at all and undercounting everyone's total; it now passes them.

### Note

Existing `AchievementEarned` rows for `comeback` were left in place — deleting
them would rewrite past Wrapped recaps. They're inert: the trophy case only
renders computed definitions.

---

## Draw-on charts — 7 August 2026

Charts and bars used to arrive fully formed. They now build themselves as they
scroll into view. Presentation only — no number on screen changed.

**Radar** (dashboard, profile, compare). The grid settles first, then each
series' outline is traced round the polygon, then its fill washes in and the
vertices pop one after another following the outline. Multiple series are
staggered, so a comparison reads as two players drawn in turn rather than one
overlapping shape.

The outline was split off the fill into its own path. A single path can't trace
its stroke and fade its fill independently, and the fill appearing at full
opacity behind a half-drawn outline looked like a rendering fault.

`pathLength={1}` normalises each perimeter, so the dash maths is `1 → 0`
regardless of the chart's size or the player's values — no `getTotalLength()`,
no measuring pass, nothing to re-measure on resize.

**Sparklines** trace left to right, the gradient area fades in behind at 35% of
the way through, and the head dot lands where the line stopped.

**Bars** (dashboard category momentum, profile stat cards, both compare
columns) grow from their anchored edge, staggered ~55ms apart down the group.
The compare page's left column is right-anchored via `.bar-grow-right` so
mirrored rows grow outward from the centre instead of both racing rightward.

Bars animate `transform: scaleX()`, not `width`. A profile carries a bar per
stat, and animating width would lay out dozens of elements per frame mid-scroll
where a transform stays on the compositor. The trade is that the pill's end cap
is slightly flattened in flight; it's correct at rest, which is the frame that
lasts.

### Reveal

One module-level `IntersectionObserver` serves every caller — the profile would
otherwise build ~70 of them doing identical work against the same root. Targets
are one-shot: unobserved before the callback fires, so nothing re-enters.

It triggers at threshold 0 with a **fixed** 56px bottom margin. A ratio
threshold can never be met by an element taller than the viewport, which is
exactly what the long category sections are, and a percentage margin creates a
dead band that grows with the screen — on a page too short to scroll, anything
inside it would stay collapsed forever. The failure mode being designed around
is an invisible chart, not a missed flourish.

Under `prefers-reduced-motion` or the **Reduce effects** toggle, the revealed
flag is set in a layout effect, so the finished state is what first paints.
There's no hidden frame to transition out of and nothing animates, even though
the transitions are still declared. Bars additionally have a CSS override, which
covers groups that were already mounted when the toggle was flipped — the hook
decides once at mount and doesn't reconsider.

---

## Visual pass — 7 August 2026

Eight presentation-layer features. No changes to scoring, stat definitions, or
the data model — every number on screen is the same number as before.

### Motion between pages

**Shared-element morphs.** A player's avatar now physically travels from the
leaderboard podium or the players grid into the profile hero, instead of one
element vanishing and another appearing. Built on React's `<ViewTransition>` via
`experimental.viewTransition` in `next.config.ts` — no animation library.

Morph names must be unique per rendered page, so only the *primary* occurrence
of a player is tagged. The leaderboard's "fastest riser" callout repeats
someone already shown on the podium and is deliberately left untagged;
duplicate names abort the transition for the whole page.

**Directional route slides.** Links tagged `nav-forward` / `nav-back` slide
content in the matching direction. The header and mobile tab bar are pinned via
`viewTransitionName`, so only the content moves and the user keeps a fixed
spatial anchor. Browser back gestures carry no transition type and fall through
to an instant swap, which is correct — there's no forward/back meaning to convey.

### Surfaces

**Cursor spotlight** on every glass card, tracking the pointer.

One delegated `pointermove` listener on the document, coalesced to one write per
animation frame, writing CSS custom properties straight to the hovered node.
Nothing re-renders — with ~40 cards on the leaderboard, per-card React state
would re-render the tree on every mouse movement.

Implemented as a `background-image` layer rather than a `::before`, specifically
so `.glass` didn't need `position: relative`. Adding that would have re-parented
the absolutely positioned glow blobs that several pages already rely on.

**Card tilt** (`.tilt`), opt-in rather than global — a full-width section
tilting on hover reads as broken rather than tactile. Applied to the dashboard
quick actions and the players grid.

**Living backdrop.** The three static radial gradients that were on `body` now
drift on a 46s cycle, with film grain and a vignette over the top. Grain kills
the flat-black banding that dark gradient UIs get on cheaper panels. All three
are transform-animated fixed layers, so they stay on the compositor and cost
nothing on scroll.

### Loading

**Shimmer skeletons** replacing the bare `Loading...` text and the
`animate-pulse` blocks. Each skeleton mirrors the shape of what it stands in
for — same card sizes, same column counts — so nothing shifts position when
data lands. Sweeps are staggered per item; a grid pulsing in lockstep looks
mechanical.

Covers the dashboard, players, leaderboard, profile, and Wrapped.

### Identity

**Per-player accent theming.** Each profile now wears its owner's colour,
rebinding `--accent-cyan` and `--brand-gradient` within the page.

Only *decorative* accents are rebound. The green/red gain-loss semantics stay
fixed on purpose — recolouring those would make a stat drop look like a win on
a player whose identity colour happens to be green.

**Odometer.** The dashboard and profile hero scores roll digit by digit,
spinning through two full 0–9 cycles on mount with a left-to-right stagger so
the number settles like a counter coming to rest. Later value changes are a
short hop within the final cycle rather than another full spin.

Reserved for hero figures. On a dense table of numbers, rolling digits read as
noise.

### Sharing

**Stat cards.** A branded 1200×630 PNG of your radar, overall score, crew rank
and top three stats, rendered with `next/og`.

The route is auth-gated and the client fetches it with session cookies and
saves the blob. A public URL would let anyone holding a link read the crew's
real numbers, so sharing is an explicit act of posting the file rather than
passing around a live link.

**Season Wrapped as a story player.** Full-screen slides with segment progress
bars, auto-advance, swipe, keyboard control and pause. Autoplays once per season
per device — it should feel like an event on arrival, not a modal you dismiss on
every visit. The existing card grid remains underneath as the summary view, and
a Play button replays the story.

### Accessibility

A **Reduce effects** toggle in Settings turns off the spotlight, tilt, backdrop
drift and grain. It's per-device, not per-account: the right answer depends on
the screen you're on, and a phone on battery and a desktop can reasonably
disagree. Applied pre-paint by an inline script so a reduced device never
flashes the full treatment on load.

Separately, every new animation is wired into the existing
`prefers-reduced-motion` block, including the view transitions — directional
slides simulate travel across the viewport and are the highest-risk pattern for
motion sensitivity.

Odometer strips carry 30 glyphs per digit, so the visual is `aria-hidden` with
the real value exposed to screen readers. Skeletons announce as a polite live
region.

---

## Fixes

**Homepage score rendered as a lone decimal point.** The hero used
`.text-gradient`, which sets `color: transparent` and clips the *parent's*
background to the parent's own text run. The rolling digits sit inside
`overflow: hidden` + `transform` boxes that paint as separate layers, so they
inherited the transparent colour with no background of their own and vanished —
leaving only the decimal point, which is a plain inline span in the paragraph's
own text run.

Odometer now takes a `gradient` prop and each glyph paints and clips its own
background. The gradient is sized to the full number's width and offset per
character, so the run reads as one continuous sweep rather than repeating per
digit. The profile score was unaffected throughout, since it uses a solid colour
that inherits normally through transforms.

**Cursor spotlight died on hover.** `.glass-hover:hover` used the `background`
shorthand, which resets `background-image`, and at `:hover` specificity it beat
the spotlight rule — killing the highlight at exactly the moment the cursor was
on the card. Changed to `background-color`.

**Share card returned a 500 despite a clean build.** Satori rejects SVG `<text>`
nodes. The radar's axis labels are now absolutely positioned divs layered over
the chart. Caught only by rendering the route; compilation proved nothing here.

---

## Notes

`experimental.viewTransition` is, as the name says, experimental. Browsers
without the View Transitions API navigate normally and simply don't animate, so
the downside is a lost flourish rather than a broken page.

The `types/react-canary.d.ts` reference exists because the App Router runs on
Next's vendored React canary build, which exports `<ViewTransition>`, while the
installed `react` package is stable 19.x. Without that reference the import
type-errors even though it resolves fine at runtime.

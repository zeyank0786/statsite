# Changelog

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

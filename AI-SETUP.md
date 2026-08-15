# AI stat hints setup (~2 minutes)

Everything is built. The only outstanding step is pasting one key into Vercel.

Until the key is set, the button is still hidden from nobody and breaks nothing —
pressing it returns "AI hints are not configured on this deployment yet" and the
propose flow carries on exactly as it did before.

## 1. Get an API key

[platform.claude.com](https://platform.claude.com) → **API keys** → create one.
Load a small amount of credit; see the cost section below for what this actually
spends.

## 2. Add it to Vercel

Vercel → your project → **Settings** → **Environment Variables**. Add it to
Production, Preview and Development:

```
ANTHROPIC_API_KEY=<your key>
```

> ⚠️ **Never paste the real key into this file, or any other tracked file.**
> This repo is public. The live value belongs in exactly two places: Vercel's
> environment variables, and your local `stats-app/.env` (which is gitignored).

Redeploy for it to take effect.

## 3. That's it

There is no migration to run. The two columns the cache lives in
(`Evidence.aiHints`, `Evidence.aiHintsAt`) are created on first use, the same
way `Suggestion.batchId` and the stat-notes table are.

---

## What it does

In **New Suggestion**, once you've picked someone and attached exactly one of
their evidence posts, an **AI starting point** panel appears. Press the button
and it reads the post's caption, cross-references the stats that are actually
available for that person, and drafts up to six `{stat, delta}` pairs plus a
short write-up.

Everything it returns is a draft:

- Tick and untick the drafted stats, then **Add to my suggestion**. They land in
  step 3 exactly as if you'd picked them by hand — change the deltas, drop them,
  add others.
- **Use its write-up** drops the drafted text into the account box in step 4.
  Edit it freely. Whatever is in that box on submit is what saves to the stat
  history, as always.
- Nothing here writes a stat value or creates a suggestion. The crew still votes
  on every row, unchanged.

## What it can't do

- **It reads text only.** No images, no video. A post with a caption shorter
  than 40 characters can't be read and the button says so.
- **One post at a time.** Attach two and the panel waits until you're down to
  one.
- **You can't read hints on your own evidence.** You can't propose about
  yourself anyway; this just stops it doubling as a preview of what the crew
  might say about you.
- **It only ever names stats that are live for that person.** Hidden and locked
  stats are stripped out of the catalogue before the model ever sees it.

## Caching, and when it regenerates

A post is read **once**. The result is stored on the evidence row, so whoever
presses the button first pays for it and everyone after gets the same answer
instantly. A post nobody proposes from never costs anything.

It regenerates in one case: **the author edits the caption.** The cached hints
describe text that no longer exists, so they're cleared on the edit and the next
press reads the new caption.

Stat values and locks are *not* part of the cache key — they drift constantly
and re-reading on every change would defeat the point. Instead the cached
answer is re-checked against the live catalogue every time it's served, so a
stat that has since been locked or untracked quietly drops out of the list
rather than being offered and then rejected on submit.

## Cost

Model: **Claude Haiku 4.5** (`claude-haiku-4-5`), set in `lib/statHints.ts`.

Roughly 3,500 input tokens (the 70-stat catalogue with descriptions and current
values, plus the caption) and ~400 output tokens per post, at $1/$5 per million:

| Evidence posts / month | Cost / month | Cost / year |
| ---------------------- | ------------ | ----------- |
| 30                     | ~$0.17       | ~$2         |
| 50                     | ~$0.28       | ~$3.30      |

Deliberately **not** prompt-cached. At roughly one post a day, two calls never
land inside the cache window, so a breakpoint would add the 1.25× write premium
to every single call and read back almost never.

To change model, edit `HINTS_MODEL` in `lib/statHints.ts`. Claude Sonnet 5 is
about 5× the cost (~$9–15/year at this volume) if the reads ever feel shallow.

## Where the code lives

| File | What it does |
| --- | --- |
| `lib/statHints.ts` | Prompt, schema, the Anthropic call, the cache, and `resolveHints()` |
| `app/api/evidence/[id]/stat-hints/route.ts` | `POST` — cached-or-generate, plus the access rules |
| `app/suggestions/new/page.tsx` | The **AI starting point** panel |
| `app/api/evidence/route.ts` | Clears the cache on caption edit |
| `tests/statHints.test.ts` | Covers `resolveHints()` — bad codes, bad deltas, dupes, junk |

`resolveHints()` is the only path from model output to anything you see, and
both a fresh generation and a cached read go through it. That's the function
that guarantees a hint can never name a stat that doesn't exist, or a delta the
suggestions API would reject.

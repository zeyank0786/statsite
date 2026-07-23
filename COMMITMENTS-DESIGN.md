# Commitments — design notes

Not built yet. This is the context for picking it up later without re-deriving
the reasoning.

## The idea

A commitment is a **public promise with a deadline, judged by the crew**.

> "I will run 3x/week for the next 4 weeks."
> → the crew sees it → you check in with evidence as you go → at the deadline
> the crew votes on whether you delivered → if you did, the linked stats move
> automatically. If you didn't, that's on the record too.

## Why this and not another leaderboard feature

**Everything currently in 4WARD is retrospective.** Evidence proves the past,
suggestions reward the past, history/achievements display the past. Nothing
asks *"what are you doing next?"* — Targets is the only forward-looking thing
and it's thin (3 stat codes, no deadline, no plan, no check-in).

Commitments close the loop. Today the flow is:

    do thing → post proof → hope someone notices → suggestion → vote

With commitments it becomes:

    declare intent → deadline → verdict → stat change

which makes stat changes **automatic** instead of relying on someone
remembering to file a suggestion.

It also fixes the cold-start problem: nothing currently happens unless someone
opens the app and acts. Deadlines generate activity on their own.

The most interesting output is **completion rate** — "keeps 80% of his
commitments" is a harder, more honest reputation number than any point total,
because you can't fake it and the crew judges it. Failure becomes data.

## How it plugs into what already exists

Almost no new machinery — it's mostly wiring together things already built.

| Existing system | Role in commitments |
| --- | --- |
| **Evidence board** (`Evidence`, Cloudinary) | Check-ins attach evidence. Reuse the existing uploader. Already subject-posted, which matches: you prove your own commitment. |
| **Suggestion engine** (`lib/suggestionEngine.ts`) | The verdict vote reuses the same eligibility rules (active ∧ claimed ∧ not vote-locked) and strict-majority maths. Don't reinvent quorum. |
| **`applyApproval` / `StatHistory`** | A kept commitment moves stats through the same code path, writing history with a new `source = 'commitment'`. Add it to `SOURCE_META` in `app/history/page.tsx` so it renders as "Commitment". |
| **Tiers** (`lib/categories.ts`) | Stat gains flow into tiers/rank-up ETA for free. |
| **Achievements** (`lib/achievements.ts`) | New group: first commitment kept, 5 kept, 10 kept, 100% rate over N, longest streak of kept commitments. Computed live like the rest. |
| **Push + notifications** (`lib/push.ts`, `lib/notifications.ts`) | The big unlock. Check-in due, deadline approaching, verdict needed, verdict result. Add `commitment` event types to the feed. |
| **Cron** (`vercel.json`, `/api/cron/*`) | Already exists (vote reminders). Add a commitments job to the same daily run: fire check-in prompts, deadline warnings, and flip overdue commitments to "awaiting verdict". |
| **Feature locks** (`lib/featureLocks.ts`) | Add a `commit` lockable feature. Vote-locked players drop out of verdict maths automatically via `getEligibleVoterIds`. |
| **Message board** (`lib/milestones.ts`) | Auto-post cards on created / kept / missed, exactly like the existing tier-up announcements. |
| **Streaks** (`lib/streaks.ts`) | Check-ins can count toward weekly activity. |
| **Profile + per-stat pages** | Show active commitments on the profile; the per-stat page lists commitments targeting that stat. |
| **Targets** (`Target`) | Overlaps — see open questions. Cleanest is probably: a commitment can optionally link to one of your targets, targets stay "what I'm focused on", commitments are "what I've promised by when". |

## Rough data model

```
Commitment
  id, playerId, title, detail, deadline,
  cadence          -- 'none' | 'weekly'  (drives check-in prompts)
  status           -- 'active' | 'awaiting_verdict' | 'kept' | 'missed' | 'voided'
  createdAt, resolvedAt

CommitmentStat        -- what moves if kept
  commitmentId, statId, delta

CommitmentCheckIn     -- progress along the way
  id, commitmentId, evidenceId?, note, createdAt

CommitmentVote        -- the verdict
  commitmentId, voterId, choice ('kept' | 'missed'), createdAt
```

All tables self-creating on first use, matching the established pattern in
this repo (`PushSubscription`, `Nudge`, `FeatureLock`, etc.) — no manual Turso
migrations.

## Lifecycle

1. **Create** — pick title, deadline, optional cadence, and the stats that
   move if kept (same ±1/±2 rules as suggestions). Posts to the board.
2. **Active** — check in with evidence as you go. If cadence is weekly, the
   cron nudges on a missed week.
3. **Deadline hits** — cron flips it to `awaiting_verdict` and pushes the crew
   to vote kept/missed.
4. **Verdict** — strict majority of eligible voters, same as suggestions.
   Kept → stats move via `applyApproval`, history written with
   `source='commitment'`, celebration fires. Missed → recorded, no stat change
   (unless we decide otherwise, see below).
5. **Recorded forever** — completion rate on the profile.

## Open decisions (ask before building)

1. **Does missing cost points**, or is it recorded only? (Recorded-only is
   safer for morale; a penalty makes commitments weightier but discourages
   ambitious ones.)
2. **Are check-ins mandatory** or optional evidence-gathering?
3. **Can you commit on someone else's behalf** ("I bet you can't…"), or only
   for yourself?
4. **Can you withdraw early**, and does that count as a miss?
5. **Does the subject vote** on their own verdict? (Suggestions say no — the
   subject is excluded. Probably the same here.)
6. **Relationship to Targets** — absorb, link, or leave separate?
7. **Minimum/maximum deadline** — stop 10-year commitments and 1-hour ones.

## Build order

1. Tables + create/list API + create UI
2. Check-ins (reusing evidence upload)
3. Deadline cron → `awaiting_verdict` + push
4. Verdict vote (reuse suggestion vote machinery) → `applyApproval` on kept
5. Profile display + completion rate
6. Achievements + board announcements

Phases 1–4 are the meaningful product; 5–6 are polish that can follow.

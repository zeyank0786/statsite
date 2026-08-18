# Read-cost benchmark

Turso bills **rows read**, not rows returned, and nothing in the client reports
it — a query that returns 30 rows may have scanned 30,000 to find them. This
harness makes that number visible so a change can be measured instead of
guessed at.

## Running it

```bash
# 1. Build a database shaped like production at your crew's scale
npm run bench:seed                      # writes ./bench.db

# 2. Measure the current code
BENCH_DB=file:bench.db npm run bench -- --save scripts/bench/after.json

# 3. Measure the frozen pre-optimisation code, on a copy WITHOUT the new indexes
cp bench.db bench-before.db             # then drop the idx_* from the migration
BENCH_DB=file:bench-before.db npm run bench:baseline -- --save scripts/bench/before.json

# 4. Compare
npm run bench:compare
```

`--detail` prints the most expensive queries per path, which is how you find
the next thing worth fixing.

## What is measured vs modelled

**Measured exactly:** SQL statements issued, rows returned, wall-clock. The
harness turns on `recordQueries()` in `lib/db.ts` and runs the app's real
server-side code paths — not a re-implementation of them.

**Modelled:** rows read. Derived in `rowModel.ts` from each statement's real
`EXPLAIN QUERY PLAN`, priced against real table cardinalities and index
fanouts measured from the data:

- siblings in a plan are a nested loop, so node _k_ runs once per row produced
  by nodes 1..k-1
- `SCAN` of a table reads all of it, per iteration
- `SEARCH` reads the measured average group size for those columns
- a `LIMIT` stops the driving loop early **only** when the ordering came from
  an index; with a temp B-tree the whole input is read and sorted first — which
  is exactly the difference an index on the ORDER BY column makes
- uncorrelated subqueries run once, correlated ones per outer row

It is an estimate. The point is that it is the *same* estimate on both sides of
a comparison, so the ratio is trustworthy even where the absolute number is
approximate. Two known conservative biases: index fanout is the average group
size across the whole table (so a selective value like `status = 'pending'` is
over-priced), and building a transient index is charged one full pass.

## The files

| file | what it is |
| --- | --- |
| `schema.ts` | core DDL, reproducing production's shape including the columns various route handlers added at runtime |
| `seed.ts` | generates a deterministic database from the `WORKLOAD` model at the top — 4 players, six weeks of activity |
| `scenarios.ts` | the hot request paths as measurable units, calling live code where possible |
| `baseline.ts` | the same paths **frozen** as they were before the optimisation work, so "before" stays reproducible |
| `rowModel.ts` | query-plan → rows-read pricing |
| `usage.ts` | how often each path is called per day, and how cache sharing changes that |
| `measure.ts` | runner, table output, extrapolation, comparison |

## Changing the assumptions

Two places, both deliberately explicit:

- `seed.ts` → `WORKLOAD`: how much data exists (players, days, per-day rates).
- `usage.ts` → `USAGE`: how hard it's used (foreground minutes, navigations,
  stat writes per day) and `POLL_SECONDS`, which must mirror the timers in the
  components.

Change a number, re-run, and the whole report moves with it.

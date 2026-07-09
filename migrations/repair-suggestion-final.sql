-- ============================================================================
-- FINAL Suggestion repair — for when finish-migration.sql left #13 still FAILing
-- (Turso ignored PRAGMA foreign_keys=OFF, so the Vote->Suggestion foreign key
-- blocked the DROP and the old suggestedNewValue/suggestedById columns survived).
--
-- This removes the dependency STRUCTURALLY instead of via the pragma: it rebuilds
-- Vote without its foreign key into Suggestion, so the Suggestion swap then works
-- even with foreign keys fully enforced. Non-destructive — every row is copied.
--
--   turso db shell <your-db> < migrations/repair-suggestion-final.sql
--
-- No output = success. Then re-run verify.sql — all 14 should PASS.
-- ============================================================================

-- Clear any half-built leftovers from earlier blocked runs (safe if absent)
DROP TABLE IF EXISTS Suggestion_fixed;
DROP TABLE IF EXISTS Vote_new;

-- 1. Rebuild Vote WITHOUT the Suggestion foreign key (keeps the no-double-vote
--    UNIQUE constraint). Vote eligibility is enforced in app code, not by the FK,
--    and nothing in the app relies on the old cascade.
CREATE TABLE Vote_new (
  id           TEXT PRIMARY KEY,
  suggestionId TEXT NOT NULL,
  userId       TEXT NOT NULL,
  choice       TEXT NOT NULL,
  createdAt    TEXT NOT NULL,
  UNIQUE (suggestionId, userId)
);
-- Old Vote rows have no createdAt on Turso, so synthesize one (vote timestamps
-- on already-resolved suggestions are inconsequential; new votes set it properly).
INSERT INTO Vote_new (id, suggestionId, userId, choice, createdAt)
  SELECT id, suggestionId, userId, choice, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM Vote;
DROP TABLE Vote;
ALTER TABLE Vote_new RENAME TO Vote;

-- 2. Now nothing foreign-keys into Suggestion — rebuild it to the clean shape,
--    dropping the leftover NOT NULL columns that break new inserts.
CREATE TABLE Suggestion_fixed (
  id           TEXT PRIMARY KEY,
  playerId     TEXT NOT NULL,
  proposedById TEXT NOT NULL,
  statId       TEXT NOT NULL,
  delta        INTEGER NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  createdAt    TEXT NOT NULL,
  updatedAt    TEXT NOT NULL,
  resolvedAt   TEXT
);
-- This Turso DB's Suggestion table has no updatedAt column, so seed it from
-- createdAt for the old rows (new suggestions set updatedAt properly).
INSERT INTO Suggestion_fixed (id, playerId, proposedById, statId, delta, reason, status, createdAt, updatedAt, resolvedAt)
  SELECT id, playerId, COALESCE(proposedById, suggestedById), statId, delta, reason, status, createdAt, createdAt, resolvedAt
  FROM Suggestion;
DROP TABLE Suggestion;
ALTER TABLE Suggestion_fixed RENAME TO Suggestion;

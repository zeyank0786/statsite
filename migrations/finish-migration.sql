-- ============================================================================
-- FINISH the full-rework migration on Turso.
--
-- Use this when verify.sql shows: EvidenceCategory / SuggestionEvidence missing,
-- Evidence not in its new shape, and Suggestion still carrying the old
-- suggestedNewValue / suggestedById columns. (The original migration stalled at
-- the Evidence rebuild step because of foreign-key enforcement.)
--
-- Non-destructive: no rows are deleted. The malformed Evidence table is parked
-- as Evidence_backup_pre_rework so you can inspect/recover anything from it.
--
--   turso db shell <your-db> < migrations/finish-migration.sql
--
-- foreign_keys is turned OFF for the table swaps so the Vote -> Suggestion
-- foreign key can't block the rebuild, then turned back ON.
-- ============================================================================

PRAGMA foreign_keys=OFF;

-- 1. Rebuild Suggestion to the exact new shape, dropping the leftover NOT NULL
--    columns (suggestedById / suggestedNewValue) that break new inserts.
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
INSERT INTO Suggestion_fixed (id, playerId, proposedById, statId, delta, reason, status, createdAt, updatedAt, resolvedAt)
  SELECT id, playerId, proposedById, statId, delta, reason, status, createdAt, updatedAt, resolvedAt
  FROM Suggestion;
DROP TABLE Suggestion;
ALTER TABLE Suggestion_fixed RENAME TO Suggestion;

-- 2. Evidence: the current table is malformed. Park it (no data loss) and
--    create the correct shape. Anything in the old table stays in the backup.
ALTER TABLE Evidence RENAME TO Evidence_backup_pre_rework;
CREATE TABLE Evidence (
  id                 TEXT PRIMARY KEY,
  playerId           TEXT NOT NULL,
  mediaUrl           TEXT,
  mediaType          TEXT,
  cloudinaryPublicId TEXT,
  caption            TEXT,
  captionHidden      INTEGER NOT NULL DEFAULT 0,
  createdAt          TEXT NOT NULL,
  updatedAt          TEXT NOT NULL
);

-- 3. Create the join tables the migration never reached.
CREATE TABLE IF NOT EXISTS EvidenceCategory (
  evidenceId TEXT NOT NULL,
  categoryId TEXT NOT NULL,
  PRIMARY KEY (evidenceId, categoryId)
);
CREATE TABLE IF NOT EXISTS SuggestionEvidence (
  suggestionId TEXT NOT NULL,
  evidenceId   TEXT NOT NULL,
  PRIMARY KEY (suggestionId, evidenceId)
);

PRAGMA foreign_keys=ON;

-- After this, re-run verify.sql. #13 ("dropped suggestedNewValue") now PASSES.
-- Once you've confirmed Evidence_backup_pre_rework holds nothing you need,
-- you can:  DROP TABLE Evidence_backup_pre_rework;

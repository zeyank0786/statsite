-- ============================================================================
-- REPAIR: Suggestion table on Turso is missing `proposedById` (and `resolvedAt`)
-- because the table-swap in the main migration was blocked by the Vote→Suggestion
-- foreign key. This fixes it IN PLACE — non-destructive, no DROP of the data table,
-- so the Vote foreign key stays valid.
--
-- Run ONLY if diagnose.sql shows the Suggestion table WITHOUT proposedById.
--   turso db shell <your-db> < migrations/repair-suggestion.sql
--
-- Safe to read first. If a column already exists you'll get a
-- "duplicate column name" error on that line — that just means it's already
-- there; skip that one line and run the rest.
-- ============================================================================

-- Add the two columns the new shape needs (old table already has the rest)
ALTER TABLE Suggestion ADD COLUMN proposedById TEXT;
ALTER TABLE Suggestion ADD COLUMN resolvedAt TEXT;

-- Backfill the proposer from the old column name (old schema called it suggestedById)
UPDATE Suggestion
  SET proposedById = suggestedById
  WHERE (proposedById IS NULL OR proposedById = '') AND suggestedById IS NOT NULL;

-- Old-flow pending rows belong to the dead voting system and never met the new
-- evidence-grounded bar → resolve them as rejected (matches the main migration).
UPDATE Suggestion
  SET status = 'rejected',
      resolvedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE status = 'pending' AND resolvedAt IS NULL;

-- Remove the half-built leftover table from the failed swap, if present
DROP TABLE IF EXISTS Suggestion_new;

-- The old columns `suggestedById` and `suggestedNewValue` are left behind on
-- purpose — they're harmless. The app uses raw SQL that never selects them, so
-- extra columns don't break anything; leaving them avoids another risky rebuild.

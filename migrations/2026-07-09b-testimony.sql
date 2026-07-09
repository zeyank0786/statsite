-- Optional: pre-add the witness-testimony column on Suggestion.
--   turso db shell <your-db> < migrations/2026-07-09b-testimony.sql
-- You do NOT have to run this — the app adds the column automatically the
-- first time someone submits a testimony-only suggestion (additive, safe).
-- Running it up front just avoids that first-write detour.
-- (Errors with "duplicate column name" if already applied — that's fine.)

ALTER TABLE Suggestion ADD COLUMN testimony TEXT;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM pragma_table_info('Suggestion') WHERE name = 'testimony') = 1
  THEN 'PASS — Suggestion.testimony exists'
  ELSE 'FAIL'
END AS result;

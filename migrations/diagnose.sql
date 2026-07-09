-- ============================================================================
-- Diagnose the state of the Suggestion/Evidence rebuild on Turso.
-- Read-only. Run:  turso db shell <your-db> < migrations/diagnose.sql
-- Paste the output back and it tells us exactly which repair to run.
-- ============================================================================

-- 1. Which of the old/new tables currently exist?
SELECT 'TABLES PRESENT' AS section;
SELECT name FROM sqlite_master
WHERE type = 'table'
  AND name IN ('Suggestion', 'Suggestion_new', 'Evidence', 'Evidence_new')
ORDER BY name;

-- 2. Actual columns on the live Suggestion table
SELECT 'SUGGESTION COLUMNS' AS section;
SELECT group_concat(name, ', ') AS columns FROM pragma_table_info('Suggestion');

-- 3. Actual columns on the live Evidence table
SELECT 'EVIDENCE COLUMNS' AS section;
SELECT group_concat(name, ', ') AS columns FROM pragma_table_info('Evidence');

-- 4. Row counts so we know which copy holds the data
SELECT 'ROW COUNTS' AS section;
SELECT
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Suggestion')     AS has_Suggestion,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Suggestion_new') AS has_Suggestion_new,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Evidence')       AS has_Evidence,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Evidence_new')   AS has_Evidence_new;

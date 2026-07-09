-- ============================================================================
-- Verify the 4WARD full-rework migration ran correctly.
-- Read-only — safe to run any number of times.
--   turso db shell <your-db> < migrations/verify.sql
-- Every row should say PASS. Any FAIL means that piece of the migration
-- didn't apply — re-check the corresponding statement in
-- 2026-07-09-full-rework.sql.
-- ============================================================================

SELECT n AS "#", check_name AS "check", CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result
FROM (
  SELECT 1 AS n, 'Player.active column exists' AS check_name,
    (SELECT COUNT(*) FROM pragma_table_info('Player') WHERE name = 'active') = 1 AS ok
  UNION ALL SELECT 2, 'Player.archivedAt column exists',
    (SELECT COUNT(*) FROM pragma_table_info('Player') WHERE name = 'archivedAt') = 1
  UNION ALL SELECT 3, 'User.isAdmin column exists',
    (SELECT COUNT(*) FROM pragma_table_info('User') WHERE name = 'isAdmin') = 1
  UNION ALL SELECT 4, 'At least one admin exists (see admins list below)',
    (SELECT COUNT(*) FROM User WHERE isAdmin = 1) >= 1
  UNION ALL SELECT 5, 'StatVisibility table exists',
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'StatVisibility') = 1
  UNION ALL SELECT 6, 'StatPrerequisite table exists',
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'StatPrerequisite') = 1
  UNION ALL SELECT 7, 'StatLockOverride table exists',
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'StatLockOverride') = 1
  UNION ALL SELECT 8, 'EvidenceCategory table exists',
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'EvidenceCategory') = 1
  UNION ALL SELECT 9, 'SuggestionEvidence table exists',
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'SuggestionEvidence') = 1
  UNION ALL SELECT 10, 'Evidence has new shape (playerId, captionHidden)',
    (SELECT COUNT(*) FROM pragma_table_info('Evidence') WHERE name IN ('playerId', 'captionHidden')) = 2
  UNION ALL SELECT 11, 'Evidence dropped old statValueId column',
    (SELECT COUNT(*) FROM pragma_table_info('Evidence') WHERE name = 'statValueId') = 0
  UNION ALL SELECT 12, 'Suggestion has new shape (proposedById, resolvedAt)',
    (SELECT COUNT(*) FROM pragma_table_info('Suggestion') WHERE name IN ('proposedById', 'resolvedAt')) = 2
  UNION ALL SELECT 13, 'Suggestion dropped old suggestedNewValue column',
    (SELECT COUNT(*) FROM pragma_table_info('Suggestion') WHERE name = 'suggestedNewValue') = 0
  UNION ALL SELECT 14, 'No suggestions left stuck in old pending state',
    (SELECT COUNT(*) FROM Suggestion WHERE status = 'pending' AND resolvedAt IS NULL AND proposedById IS NULL) = 0
)
ORDER BY n;

-- Context (not pass/fail — just so you can eyeball the data survived):
SELECT '— roster —' AS info;
SELECT username, active, (archivedAt IS NOT NULL) AS archived FROM Player ORDER BY active DESC, username;

SELECT '— admins —' AS info;
SELECT email, isAdmin FROM User WHERE isAdmin = 1;

SELECT '— suggestion/evidence counts (history preserved) —' AS info;
SELECT
  (SELECT COUNT(*) FROM Suggestion) AS suggestions,
  (SELECT COUNT(*) FROM Evidence)   AS evidence,
  (SELECT COUNT(*) FROM StatHistory) AS stat_history_rows;

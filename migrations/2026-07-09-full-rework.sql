-- ============================================================================
-- 4WARD full rework migration — run ONCE against Turso (and once locally).
-- Order matters. ALTER TABLE ADD COLUMN fails if the column already exists,
-- so do not re-run this file after a successful pass.
-- ============================================================================

-- 1. Dynamic roster: Player.active / archivedAt
ALTER TABLE Player ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE Player ADD COLUMN archivedAt TEXT;

-- 2. Real admin auth: User.isAdmin
ALTER TABLE User ADD COLUMN isAdmin INTEGER NOT NULL DEFAULT 0;
UPDATE User SET isAdmin = 1 WHERE email = 'itzzedk@gmail.com';

-- 3. Per-player stat visibility (row with hidden=1 hides, no row = visible)
CREATE TABLE IF NOT EXISTS StatVisibility (
  id        TEXT PRIMARY KEY,
  statId    TEXT NOT NULL,
  playerId  TEXT NOT NULL,
  hidden    INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  UNIQUE(statId, playerId)
);

-- 4. Stat prerequisites (multiple rows per statId = AND logic)
CREATE TABLE IF NOT EXISTS StatPrerequisite (
  id                 TEXT PRIMARY KEY,
  statId             TEXT NOT NULL,
  requiredStatId     TEXT,
  requiredCategoryId TEXT,
  comparator         TEXT NOT NULL DEFAULT '>=',
  thresholdValue     INTEGER NOT NULL,
  createdAt          TEXT NOT NULL
);

-- 5. Manual lock overrides (beats computed prerequisites)
CREATE TABLE IF NOT EXISTS StatLockOverride (
  id          TEXT PRIMARY KEY,
  statId      TEXT NOT NULL,
  playerId    TEXT NOT NULL,
  forcedState TEXT NOT NULL CHECK (forcedState IN ('locked','unlocked')),
  createdAt   TEXT NOT NULL,
  UNIQUE(statId, playerId)
);

-- 6. Evidence rework: drop statValueId link, become a subject-posted board post.
--    Old rows are carried over best-effort (poster = the stat value's player).
CREATE TABLE Evidence_new (
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
INSERT INTO Evidence_new (id, playerId, mediaUrl, mediaType, cloudinaryPublicId, caption, captionHidden, createdAt, updatedAt)
  SELECT e.id, sv.playerId, e.url, 'image', '', e.description, 0, e.createdAt, e.createdAt
  FROM Evidence e
  JOIN StatValue sv ON e.statValueId = sv.id;
DROP TABLE Evidence;
ALTER TABLE Evidence_new RENAME TO Evidence;

CREATE TABLE IF NOT EXISTS EvidenceCategory (
  evidenceId TEXT NOT NULL,
  categoryId TEXT NOT NULL,
  PRIMARY KEY (evidenceId, categoryId)
);

-- 7. Suggestion rework. Old rows are preserved as resolved history:
--    old 'pending' rows belong to the dead flow, so they are closed out as
--    'rejected' with resolvedAt = migration time (they never met the new
--    evidence-grounded bar). approved/rejected rows keep their status.
CREATE TABLE Suggestion_new (
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
INSERT INTO Suggestion_new (id, playerId, proposedById, statId, delta, reason, status, createdAt, updatedAt, resolvedAt)
  SELECT id, playerId, suggestedById, statId, delta, reason,
         CASE WHEN status = 'pending' THEN 'rejected' ELSE status END,
         createdAt, updatedAt,
         CASE WHEN status = 'pending' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE updatedAt END
  FROM Suggestion;
DROP TABLE Suggestion;
ALTER TABLE Suggestion_new RENAME TO Suggestion;

-- Many-to-many: a suggestion can cite multiple evidence posts
CREATE TABLE IF NOT EXISTS SuggestionEvidence (
  suggestionId TEXT NOT NULL,
  evidenceId   TEXT NOT NULL,
  PRIMARY KEY (suggestionId, evidenceId)
);

-- Vote table is unchanged. Eligibility is enforced at the API layer.

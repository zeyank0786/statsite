/**
 * Core DDL for a benchmark database.
 *
 * The live schema is spread across prisma, migrations/*.sql and a long tail of
 * ad-hoc `ALTER TABLE ADD COLUMN` calls buried in route handlers. This file
 * reproduces that end state in one place so a benchmark database matches
 * production's shape — including the columns that only exist because some
 * route added them at runtime.
 *
 * Tables owned by an `ensure*()` helper are NOT listed here; the seed calls
 * those helpers directly so this file can't drift from them.
 */

export const CORE_TABLES = [
  `CREATE TABLE IF NOT EXISTS User (
     id TEXT NOT NULL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
     playerId TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updatedAt DATETIME NOT NULL, isAdmin INTEGER NOT NULL DEFAULT 0)`,

  `CREATE TABLE IF NOT EXISTS Player (
     id TEXT NOT NULL PRIMARY KEY, username TEXT NOT NULL UNIQUE, avatarUrl TEXT,
     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL,
     active INTEGER NOT NULL DEFAULT 1, archivedAt TEXT)`,

  `CREATE TABLE IF NOT EXISTS Category (
     id TEXT NOT NULL PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
     emoji TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,

  `CREATE TABLE IF NOT EXISTS Stat (
     id TEXT NOT NULL PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
     categoryId TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,

  `CREATE TABLE IF NOT EXISTS StatValue (
     id TEXT NOT NULL PRIMARY KEY, statId TEXT NOT NULL, playerId TEXT NOT NULL,
     value INTEGER NOT NULL DEFAULT 0, notes TEXT,
     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL,
     UNIQUE(statId, playerId))`,

  `CREATE TABLE IF NOT EXISTS StatHistory (
     id TEXT NOT NULL PRIMARY KEY, statValueId TEXT NOT NULL, oldValue INTEGER NOT NULL,
     newValue INTEGER NOT NULL, reason TEXT, changedById TEXT NOT NULL, source TEXT NOT NULL,
     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,

  `CREATE TABLE IF NOT EXISTS Suggestion (
     id TEXT PRIMARY KEY, playerId TEXT NOT NULL, proposedById TEXT NOT NULL,
     statId TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
     resolvedAt TEXT, testimony TEXT, batchId TEXT, ambitionId TEXT, groupGoalId TEXT)`,

  `CREATE TABLE IF NOT EXISTS Vote (
     id TEXT NOT NULL PRIMARY KEY, suggestionId TEXT NOT NULL, userId TEXT NOT NULL,
     choice TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(suggestionId, userId))`,

  `CREATE TABLE IF NOT EXISTS Evidence (
     id TEXT PRIMARY KEY, playerId TEXT NOT NULL, mediaUrl TEXT, mediaType TEXT,
     cloudinaryPublicId TEXT, caption TEXT, captionHidden INTEGER NOT NULL DEFAULT 0,
     createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, aiHints TEXT, aiHintsAt TEXT)`,

  `CREATE TABLE IF NOT EXISTS EvidenceCategory (
     evidenceId TEXT NOT NULL, categoryId TEXT NOT NULL, PRIMARY KEY (evidenceId, categoryId))`,

  `CREATE TABLE IF NOT EXISTS EvidenceRead (
     id TEXT PRIMARY KEY, evidenceId TEXT NOT NULL, userId TEXT NOT NULL, readAt TEXT NOT NULL,
     UNIQUE(evidenceId, userId))`,

  `CREATE TABLE IF NOT EXISTS SuggestionEvidence (
     suggestionId TEXT NOT NULL, evidenceId TEXT NOT NULL, PRIMARY KEY (suggestionId, evidenceId))`,

  `CREATE TABLE IF NOT EXISTS StatVisibility (
     id TEXT PRIMARY KEY, statId TEXT NOT NULL, playerId TEXT NOT NULL,
     hidden INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, UNIQUE(statId, playerId))`,

  `CREATE TABLE IF NOT EXISTS StatPrerequisite (
     id TEXT PRIMARY KEY, statId TEXT NOT NULL, requiredStatId TEXT, requiredCategoryId TEXT,
     comparator TEXT NOT NULL DEFAULT '>=', thresholdValue INTEGER NOT NULL, createdAt TEXT NOT NULL,
     groupId TEXT, groupLabel TEXT)`,

  `CREATE TABLE IF NOT EXISTS StatLockOverride (
     id TEXT PRIMARY KEY, statId TEXT NOT NULL, playerId TEXT NOT NULL,
     forcedState TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(statId, playerId))`,

  `CREATE TABLE IF NOT EXISTS FeatureLock (
     id TEXT PRIMARY KEY, playerId TEXT NOT NULL, feature TEXT NOT NULL, reason TEXT,
     createdById TEXT, createdAt TEXT NOT NULL, UNIQUE(playerId, feature))`,

  `CREATE TABLE IF NOT EXISTS Comment (
     id TEXT NOT NULL PRIMARY KEY, playerId TEXT NOT NULL, authorId TEXT NOT NULL,
     body TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,

  `CREATE TABLE IF NOT EXISTS ReviewCycle (
     id TEXT NOT NULL PRIMARY KEY, label TEXT NOT NULL, status TEXT NOT NULL,
     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, revealedAt DATETIME)`,

  `CREATE TABLE IF NOT EXISTS ReviewSession (
     id TEXT NOT NULL PRIMARY KEY, cycleId TEXT NOT NULL, targetPlayerId TEXT NOT NULL,
     editorId TEXT, status TEXT NOT NULL, lastEditedById TEXT, submittedAt DATETIME,
     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL,
     UNIQUE(cycleId, targetPlayerId))`,

  `CREATE TABLE IF NOT EXISTS ReviewParticipant (
     id TEXT NOT NULL PRIMARY KEY, sessionId TEXT NOT NULL, playerId TEXT NOT NULL,
     role TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(sessionId, playerId))`,

  `CREATE TABLE IF NOT EXISTS ReviewSessionStat (
     id TEXT NOT NULL PRIMARY KEY, sessionId TEXT NOT NULL, statId TEXT NOT NULL,
     oldValue INTEGER NOT NULL, proposedValue INTEGER, note TEXT,
     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL)`,

  // Message board (migrations 003/004, plus the stat-reference columns a route added later)
  `CREATE TABLE IF NOT EXISTS Message (
     id TEXT PRIMARY KEY, content TEXT NOT NULL, authorId TEXT NOT NULL,
     createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
     referencedStatId TEXT, referencedPlayerId TEXT)`,

  `CREATE TABLE IF NOT EXISTS MessageReply (
     id TEXT PRIMARY KEY, messageId TEXT NOT NULL, content TEXT NOT NULL,
     authorId TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,

  `CREATE TABLE IF NOT EXISTS MessageReaction (
     id TEXT PRIMARY KEY, messageId TEXT NOT NULL, userId TEXT NOT NULL, emoji TEXT NOT NULL,
     createdAt TEXT NOT NULL, UNIQUE(messageId, userId, emoji))`,

  `CREATE TABLE IF NOT EXISTS MessageMention (
     id TEXT PRIMARY KEY, messageId TEXT NOT NULL, type TEXT NOT NULL, targetId TEXT NOT NULL,
     createdAt TEXT NOT NULL)`,

  `CREATE TABLE IF NOT EXISTS MessageRead (
     id TEXT PRIMARY KEY, messageId TEXT NOT NULL, userId TEXT NOT NULL, readAt TEXT NOT NULL,
     UNIQUE(messageId, userId))`,

  `CREATE TABLE IF NOT EXISTS Target (
     id TEXT PRIMARY KEY, playerId TEXT NOT NULL, statCode TEXT NOT NULL, statLabel TEXT NOT NULL,
     createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(playerId, statCode))`,

  `CREATE TABLE IF NOT EXISTS VoteReminder (playerId TEXT PRIMARY KEY, lastSentAt TEXT NOT NULL)`,

  `CREATE TABLE IF NOT EXISTS StatNote (
     id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, statId TEXT NOT NULL, authorId TEXT NOT NULL,
     body TEXT NOT NULL, createdAt TEXT NOT NULL)`,
];

/**
 * Columns added at runtime by route handlers rather than by a migration.
 * Applied individually because each throws once it already exists.
 */
export const DRIFT_COLUMNS = [
  `ALTER TABLE Player ADD COLUMN recapSeenAt TEXT`,
  `ALTER TABLE Player ADD COLUMN timezone TEXT`,
];

/** Pre-existing indexes, so a benchmark starts from production's real baseline. */
export const BASELINE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_message_authorid ON Message(authorId)`,
  `CREATE INDEX IF NOT EXISTS idx_message_createdat ON Message(createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_messagereply_messageid ON MessageReply(messageId)`,
  `CREATE INDEX IF NOT EXISTS idx_messagereaction_messageid ON MessageReaction(messageId)`,
  `CREATE INDEX IF NOT EXISTS idx_messagemention_messageid ON MessageMention(messageId)`,
  `CREATE INDEX IF NOT EXISTS idx_messageread_userid ON MessageRead(userId)`,
  `CREATE INDEX IF NOT EXISTS idx_messageread_messageid ON MessageRead(messageId)`,
  `CREATE INDEX IF NOT EXISTS idx_statnote_sessionid ON StatNote(sessionId)`,
  `CREATE INDEX IF NOT EXISTS idx_statnote_statid ON StatNote(statId)`,
  `CREATE INDEX IF NOT EXISTS Comment_playerId_idx ON Comment(playerId)`,
];

-- ============================================================================
-- Read-reduction indexes.
--
-- Turso bills rows READ, not rows returned. Every `ORDER BY createdAt DESC
-- LIMIT 30` in this app was reading and sorting an entire table to produce 30
-- rows, and those queries run on 15-30 second polling timers, per open tab.
-- These indexes turn each of those into a bounded range scan.
--
-- Safe to re-run: every statement is IF NOT EXISTS, and no table is rewritten.
-- Adding an index costs write throughput, which this app has almost none of —
-- a few dozen writes a day against tens of thousands of reads a minute.
-- ============================================================================

-- StatHistory: the single hottest table. Read in full by the notification
-- feed, the activity ticker and every achievement computation.
CREATE INDEX IF NOT EXISTS idx_stathistory_createdat    ON StatHistory(createdAt);
CREATE INDEX IF NOT EXISTS idx_stathistory_statvalueid  ON StatHistory(statValueId);
-- Suggestion listing looks up "what did this approval actually move?" by source.
CREATE INDEX IF NOT EXISTS idx_stathistory_source_created ON StatHistory(source, createdAt);

-- StatValue: the composite unique index is (statId, playerId), so anything
-- starting from a player — every per-player page — could not use it.
CREATE INDEX IF NOT EXISTS idx_statvalue_playerid       ON StatValue(playerId);

-- Suggestion: pending-count in /api/pulse, the listing, and proposal tallies.
CREATE INDEX IF NOT EXISTS idx_suggestion_status_created ON Suggestion(status, createdAt);
CREATE INDEX IF NOT EXISTS idx_suggestion_playerid      ON Suggestion(playerId);
CREATE INDEX IF NOT EXISTS idx_suggestion_proposedbyid  ON Suggestion(proposedById);
CREATE INDEX IF NOT EXISTS idx_suggestion_resolvedat    ON Suggestion(resolvedAt);
CREATE INDEX IF NOT EXISTS idx_suggestion_batchid       ON Suggestion(batchId);
CREATE INDEX IF NOT EXISTS idx_suggestion_statid        ON Suggestion(statId);
-- An EXPRESSION index. The resolved-history listing orders by
-- COALESCE(resolvedAt, createdAt), which no plain column index can serve, so
-- SQLite was sorting the entire Suggestion table in a temp B-tree on every
-- poll to return the newest 20. Indexing the expression itself lets the
-- planner walk it in order and stop at the limit, with no change to the query.
CREATE INDEX IF NOT EXISTS idx_suggestion_sortat        ON Suggestion(COALESCE(resolvedAt, createdAt));

-- Vote: (suggestionId, userId) exists as a unique constraint, but the
-- per-user tally in social counts starts from userId.
CREATE INDEX IF NOT EXISTS idx_vote_userid              ON Vote(userId);

-- Evidence: board listing, unread counts, per-player galleries.
CREATE INDEX IF NOT EXISTS idx_evidence_createdat       ON Evidence(createdAt);
CREATE INDEX IF NOT EXISTS idx_evidence_playerid        ON Evidence(playerId);
CREATE INDEX IF NOT EXISTS idx_evidenceread_userid      ON EvidenceRead(userId);
CREATE INDEX IF NOT EXISTS idx_evidenceread_evidenceid  ON EvidenceRead(evidenceId);
CREATE INDEX IF NOT EXISTS idx_evidencecategory_catid   ON EvidenceCategory(categoryId);
-- PK is (suggestionId, evidenceId); the reverse direction had no index.
CREATE INDEX IF NOT EXISTS idx_suggestionevidence_evid  ON SuggestionEvidence(evidenceId);

-- Per-player visibility/lock lookups.
CREATE INDEX IF NOT EXISTS idx_statvisibility_playerid  ON StatVisibility(playerId);
CREATE INDEX IF NOT EXISTS idx_statlockoverride_playerid ON StatLockOverride(playerId);
CREATE INDEX IF NOT EXISTS idx_featurelock_playerid     ON FeatureLock(playerId);

-- Review sessions: polled while a review is in progress.
CREATE INDEX IF NOT EXISTS idx_reviewsession_cycleid    ON ReviewSession(cycleId);
CREATE INDEX IF NOT EXISTS idx_reviewsession_target     ON ReviewSession(targetPlayerId);
CREATE INDEX IF NOT EXISTS idx_reviewsessionstat_session ON ReviewSessionStat(sessionId);
CREATE INDEX IF NOT EXISTS idx_reviewparticipant_session ON ReviewParticipant(sessionId);

-- Achievement bookkeeping, read on every feed build.
CREATE INDEX IF NOT EXISTS idx_achievementearned_player ON AchievementEarned(playerId);
-- The feed and the ticker both take the 30 most recent, newest first.
CREATE INDEX IF NOT EXISTS idx_achievementearned_earnedat ON AchievementEarned(earnedAt);

-- Feature tables that feed the notification bell. Each is read newest-first
-- with a small limit, so each gets the expression its ORDER BY actually uses.
CREATE INDEX IF NOT EXISTS idx_commitment_playerid      ON Commitment(playerId);
CREATE INDEX IF NOT EXISTS idx_commitment_status        ON Commitment(status);
CREATE INDEX IF NOT EXISTS idx_commitment_sortat        ON Commitment(COALESCE(resolvedAt, createdAt));
CREATE INDEX IF NOT EXISTS idx_commitment_resolvedat    ON Commitment(resolvedAt);
CREATE INDEX IF NOT EXISTS idx_ambition_completedat     ON Ambition(completedAt);
CREATE INDEX IF NOT EXISTS idx_trainingresult_player    ON TrainingResult(playerId, createdAt);
CREATE INDEX IF NOT EXISTS idx_mention_mentionedid      ON Mention(mentionedId, createdAt);
CREATE INDEX IF NOT EXISTS idx_nudge_target              ON Nudge(toPlayerId, createdAt);
CREATE INDEX IF NOT EXISTS idx_broadcast_createdat       ON Broadcast(createdAt);
CREATE INDEX IF NOT EXISTS idx_ambition_player_status    ON Ambition(playerId, status);
CREATE INDEX IF NOT EXISTS idx_reminderfire_player       ON ReminderFire(playerId, firedAt);

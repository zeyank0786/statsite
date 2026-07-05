-- Drop the old StatNote table and recreate without FK to ReviewSession
-- This allows notes to persist after review sessions are closed

-- First, create a backup of existing notes
CREATE TABLE StatNote_backup AS SELECT * FROM StatNote;

-- Drop the old table
DROP TABLE IF EXISTS StatNote;

-- Recreate without FK to ReviewSession (notes persist independently)
CREATE TABLE StatNote (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  statId TEXT NOT NULL,
  reviewerId TEXT NOT NULL,
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (reviewerId) REFERENCES Player(id)
);

-- Restore the data
INSERT INTO StatNote SELECT * FROM StatNote_backup;

-- Drop the backup
DROP TABLE StatNote_backup;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_statnote_sessionid ON StatNote(sessionId);
CREATE INDEX IF NOT EXISTS idx_statnote_statid ON StatNote(statId);

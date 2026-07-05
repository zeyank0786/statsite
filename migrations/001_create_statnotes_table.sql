-- Create StatNote table for review session notes and comments
CREATE TABLE IF NOT EXISTS StatNote (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  statId TEXT NOT NULL,
  reviewerId TEXT NOT NULL,
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (sessionId) REFERENCES ReviewSession(id),
  FOREIGN KEY (reviewerId) REFERENCES Player(id)
);

-- Create index on sessionId for faster lookups
CREATE INDEX IF NOT EXISTS idx_statnote_sessionid ON StatNote(sessionId);

-- Create index on statId for faster lookups
CREATE INDEX IF NOT EXISTS idx_statnote_statid ON StatNote(statId);

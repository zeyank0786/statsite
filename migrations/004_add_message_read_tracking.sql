-- Track which messages have been read by which users

CREATE TABLE IF NOT EXISTS MessageRead (
  id TEXT PRIMARY KEY,
  messageId TEXT NOT NULL,
  userId TEXT NOT NULL,
  readAt TEXT NOT NULL,
  UNIQUE(messageId, userId),
  FOREIGN KEY (messageId) REFERENCES Message(id),
  FOREIGN KEY (userId) REFERENCES Player(id)
);

CREATE INDEX IF NOT EXISTS idx_messageread_userid ON MessageRead(userId);
CREATE INDEX IF NOT EXISTS idx_messageread_messageid ON MessageRead(messageId);

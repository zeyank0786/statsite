-- Message Board Schema

-- Main messages table
CREATE TABLE IF NOT EXISTS Message (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  authorId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (authorId) REFERENCES Player(id)
);

-- Replies to messages (threaded)
CREATE TABLE IF NOT EXISTS MessageReply (
  id TEXT PRIMARY KEY,
  messageId TEXT NOT NULL,
  content TEXT NOT NULL,
  authorId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (messageId) REFERENCES Message(id),
  FOREIGN KEY (authorId) REFERENCES Player(id)
);

-- Reactions (likes, emojis, etc)
CREATE TABLE IF NOT EXISTS MessageReaction (
  id TEXT PRIMARY KEY,
  messageId TEXT NOT NULL,
  userId TEXT NOT NULL,
  emoji TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(messageId, userId, emoji),
  FOREIGN KEY (messageId) REFERENCES Message(id),
  FOREIGN KEY (userId) REFERENCES Player(id)
);

-- Mentions/Tags in messages (for @player and #stat tags)
CREATE TABLE IF NOT EXISTS MessageMention (
  id TEXT PRIMARY KEY,
  messageId TEXT NOT NULL,
  type TEXT NOT NULL,
  targetId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (messageId) REFERENCES Message(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_message_authorid ON Message(authorId);
CREATE INDEX IF NOT EXISTS idx_message_createdat ON Message(createdAt);
CREATE INDEX IF NOT EXISTS idx_messagereply_messageid ON MessageReply(messageId);
CREATE INDEX IF NOT EXISTS idx_messagereaction_messageid ON MessageReaction(messageId);
CREATE INDEX IF NOT EXISTS idx_messagemention_messageid ON MessageMention(messageId);

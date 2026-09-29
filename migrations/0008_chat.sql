-- Chat: private messages between friends and public channels (the Lobby
-- and channels admins create), which players join when an admin lets
-- them. Admins delete messages and mute players; players report messages.
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
INSERT INTO channels (id, name, created_by, created_at) SELECT 1, 'Lobby', 0, 0 WHERE NOT EXISTS (SELECT 1 FROM channels WHERE id = 1);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  added_by INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS channel_members_user ON channel_members(user_id);

-- conv is 'c<channel id>' or 'd<smaller user id>:<larger user id>'
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_by INTEGER
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conv, id);
CREATE INDEX IF NOT EXISTS messages_user ON messages(user_id, created_at);

CREATE TABLE IF NOT EXISTS chat_reads (
  user_id INTEGER NOT NULL,
  conv TEXT NOT NULL,
  last_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, conv)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  reporter_id INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE users ADD COLUMN muted_until INTEGER;

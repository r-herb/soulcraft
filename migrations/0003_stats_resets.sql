-- One row per player per active day (sign-in or start-up), for statistics.
CREATE TABLE IF NOT EXISTS activity (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
-- One-time password reset links sent by email (only the token hash is kept).
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets (user_id);

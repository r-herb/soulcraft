-- Ideas and problem reports sent from the game's pause menu, read by the
-- admin in the Feedback tab. ctx holds the game version, device and world.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  ctx TEXT,
  created_at INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

-- Analytics for the superadmin: each sign-in and visit (when, where from,
-- which device and screen), and play time per day, mode and world.
-- The superadmin's own player account (to play from the admin panel).
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  device TEXT,
  ua TEXT,
  screen TEXT
);
CREATE INDEX IF NOT EXISTS visits_user ON visits (user_id, at);
CREATE TABLE IF NOT EXISTS play_time (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  mode TEXT NOT NULL,
  world TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, mode, world)
);
ALTER TABLE users ADD COLUMN last_visit INTEGER;
ALTER TABLE users ADD COLUMN super_link INTEGER NOT NULL DEFAULT 0;

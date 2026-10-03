-- Push notifications (calls and game invites reach a friend whose game is
-- closed): the server's own VAPID key pair, each browser's subscription,
-- and the last call or invite waiting for each player (a minute at most).
CREATE TABLE IF NOT EXISTS app_keys (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  lang TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs (user_id);
CREATE TABLE IF NOT EXISTS pending_events (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind)
);

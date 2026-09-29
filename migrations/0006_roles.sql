-- Roles and moderation: the superadmin (from secrets) can make players
-- admins; admins add players, ban them for a while, and moderate chats.
-- Every admin action is written to the audit log.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player';
ALTER TABLE users ADD COLUMN banned_until INTEGER;
ALTER TABLE users ADD COLUMN ban_reason TEXT;

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id INTEGER,
  target_name TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS audit_at ON audit(at);

-- The economy: every signed-in player has coins in hand and in the bank;
-- the exchange buys and sells goods at prices that move with what players
-- sell (more supply, lower price); the central bank keeps the gold reserve.
CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY,
  cash INTEGER NOT NULL DEFAULT 20,
  bank INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- supply goes up when players sell a good to the exchange, down when they buy
CREATE TABLE IF NOT EXISTS market (
  item TEXT PRIMARY KEY,
  base INTEGER NOT NULL,
  supply INTEGER NOT NULL DEFAULT 0,
  traded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  item TEXT,
  qty INTEGER,
  amount INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, at);

CREATE TABLE IF NOT EXISTS econ_state (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO econ_state (key, value) VALUES ('gold_reserve', 500);

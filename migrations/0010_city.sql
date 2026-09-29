-- The city: salaries for quests, the lottery and the players' market.
-- Quests a player completed, one row per quest per Soulcraft month.
CREATE TABLE IF NOT EXISTS quest_log (
  user_id INTEGER NOT NULL,
  month INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, month, ref)
);

-- salaries paid (one per player per month)
CREATE TABLE IF NOT EXISTS salaries (
  user_id INTEGER NOT NULL,
  month INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, month)
);

-- lottery tickets, and the draws (one per month)
CREATE TABLE IF NOT EXISTS lottery_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lottery_draw ON lottery_tickets(draw, user_id);
CREATE TABLE IF NOT EXISTS lottery_draws (
  draw INTEGER PRIMARY KEY,
  winner INTEGER,
  ticket INTEGER,
  pot INTEGER NOT NULL,
  tickets INTEGER NOT NULL,
  at INTEGER NOT NULL
);

-- goods players offer each other: the goods wait here until bought or taken back
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller INTEGER NOT NULL,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  buyer INTEGER,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS offers_open ON offers(status, created_at);

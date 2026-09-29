-- City missions each player has been paid for (once each).
CREATE TABLE IF NOT EXISTS missions_done (
  user_id INTEGER NOT NULL,
  mission TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, mission)
);

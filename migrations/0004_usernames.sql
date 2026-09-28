-- Short usernames to sign in with (for example "teo"), besides email and
-- phone. Stored in lower case; several users may have none (NULL).
ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

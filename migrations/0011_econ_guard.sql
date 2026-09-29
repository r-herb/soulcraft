-- Guarding the economy: an admin can freeze a wallet (no trading until then).
ALTER TABLE wallets ADD COLUMN frozen_until INTEGER;
ALTER TABLE wallets ADD COLUMN frozen_reason TEXT;
CREATE INDEX IF NOT EXISTS ledger_kind_at ON ledger(kind, at);

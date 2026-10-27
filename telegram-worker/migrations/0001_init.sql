-- AN CHÂU Telegram Worker: database contains only mappings, one-time code hashes and delivery receipts.
-- The plaintext pairing code and Telegram bot token are never stored in D1.
CREATE TABLE IF NOT EXISTS telegram_links (
  email TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  chat_id INTEGER NOT NULL UNIQUE,
  linked_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  uid TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sending','sent','retry')),
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_notifications (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'retry',
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_updates (
  update_id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_status ON deliveries(status,updated_ms);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_notifications(status,updated_ms);

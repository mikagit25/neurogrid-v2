-- ============================================================
-- 020: Open API keys + Telegram bot
-- ============================================================

-- API keys for external integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(128) NOT NULL,
  key_hash     VARCHAR(128) NOT NULL UNIQUE,   -- bcrypt hash
  key_prefix   VARCHAR(12) NOT NULL,           -- first 8 chars for display
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Telegram bot connections
CREATE TABLE IF NOT EXISTS telegram_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  chat_id       BIGINT NOT NULL,
  username      VARCHAR(128),
  first_name    VARCHAR(128),
  notify_alerts    BOOLEAN NOT NULL DEFAULT true,
  notify_orders    BOOLEAN NOT NULL DEFAULT false,
  notify_pnl       BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tg_chat ON telegram_connections(chat_id);

-- Telegram webhook verification tokens
CREATE TABLE IF NOT EXISTS telegram_tokens (
  token      VARCHAR(64) PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

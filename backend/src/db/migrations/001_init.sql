-- NeuroGrid v2: initial schema

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  balance       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        VARCHAR(20) NOT NULL CHECK (platform IN ('ozon', 'wb', 'amazon', 'etsy')),
  credentials_enc TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'disabled')),
  display_name    VARCHAR(255),
  last_verified_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

CREATE TABLE IF NOT EXISTS scenarios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         VARCHAR(50) UNIQUE NOT NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT NOT NULL,
  platforms    VARCHAR(20)[] NOT NULL,
  price        NUMERIC(10, 2) NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenario_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  scenario_id   UUID NOT NULL REFERENCES scenarios(id),
  connection_id UUID REFERENCES marketplace_connections(id),
  input_data    JSONB NOT NULL DEFAULT '{}',
  status        VARCHAR(20) NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'success', 'error')),
  result        JSONB,
  error_message TEXT,
  cost          NUMERIC(10, 2),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(20) NOT NULL CHECK (type IN ('topup', 'charge')),
  amount      NUMERIC(10, 2) NOT NULL,
  run_id      UUID REFERENCES scenario_runs(id),
  provider_id VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       VARCHAR(50) NOT NULL,
  text       TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_connections_user ON marketplace_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_user ON scenario_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON scenario_runs(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);

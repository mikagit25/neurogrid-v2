CREATE TABLE IF NOT EXISTS autopilot_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES marketplace_connections(id) ON DELETE SET NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'running',  -- running|done|error
  product_name VARCHAR(255),
  product_data JSONB NOT NULL DEFAULT '{}',             -- photos, description, characteristics
  plan         JSONB,                                    -- approved plan with selected actions
  run_ids      JSONB NOT NULL DEFAULT '{}',             -- { "card-generator": runId, ... }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS autopilot_sessions_user_idx ON autopilot_sessions(user_id);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES marketplace_connections(id) ON DELETE CASCADE,
  sku           VARCHAR(100),      -- null = all products on this connection
  name          VARCHAR(255) NOT NULL DEFAULT '',
  strategy      VARCHAR(30) NOT NULL DEFAULT 'margin', -- margin|competitive|fixed|dynamic
  config        JSONB NOT NULL DEFAULT '{}',
  enabled       BOOLEAN NOT NULL DEFAULT true,
  last_applied_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_rules_user_idx ON pricing_rules(user_id);

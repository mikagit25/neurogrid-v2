CREATE TABLE user_automations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_slug   VARCHAR(100) NOT NULL,
  connection_id   UUID REFERENCES marketplace_connections(id) ON DELETE SET NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  schedule        VARCHAR(20) NOT NULL DEFAULT 'daily',  -- 'hourly' | 'daily' | 'weekly'
  auto_apply      BOOLEAN NOT NULL DEFAULT false,         -- publish without user approval
  settings        JSONB NOT NULL DEFAULT '{}',
  last_run_at     TIMESTAMPTZ,
  last_run_status VARCHAR(20),                            -- 'success' | 'error' | 'skipped'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scenario_slug, connection_id)
);

CREATE INDEX idx_automations_user ON user_automations(user_id);
CREATE INDEX idx_automations_enabled ON user_automations(enabled) WHERE enabled = true;

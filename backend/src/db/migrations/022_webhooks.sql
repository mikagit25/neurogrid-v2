-- Sprint 11: Outbound webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret      VARCHAR(128),
  events      TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  last_status INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id  UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event       VARCHAR(64) NOT NULL,
  payload     JSONB NOT NULL,
  status_code INTEGER,
  response    TEXT,
  duration_ms INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_wh ON webhook_deliveries(webhook_id, created_at DESC);

-- onboarding_progress: track which checklist steps are done per user
CREATE TABLE IF NOT EXISTS onboarding_progress (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  steps_done  TEXT[] NOT NULL DEFAULT '{}',
  dismissed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

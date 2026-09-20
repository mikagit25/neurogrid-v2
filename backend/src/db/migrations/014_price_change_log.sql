-- 014: price change history log
CREATE TABLE IF NOT EXISTS price_change_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id       UUID REFERENCES pricing_rules(id) ON DELETE SET NULL,
  connection_id UUID REFERENCES marketplace_connections(id) ON DELETE CASCADE,
  platform      VARCHAR(10) NOT NULL,
  sku           VARCHAR(128) NOT NULL,
  title         VARCHAR(512),
  old_price     NUMERIC(10,2) NOT NULL,
  new_price     NUMERIC(10,2) NOT NULL,
  reason        VARCHAR(255),
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_log_user ON price_change_log(user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_log_rule ON price_change_log(rule_id, applied_at DESC);

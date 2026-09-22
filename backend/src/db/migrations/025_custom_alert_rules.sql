-- ============================================================
-- 025: user-defined custom alert rules
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_alert_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(256) NOT NULL,
  rule_type    VARCHAR(64) NOT NULL,   -- stock_low | price_change | rating_drop | drr_high | no_sales | review_rate_low
  condition    JSONB NOT NULL DEFAULT '{}', -- {platform?, sku?, connection_id?} filters
  threshold    NUMERIC(12,4) NOT NULL,  -- the numeric threshold value
  comparison   VARCHAR(8) NOT NULL DEFAULT 'lt',  -- lt | gt | lte | gte | change_pct
  enabled      BOOLEAN NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  fire_count   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_rules_user ON custom_alert_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_rules_enabled ON custom_alert_rules(enabled) WHERE enabled = true;

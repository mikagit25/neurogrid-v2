-- ============================================================
-- 015: advertising records, alert rules, alert events
-- ============================================================

-- Ad spend per SKU per day (synced from marketplace ad APIs)
CREATE TABLE IF NOT EXISTS advertising_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES marketplace_connections(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      VARCHAR(10) NOT NULL,
  date          DATE NOT NULL,
  sku           VARCHAR(128),
  campaign_id   VARCHAR(128) NOT NULL DEFAULT '',
  campaign_name VARCHAR(512),
  impressions   INT NOT NULL DEFAULT 0,
  clicks        INT NOT NULL DEFAULT 0,
  spend         NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders        INT NOT NULL DEFAULT 0,
  ad_revenue    NUMERIC(12,2) NOT NULL DEFAULT 0,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, date, sku, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_user_date ON advertising_records(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_sku       ON advertising_records(user_id, platform, sku, date DESC);

-- User-defined alert rules
CREATE TABLE IF NOT EXISTS alert_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(64) NOT NULL,
  -- types: low_stock | pnl_negative | sales_drop | high_returns | competitor_price | position_drop
  name       VARCHAR(256) NOT NULL,
  platform   VARCHAR(10),   -- NULL = all platforms
  sku        VARCHAR(128),  -- NULL = all SKUs
  threshold  NUMERIC(12,4), -- meaning depends on type (units, percent, etc.)
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules(user_id, is_active);

-- Triggered alert history
CREATE TABLE IF NOT EXISTS alert_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id      uuid REFERENCES alert_rules(id) ON DELETE SET NULL,
  type         VARCHAR(64) NOT NULL,
  platform     VARCHAR(10),
  sku          VARCHAR(128),
  sku_title    VARCHAR(512),
  value        NUMERIC(12,4),
  threshold    NUMERIC(12,4),
  message      TEXT NOT NULL,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_events_user ON alert_events(user_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_rule ON alert_events(rule_id);

-- Seed 2 default alert rules for existing users
INSERT INTO alert_rules (user_id, type, name, threshold)
SELECT id, 'low_stock',    'Критически низкий остаток', 10 FROM users
ON CONFLICT DO NOTHING;
INSERT INTO alert_rules (user_id, type, name, threshold)
SELECT id, 'pnl_negative', 'SKU уходит в минус по P&L', 0  FROM users
ON CONFLICT DO NOTHING;

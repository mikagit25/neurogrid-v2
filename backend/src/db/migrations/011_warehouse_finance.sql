-- ============================================================
-- 011: warehouse inventory + financial analytics + subscriptions
-- ============================================================

-- User product catalog (purchase prices, titles)
CREATE TABLE IF NOT EXISTS user_catalog (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     VARCHAR(10) NOT NULL,   -- 'wb' | 'ozon'
  sku          VARCHAR(128) NOT NULL,  -- nmId for WB, product_id for Ozon
  title        VARCHAR(512),
  barcode      VARCHAR(128),
  purchase_price NUMERIC(10,2),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, sku)
);
CREATE INDEX IF NOT EXISTS idx_catalog_user ON user_catalog(user_id);

-- Stock snapshots (hourly sync from marketplace APIs)
CREATE TABLE IF NOT EXISTS stock_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id  uuid NOT NULL REFERENCES marketplace_connections(id) ON DELETE CASCADE,
  platform       VARCHAR(10) NOT NULL,
  sku            VARCHAR(128) NOT NULL,
  title          VARCHAR(512),
  warehouse_type VARCHAR(10) NOT NULL DEFAULT 'fbo',  -- 'fbo' | 'fbs'
  warehouse_name VARCHAR(255),
  quantity       INT NOT NULL DEFAULT 0,
  snapped_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_user_snap  ON stock_snapshots(user_id, snapped_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_conn_snap  ON stock_snapshots(connection_id, snapped_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_sku        ON stock_snapshots(user_id, platform, sku, snapped_at DESC);

-- Finance records (from marketplace weekly reports / detail reports)
CREATE TABLE IF NOT EXISTS finance_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES marketplace_connections(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      VARCHAR(10) NOT NULL,
  period_from   DATE NOT NULL,
  period_to     DATE NOT NULL,
  sku           VARCHAR(128),
  title         VARCHAR(512),
  quantity      INT NOT NULL DEFAULT 0,
  revenue       NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission    NUMERIC(12,2) NOT NULL DEFAULT 0,
  logistics     NUMERIC(12,2) NOT NULL DEFAULT 0,
  penalty       NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_payout    NUMERIC(12,2) NOT NULL DEFAULT 0,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, period_from, period_to, sku)
);
CREATE INDEX IF NOT EXISTS idx_finance_user    ON finance_records(user_id, period_from DESC);
CREATE INDEX IF NOT EXISTS idx_finance_conn    ON finance_records(connection_id, period_from DESC);
CREATE INDEX IF NOT EXISTS idx_finance_sku     ON finance_records(user_id, sku, period_from DESC);

-- Subscriptions / SaaS plans
CREATE TABLE IF NOT EXISTS subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  plan       VARCHAR(16) NOT NULL DEFAULT 'free',  -- 'free' | 'start' | 'business'
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- Auto-create free subscription for existing users
INSERT INTO subscriptions (user_id, plan)
SELECT id, 'free' FROM users
ON CONFLICT (user_id) DO NOTHING;

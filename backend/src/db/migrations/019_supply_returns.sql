-- ============================================================
-- 019: Supply chain forecasting + Returns center
-- ============================================================

-- Restock forecast per SKU/warehouse
CREATE TABLE IF NOT EXISTS restock_forecasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id   uuid REFERENCES marketplace_connections(id) ON DELETE SET NULL,
  platform        VARCHAR(10) NOT NULL,
  sku             VARCHAR(128) NOT NULL,
  title           VARCHAR(512),
  current_stock   INT NOT NULL DEFAULT 0,
  avg_daily_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  days_left       INT,           -- stock / avg_daily_sales
  reorder_point   INT,           -- below this = urgent
  reorder_qty     INT,           -- suggested order quantity
  status          VARCHAR(20) NOT NULL DEFAULT 'ok', -- ok | warning | critical | out_of_stock
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_restock_user ON restock_forecasts(user_id, status, days_left);

-- Purchase orders (planned restocks)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      VARCHAR(10) NOT NULL,
  sku           VARCHAR(128) NOT NULL,
  title         VARCHAR(512),
  qty           INT NOT NULL,
  unit_cost     NUMERIC(10,2),
  total_cost    NUMERIC(12,2),
  status        VARCHAR(20) NOT NULL DEFAULT 'planned',  -- planned | ordered | in_transit | received | cancelled
  supplier      VARCHAR(256),
  notes         TEXT,
  expected_at   DATE,
  received_at   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_user ON purchase_orders(user_id, status, expected_at);

-- Returns tracking
CREATE TABLE IF NOT EXISTS return_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id   uuid REFERENCES marketplace_connections(id) ON DELETE SET NULL,
  platform        VARCHAR(10) NOT NULL,
  sku             VARCHAR(128) NOT NULL,
  title           VARCHAR(512),
  order_id        VARCHAR(128),
  return_id       VARCHAR(128),
  qty             INT NOT NULL DEFAULT 1,
  reason          VARCHAR(256),
  reason_code     VARCHAR(64),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | refunded | resellable
  refund_amount   NUMERIC(10,2),
  action          VARCHAR(20),   -- resell | dispose | repair | supplier_claim
  notes           TEXT,
  return_date     DATE,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_returns_user ON return_items(user_id, status, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_returns_sku  ON return_items(user_id, sku, return_date DESC);

-- Return reason analytics (aggregated)
CREATE TABLE IF NOT EXISTS return_analytics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      VARCHAR(10) NOT NULL,
  sku           VARCHAR(128) NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  total_orders  INT NOT NULL DEFAULT 0,
  total_returns INT NOT NULL DEFAULT 0,
  return_rate   NUMERIC(5,2),   -- %
  top_reason    VARCHAR(256),
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, sku, period_start)
);

-- ============================================================
-- 026: supplier catalogue
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(256) NOT NULL,
  contact_name   VARCHAR(128),
  email          VARCHAR(256),
  phone          VARCHAR(64),
  lead_time_days INT NOT NULL DEFAULT 14,
  min_order_qty  INT,
  payment_terms  VARCHAR(128),
  notes          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_user ON suppliers(user_id);

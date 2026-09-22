-- ============================================================
-- 018: Product launch sequencer + AI review responses
-- ============================================================

-- Launch campaigns: multi-step product launch plans
CREATE TABLE IF NOT EXISTS launch_campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(256) NOT NULL,
  platform     VARCHAR(10) NOT NULL,
  sku          VARCHAR(128) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft | active | paused | completed
  target_sales INT,
  target_position INT,
  budget       NUMERIC(12,2),
  notes        TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_launch_user ON launch_campaigns(user_id, status);

-- Individual steps in a launch campaign
CREATE TABLE IF NOT EXISTS launch_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES launch_campaigns(id) ON DELETE CASCADE,
  step_order    INT NOT NULL,
  type          VARCHAR(30) NOT NULL,  -- seo_optimization | price_discount | ad_boost | self_purchase | review_request | listing_update
  title         VARCHAR(256) NOT NULL,
  description   TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | in_progress | done | skipped
  scheduled_at  TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  meta          JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_launch_steps_campaign ON launch_steps(campaign_id, step_order);

-- Product reviews
CREATE TABLE IF NOT EXISTS product_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id    uuid REFERENCES marketplace_connections(id) ON DELETE SET NULL,
  platform         VARCHAR(10) NOT NULL,
  sku              VARCHAR(128) NOT NULL,
  external_id      VARCHAR(128),
  author           VARCHAR(256),
  rating           INT,          -- 1–5
  text             TEXT,
  pros             TEXT,
  cons             TEXT,
  is_answered      BOOLEAN NOT NULL DEFAULT false,
  ai_reply         TEXT,
  reply_approved   BOOLEAN NOT NULL DEFAULT false,
  replied_at       TIMESTAMPTZ,
  review_date      DATE,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON product_reviews(user_id, is_answered, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_sku  ON product_reviews(connection_id, sku, review_date DESC);

-- AI reply templates/settings per user
CREATE TABLE IF NOT EXISTS review_reply_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  tone         VARCHAR(20) NOT NULL DEFAULT 'friendly',  -- friendly | formal | empathetic
  brand_name   VARCHAR(128),
  custom_instructions TEXT,
  auto_approve BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

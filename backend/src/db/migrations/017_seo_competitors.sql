-- ============================================================
-- 017: SEO keyword tracking, listing scores, competitor prices
-- ============================================================

-- Keywords to track per user/sku/platform
CREATE TABLE IF NOT EXISTS tracked_keywords (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    VARCHAR(10) NOT NULL,
  sku         VARCHAR(128) NOT NULL,
  keyword     VARCHAR(512) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, sku, keyword)
);
CREATE INDEX IF NOT EXISTS idx_tracked_kw_user ON tracked_keywords(user_id, is_active);

-- Daily position snapshots
CREATE TABLE IF NOT EXISTS keyword_positions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword_id   uuid NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
  platform     VARCHAR(10) NOT NULL,
  sku          VARCHAR(128) NOT NULL,
  keyword      VARCHAR(512) NOT NULL,
  position     INT,          -- NULL = not found in top-100
  page         INT,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kw_pos_keyword ON keyword_positions(keyword_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_kw_pos_user    ON keyword_positions(user_id, checked_at DESC);

-- Listing quality scores (computed from product card data)
CREATE TABLE IF NOT EXISTS listing_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id  uuid NOT NULL REFERENCES marketplace_connections(id) ON DELETE CASCADE,
  platform       VARCHAR(10) NOT NULL,
  sku            VARCHAR(128) NOT NULL,
  title          VARCHAR(512),
  score          INT NOT NULL DEFAULT 0,     -- 0–100
  score_label    VARCHAR(16) NOT NULL DEFAULT 'poor',
  -- breakdown
  score_title    INT NOT NULL DEFAULT 0,     -- 0–20
  score_photos   INT NOT NULL DEFAULT 0,     -- 0–25
  score_desc     INT NOT NULL DEFAULT 0,     -- 0–20
  score_attrs    INT NOT NULL DEFAULT 0,     -- 0–15
  score_rating   INT NOT NULL DEFAULT 0,     -- 0–10
  score_reviews  INT NOT NULL DEFAULT 0,     -- 0–10
  issues         TEXT[] NOT NULL DEFAULT '{}',
  suggestions    TEXT[] NOT NULL DEFAULT '{}',
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_listing_user ON listing_scores(user_id, score ASC);

-- Competitor price tracking
CREATE TABLE IF NOT EXISTS competitor_prices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     VARCHAR(10) NOT NULL,
  my_sku       VARCHAR(128) NOT NULL,        -- user's own SKU
  competitor_sku VARCHAR(128) NOT NULL,
  competitor_name VARCHAR(256),
  price        NUMERIC(10,2) NOT NULL,
  my_price     NUMERIC(10,2),
  diff_pct     NUMERIC(8,2),                -- (competitor - my) / my * 100
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_price_user ON competitor_prices(user_id, my_sku, checked_at DESC);

-- Competitor SKUs to track
CREATE TABLE IF NOT EXISTS tracked_competitors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform         VARCHAR(10) NOT NULL,
  my_sku           VARCHAR(128) NOT NULL,
  competitor_sku   VARCHAR(128) NOT NULL,
  competitor_name  VARCHAR(256),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, my_sku, competitor_sku)
);
CREATE INDEX IF NOT EXISTS idx_tracked_comp_user ON tracked_competitors(user_id, is_active);

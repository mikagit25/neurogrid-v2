CREATE TABLE IF NOT EXISTS competitor_skus (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        VARCHAR(16) NOT NULL CHECK (platform IN ('wb', 'ozon')),
  external_id     VARCHAR(128) NOT NULL,
  name            VARCHAR(512),
  brand           VARCHAR(256),
  our_sku         VARCHAR(128),
  alert_pct       FLOAT NOT NULL DEFAULT 5,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_price      INTEGER,
  last_scraped_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_competitor_skus_user ON competitor_skus(user_id);

CREATE TABLE IF NOT EXISTS competitor_prices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_sku_id  UUID NOT NULL REFERENCES competitor_skus(id) ON DELETE CASCADE,
  price              INTEGER NOT NULL,
  rating             FLOAT,
  reviews_count      INTEGER,
  scraped_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_sku ON competitor_prices(competitor_sku_id, scraped_at DESC);

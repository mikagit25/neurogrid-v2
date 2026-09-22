-- ============================================================
-- 016: advertising campaigns, dayparting, AI bidder
-- ============================================================

-- Cached campaign data (synced from WB/Ozon ad APIs)
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES marketplace_connections(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      VARCHAR(10) NOT NULL,
  external_id   VARCHAR(128) NOT NULL,       -- WB: advertId, Ozon: campaignId
  name          VARCHAR(512) NOT NULL,
  campaign_type VARCHAR(64),                 -- WB: auto/search/catalog, Ozon: SKU/BRAND/SHELF
  status        VARCHAR(32) NOT NULL DEFAULT 'unknown',  -- running | paused | stopped | archived
  budget        NUMERIC(12,2),
  daily_budget  NUMERIC(12,2),
  bid           NUMERIC(10,4),               -- current CPM / CPC bid
  -- latest stats snapshot (updated on each sync)
  impressions   BIGINT NOT NULL DEFAULT 0,
  clicks        INT NOT NULL DEFAULT 0,
  spend         NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders        INT NOT NULL DEFAULT 0,
  revenue       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ctr           NUMERIC(8,4),
  drr           NUMERIC(8,4),
  stats_date    DATE,                        -- date of the stats snapshot
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_adcamp_user    ON ad_campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_adcamp_conn    ON ad_campaigns(connection_id);

-- Dayparting schedules (168 bits: 7 days × 24 hours)
CREATE TABLE IF NOT EXISTS dayparting_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE UNIQUE,
  -- schedule stored as 7 rows of 24 booleans (Mon-Sun, 00-23)
  schedule    BOOLEAN[7][24] NOT NULL DEFAULT '{{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true},{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true},{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true},{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true},{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true},{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true},{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true}}',
  timezone    VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
  is_active   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI bidder rules per campaign
CREATE TABLE IF NOT EXISTS ai_bidder_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id       uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE UNIQUE,
  is_active         BOOLEAN NOT NULL DEFAULT false,
  mode              VARCHAR(32) NOT NULL DEFAULT 'hold',
  -- modes: aggressive_growth | hold_position | min_spend
  max_drr_pct       NUMERIC(6,2) NOT NULL DEFAULT 25,   -- pause if DRR exceeds this
  target_position   INT,                                 -- for search ads: target rank
  max_bid           NUMERIC(10,4),
  min_bid           NUMERIC(10,4),
  last_action       TEXT,
  last_action_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

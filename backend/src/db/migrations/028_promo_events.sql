CREATE TABLE IF NOT EXISTS promo_events (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  platform    VARCHAR(20),
  skus        TEXT[]     DEFAULT '{}',
  starts_at   DATE       NOT NULL,
  ends_at     DATE       NOT NULL,
  discount_pct NUMERIC(5,2),
  promo_type  VARCHAR(50) NOT NULL DEFAULT 'custom',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promo_events_user_id_idx ON promo_events(user_id);
CREATE INDEX IF NOT EXISTS promo_events_dates_idx   ON promo_events(user_id, starts_at, ends_at);

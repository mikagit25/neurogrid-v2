CREATE TABLE IF NOT EXISTS topup_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  amount      NUMERIC(10, 2) NOT NULL,
  currency    VARCHAR(3) NOT NULL DEFAULT 'RUB',
  bepaid_token VARCHAR(255) UNIQUE,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topup_requests_user ON topup_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_topup_requests_token ON topup_requests(bepaid_token);

-- 029: demo accounts (isolated per-session, 2h TTL)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_demo         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_demo ON users(demo_expires_at)
  WHERE is_demo = true;

-- ============================================================
-- 024: AI weekly business reports
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  headline     TEXT,
  summary      TEXT,
  insights     JSONB NOT NULL DEFAULT '[]',
  kpis         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_user ON weekly_reports(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reports_period ON weekly_reports(user_id, period_start);

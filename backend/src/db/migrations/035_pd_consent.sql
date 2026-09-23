-- Separate timestamp for personal-data transfer consent (152-FZ / Belarus PD Law)
-- NULL = not given, non-NULL = given at that moment (kept for audit trail)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pd_transfer_consent_at TIMESTAMPTZ;

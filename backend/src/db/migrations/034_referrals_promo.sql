-- ── Referral codes on users ─────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   UUID REFERENCES users(id) ON DELETE SET NULL;

-- Auto-generate referral code for existing users
UPDATE users
SET referral_code = 'NG-' || upper(substring(md5(id::text || random()::text) from 1 for 8))
WHERE referral_code IS NULL;

-- Function to auto-assign referral code on INSERT
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'NG-' || upper(substring(md5(NEW.id::text || clock_timestamp()::text) from 1 for 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_referral_code ON users;
CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION set_referral_code();

-- ── Referral earnings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_earnings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topup_amount  NUMERIC(10,2) NOT NULL,
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  earned_amount NUMERIC(10,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer ON referral_earnings(referrer_id);

-- ── Promo codes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(32) NOT NULL UNIQUE,
  description TEXT,
  reward_type VARCHAR(20) NOT NULL DEFAULT 'balance',  -- 'balance'
  reward_amount NUMERIC(10,2) NOT NULL,                 -- ₽ credited to balance
  max_uses    INTEGER,                                   -- NULL = unlimited
  used_count  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_code_uses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_amount NUMERIC(10,2) NOT NULL,
  used_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_code_uses_user ON promo_code_uses(user_id);

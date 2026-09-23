-- Счета на оплату (bank transfer invoices)
CREATE TABLE IF NOT EXISTS bank_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invoice_number  VARCHAR(40) UNIQUE NOT NULL,
  plan            VARCHAR(20) NOT NULL,
  months          INT NOT NULL DEFAULT 1,
  amount          NUMERIC(12,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | paid | cancelled
  payer_name      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ,
  paid_by         UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bank_invoices_user    ON bank_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_invoices_status  ON bank_invoices(status);

-- Акты выполненных работ
CREATE TABLE IF NOT EXISTS service_acts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  act_number      VARCHAR(40) UNIQUE NOT NULL,
  period_from     DATE NOT NULL,
  period_to       DATE NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  services_json   JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_acts_user ON service_acts(user_id);

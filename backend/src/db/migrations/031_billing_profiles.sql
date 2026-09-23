-- User billing profiles for invoices and acts
ALTER TABLE users ADD COLUMN IF NOT EXISTS agreement_accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_billing_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_name  TEXT,
  unp           VARCHAR(50),
  legal_address TEXT,
  iban          VARCHAR(50),
  bank_name     TEXT,
  bic           VARCHAR(20),
  contact_person TEXT,
  phone         VARCHAR(50),
  billing_email TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

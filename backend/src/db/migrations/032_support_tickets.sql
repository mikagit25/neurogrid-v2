CREATE TABLE support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_email VARCHAR(200),
  topic       VARCHAR(50)  NOT NULL,
  subject     VARCHAR(200) NOT NULL,
  message     TEXT         NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_tickets_user   ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);

CREATE TABLE support_replies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  is_admin   BOOLEAN     NOT NULL DEFAULT false,
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_replies_ticket ON support_replies(ticket_id);

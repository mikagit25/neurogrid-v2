-- ============================================================
-- 021: team accounts (multi-user access to owner's workspace)
-- ============================================================

CREATE TABLE IF NOT EXISTS team_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(32) NOT NULL DEFAULT 'analyst', -- analyst | manager | admin
  token       VARCHAR(128) NOT NULL UNIQUE,
  accepted    BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_inv_owner ON team_invitations(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_inv_token ON team_invitations(token);

CREATE TABLE IF NOT EXISTS team_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(32) NOT NULL DEFAULT 'analyst',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, member_user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_mem_owner  ON team_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_mem_member ON team_members(member_user_id);

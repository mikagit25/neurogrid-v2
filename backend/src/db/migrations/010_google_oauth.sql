-- Allow users registered via Google (no password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- OAuth provider info
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(32),
  ADD COLUMN IF NOT EXISTS oauth_id       VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_idx ON users (oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL;

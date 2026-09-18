import { db } from '../../db';
import { encrypt } from '../../utils/encryption';
import { createAdapter } from '../../integrations/marketplace/factory';

export async function addConnection(
  userId: string,
  platform: string,
  credentials: object,
  displayName?: string
) {
  const credentialsEnc = encrypt(JSON.stringify(credentials));

  // Validate credentials before saving
  const adapter = createAdapter(platform, credentialsEnc);
  await adapter.validateCredentials();

  const { rows } = await db.query(
    `INSERT INTO marketplace_connections
       (user_id, platform, credentials_enc, display_name, last_verified_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, platform) DO UPDATE
       SET credentials_enc = $3, display_name = $4, status = 'active', last_verified_at = now()
     RETURNING id, platform, display_name, status, last_verified_at, created_at`,
    [userId, platform, credentialsEnc, displayName ?? null]
  );
  return rows[0];
}

export async function getUserConnections(userId: string) {
  const { rows } = await db.query(
    `SELECT id, platform, display_name, status, last_verified_at, created_at
     FROM marketplace_connections WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  return rows;
}

export async function getConnectionById(id: string, userId: string) {
  const { rows } = await db.query(
    `SELECT id, platform, credentials_enc, display_name, status
     FROM marketplace_connections WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

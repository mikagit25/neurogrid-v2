import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../db';

function generateApiKey(): string {
  return 'ng_' + crypto.randomBytes(32).toString('hex');
}

export async function createApiKey(
  userId: string,
  data: { name: string; scopes?: string[]; expires_at?: string },
) {
  const rawKey = generateApiKey();
  const prefix = rawKey.slice(0, 11); // "ng_" + 8 chars
  const hash = await bcrypt.hash(rawKey, 10);

  const { rows } = await db.query(
    `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, key_prefix, scopes, is_active, expires_at, created_at`,
    [userId, data.name, hash, prefix, data.scopes ?? [], data.expires_at ?? null],
  );
  return { ...rows[0], key: rawKey }; // return raw key once only
}

export async function listApiKeys(userId: string) {
  const { rows } = await db.query(
    `SELECT id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at
     FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function revokeApiKey(userId: string, keyId: string) {
  await db.query(
    `UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2`,
    [keyId, userId],
  );
}

export async function validateApiKey(rawKey: string): Promise<{ userId: string; scopes: string[] } | null> {
  // We need to find the key by prefix, then verify hash
  const prefix = rawKey.slice(0, 11);
  const { rows } = await db.query(
    `SELECT id, user_id, key_hash, scopes FROM api_keys
     WHERE key_prefix = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > now())`,
    [prefix],
  );

  for (const row of rows) {
    const match = await bcrypt.compare(rawKey, row.key_hash);
    if (match) {
      await db.query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [row.id]);
      return { userId: row.user_id, scopes: row.scopes };
    }
  }
  return null;
}

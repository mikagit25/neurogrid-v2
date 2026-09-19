import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../db';
import { config } from '../../config';

export interface JwtPayload {
  userId: string;
  isAdmin: boolean;
}

export async function registerUser(email: string, password: string) {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw Object.assign(new Error('Email already registered'), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, balance, is_admin, created_at`,
    [email, passwordHash]
  );
  return rows[0];
}

export async function loginUser(email: string, password: string) {
  const { rows } = await db.query(
    'SELECT id, email, password_hash, balance, is_admin FROM users WHERE email = $1',
    [email]
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const user = rows[0];
  if (!user.password_hash) {
    throw Object.assign(new Error('This account uses Google Sign-In'), { status: 401 });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const token = jwt.sign(
    { userId: user.id, isAdmin: user.is_admin } satisfies JwtPayload,
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );

  return {
    token,
    user: { id: user.id, email: user.email, balance: user.balance, is_admin: user.is_admin },
  };
}

export async function upsertGoogleUser(profile: { email: string; googleId: string; name: string }) {
  const { email, googleId, name } = profile;

  // Look up by email first (handles existing email/password accounts linking Google)
  const existing = await db.query(
    'SELECT id, email, balance, is_admin FROM users WHERE email = $1',
    [email]
  );
  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    // Link Google to existing account if not yet linked
    await db.query(
      `UPDATE users SET oauth_provider = 'google', oauth_id = $1
       WHERE id = $2 AND oauth_provider IS NULL`,
      [googleId, user.id]
    );
    return user;
  }

  // New user via Google — password_hash is NULL
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, oauth_provider, oauth_id)
     VALUES ($1, NULL, 'google', $2)
     RETURNING id, email, balance, is_admin`,
    [email, googleId]
  );
  return rows[0];
}

export async function getUserById(userId: string) {
  const { rows } = await db.query(
    'SELECT id, email, balance, is_admin, created_at FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}

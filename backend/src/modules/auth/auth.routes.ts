import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { registerUser, loginUser, getUserById, upsertGoogleUser,
         checkLoginLockout, recordLoginFailure, clearLoginCounters } from './auth.service';
import { authenticate } from './auth.middleware';
import { redis } from '../../queue/queue';
import { config } from '../../config';
import { db } from '../../db';
import { sendPasswordResetEmail } from '../../utils/mailer';
import { seedDemoAccount } from './demo.seeder';
import type { JwtPayload } from './auth.service';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  agreement_accepted: z.boolean().refine(v => v === true, {
    message: 'Необходимо принять публичный договор оказания услуг',
  }),
  ref_code:   z.string().max(20).optional(),
  promo_code: z.string().max(32).optional(),
});

// Login schema — no min-length on password so lockout runs before Zod rejects
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await registerUser(
      parsed.data.email,
      parsed.data.password,
      parsed.data.agreement_accepted,
      parsed.data.ref_code,
      parsed.data.promo_code,
    );
    res.status(201).json({ user });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  const ip = (req.ip ?? '').replace(/^::ffff:/, '');
  const email = parsed.data.email.toLowerCase();

  try {
    await checkLoginLockout(ip, email);
    const result = await loginUser(email, parsed.data.password);
    await clearLoginCounters(ip, email);   // reset on success
    res.json(result);
  } catch (err: any) {
    // Record failure only for credential errors, not lockouts
    if (err.status === 401) {
      await recordLoginFailure(ip, email);
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

authRouter.get('/google', (_req: Request, res: Response) => {
  if (!config.google.clientId) {
    res.status(501).json({ error: 'Google OAuth not configured' });
    return;
  }
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

authRouter.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.redirect(`${config.frontendUrl}/login?error=google_failed`);
    return;
  }

  try {
    const tokenRes = await axios.post(GOOGLE_TOKEN_URL, {
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
    });

    const userRes = await axios.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    const { email, id: googleId, name } = userRes.data;
    if (!email) throw new Error('Google account has no email');

    const user = await upsertGoogleUser({ email: email.toLowerCase(), googleId, name: name || '' });

    const token = jwt.sign(
      { userId: user.id, isAdmin: user.is_admin } satisfies JwtPayload,
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    // Store JWT under a one-time code (60s TTL) — token never appears in URL
    const otp = crypto.randomBytes(32).toString('hex');
    await redis.setex(`oauth_code:${otp}`, 60, JSON.stringify({ token, user }));

    res.redirect(`${config.frontendUrl}/auth/google/success?code=${otp}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${config.frontendUrl}/login?error=google_failed`);
  }
});

authRouter.post('/google/exchange', async (req: Request, res: Response) => {
  const code = (req.query.code as string) || req.body?.code;
  if (!code) {
    res.status(400).json({ error: 'Code required' });
    return;
  }

  const raw = await redis.get(`oauth_code:${code}`);
  if (!raw) {
    res.status(400).json({ error: 'Invalid or expired code' });
    return;
  }

  await redis.del(`oauth_code:${code}`);
  res.json(JSON.parse(raw));
});

// ── Password reset ────────────────────────────────────────────────────────────

const RESET_TTL = 60 * 60; // 1 hour

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const email = (req.body?.email ?? '').toLowerCase().trim();
  if (!email) {
    res.status(400).json({ error: 'Email required' });
    return;
  }

  // Always respond with success to avoid user enumeration
  res.json({ ok: true, message: 'Если аккаунт существует, письмо отправлено' });

  // Do the actual work after responding
  try {
    const { rows } = await db.query(
      'SELECT id, oauth_provider FROM users WHERE email = $1',
      [email]
    );
    if (rows.length === 0) return; // user doesn't exist — silently ignore
    if (rows[0].oauth_provider === 'google') return; // Google users have no password

    const token = crypto.randomBytes(32).toString('hex');
    await redis.setex(`reset:${token}`, RESET_TTL, email);

    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, resetUrl);
  } catch (err) {
    console.error('[forgot-password]', err);
  }
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body ?? {};
  if (!token || !password || password.length < 8) {
    res.status(400).json({ error: 'Token and password (min 8 chars) required' });
    return;
  }

  const email = await redis.get(`reset:${token}`);
  if (!email) {
    res.status(400).json({ error: 'Ссылка недействительна или истекла. Запросите новую.' });
    return;
  }

  try {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(password, 12);
    const { rowCount } = await db.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [hash, email]
    );
    if (!rowCount) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    await redis.del(`reset:${token}`);

    // Clear any login lockout for this email
    await redis.del(`login_fail:email:${email}`);

    res.json({ ok: true, message: 'Пароль успешно изменён' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Demo account ─────────────────────────────────────────────────────────────
// POST /api/auth/demo — creates an isolated demo session (rate limited: 10/hour per IP)
authRouter.post('/demo', async (req: Request, res: Response) => {
  const ip = (req.ip ?? '').replace(/^::ffff:/, '');
  const rateKey = `demo_rate:${ip}`;
  const count = parseInt((await redis.get(rateKey)) ?? '0');
  if (count >= 10) {
    res.status(429).json({ error: 'Слишком много демо-сессий. Попробуйте через час.' });
    return;
  }

  try {
    const demoEmail = `demo_${crypto.randomBytes(8).toString('hex')}@demo.neurogrid`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create demo user
    const { rows: [user] } = await db.query(
      `INSERT INTO users (email, password_hash, is_demo, demo_expires_at)
       VALUES ($1, NULL, true, $2)
       RETURNING id, email, balance, is_admin, is_demo, demo_expires_at`,
      [demoEmail, expiresAt],
    );

    // Create fake marketplace connections (credentials_enc is dummy for demo)
    const { rows: [wbConn] } = await db.query(
      `INSERT INTO marketplace_connections (user_id, platform, credentials_enc, status, display_name)
       VALUES ($1, 'wb', 'demo_placeholder', 'active', 'WB Demo Shop')
       RETURNING id`,
      [user.id],
    );
    const { rows: [ozonConn] } = await db.query(
      `INSERT INTO marketplace_connections (user_id, platform, credentials_enc, status, display_name)
       VALUES ($1, 'ozon', 'demo_placeholder', 'active', 'Ozon Demo Shop')
       RETURNING id`,
      [user.id],
    );

    await seedDemoAccount(user.id, wbConn.id, ozonConn.id);

    const token = jwt.sign(
      { userId: user.id, isAdmin: false },
      config.jwt.secret,
      { expiresIn: '24h' } as jwt.SignOptions,
    );

    // Rate limit: increment counter, expire after 1 hour
    const pipeline = redis.pipeline();
    pipeline.incr(rateKey);
    pipeline.expire(rateKey, 3600);
    await pipeline.exec();

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        balance: 4850, // demo shows pre-loaded balance
        is_admin: false,
        is_demo: true,
        demo_expires_at: expiresAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[demo]', err);
    res.status(500).json({ error: 'Не удалось создать демо-аккаунт' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await getUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

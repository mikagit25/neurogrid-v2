import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { registerUser, loginUser, getUserById, upsertGoogleUser } from './auth.service';
import { authenticate } from './auth.middleware';
import { redis } from '../../queue/queue';
import { config } from '../../config';
import type { JwtPayload } from './auth.service';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await registerUser(parsed.data.email, parsed.data.password);
    res.status(201).json({ user });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await loginUser(parsed.data.email, parsed.data.password);
    res.json(result);
  } catch (err: any) {
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

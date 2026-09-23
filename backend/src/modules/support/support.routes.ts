import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';

export const supportRouter = Router();

const TOPICS: Record<string, string> = {
  tech:      'Техническая проблема',
  billing:   'Вопрос по оплате / тарифу',
  feature:   'Предложение по улучшению',
  complaint: 'Жалоба',
  other:     'Другое',
};

const createSchema = z.object({
  topic:   z.enum(['tech', 'billing', 'feature', 'complaint', 'other']),
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(5000),
  email:   z.string().email().max(200).optional(), // for unauthenticated users
});

const replySchema = z.object({
  message: z.string().min(1).max(5000),
});

// POST /api/support — create ticket (public; links to user if authenticated)
supportRouter.post('/', async (req: Request, res: Response) => {
  // Optionally authenticate (don't block if no token)
  try {
    const auth = req.headers.authorization?.split(' ')[1];
    if (auth) {
      const jwt = await import('jsonwebtoken');
      const { config } = await import('../../config');
      const payload = jwt.default.verify(auth, config.jwt.secret) as any;
      (req as any).userId = payload.userId;
    }
  } catch {}

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { topic, subject, message, email } = parsed.data;
  const userId = (req as any).userId ?? null;

  if (!userId && !email) {
    res.status(400).json({ error: 'Email is required for unauthenticated submissions' });
    return;
  }

  const { rows } = await db.query(
    `INSERT INTO support_tickets (user_id, guest_email, topic, subject, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, topic, subject, status, created_at`,
    [userId, email ?? null, topic, subject, message],
  );
  res.status(201).json({ ticket: rows[0] });
});

// All routes below require authentication
supportRouter.use(authenticate);

// GET /api/support — list user's own tickets
supportRouter.get('/', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT st.id, st.topic, st.subject, st.status, st.created_at, st.updated_at,
            COUNT(sr.id)::int AS reply_count
     FROM support_tickets st
     LEFT JOIN support_replies sr ON sr.ticket_id = st.id
     WHERE st.user_id = $1
     GROUP BY st.id
     ORDER BY st.updated_at DESC`,
    [req.user!.userId],
  );
  res.json({ tickets: rows });
});

// GET /api/support/:id — ticket with replies
supportRouter.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.userId],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }

  const { rows: replies } = await db.query(
    `SELECT sr.id, sr.is_admin, sr.message, sr.created_at,
            u.email AS author_email
     FROM support_replies sr
     LEFT JOIN users u ON u.id = sr.author_id
     WHERE sr.ticket_id = $1
     ORDER BY sr.created_at ASC`,
    [req.params.id],
  );
  res.json({ ticket: rows[0], replies });
});

// POST /api/support/:id/reply — user reply
supportRouter.post('/:id/reply', async (req: Request, res: Response) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }

  const { rows } = await db.query(
    `SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2 AND status != 'closed'`,
    [req.params.id, req.user!.userId],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found or closed' }); return; }

  await db.query(
    `INSERT INTO support_replies (ticket_id, author_id, is_admin, message) VALUES ($1, $2, false, $3)`,
    [req.params.id, req.user!.userId, parsed.data.message],
  );
  await db.query(
    `UPDATE support_tickets SET status = 'open', updated_at = now() WHERE id = $1`,
    [req.params.id],
  );
  res.json({ ok: true });
});

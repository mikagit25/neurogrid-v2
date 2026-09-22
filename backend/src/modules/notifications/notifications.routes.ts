import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT id, type, text, is_read, created_at
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [req.user!.userId]
  );
  res.json({ notifications: rows });
});

notificationsRouter.post('/:id/read', async (req: Request, res: Response) => {
  await db.query(
    'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.userId]
  );
  res.json({ ok: true });
});

// GET /api/notifications/digest-settings
notificationsRouter.get('/digest-settings', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    'SELECT digest_enabled FROM users WHERE id = $1',
    [req.user!.userId],
  );
  res.json({ digestEnabled: rows[0]?.digest_enabled ?? true });
});

// PATCH /api/notifications/digest-settings
notificationsRouter.patch('/digest-settings', async (req: Request, res: Response) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') { res.status(400).json({ error: 'enabled must be boolean' }); return; }
  await db.query(
    'UPDATE users SET digest_enabled = $1 WHERE id = $2',
    [enabled, req.user!.userId],
  );
  res.json({ ok: true, digestEnabled: enabled });
});

// GET /api/notifications/alert-email-settings
notificationsRouter.get('/alert-email-settings', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    'SELECT alert_email_enabled FROM users WHERE id = $1',
    [req.user!.userId],
  );
  res.json({ alertEmailEnabled: rows[0]?.alert_email_enabled ?? true });
});

// PATCH /api/notifications/alert-email-settings
notificationsRouter.patch('/alert-email-settings', async (req: Request, res: Response) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') { res.status(400).json({ error: 'enabled must be boolean' }); return; }
  await db.query(
    'UPDATE users SET alert_email_enabled = $1 WHERE id = $2',
    [enabled, req.user!.userId],
  );
  res.json({ ok: true, alertEmailEnabled: enabled });
});

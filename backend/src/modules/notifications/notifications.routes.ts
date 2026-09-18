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

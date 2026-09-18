import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '../auth/auth.middleware';
import { db } from '../../db';

export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

// List all users
adminRouter.get('/users', async (_req: Request, res: Response) => {
  const { rows } = await db.query(
    'SELECT id, email, balance, is_admin, created_at FROM users ORDER BY created_at DESC LIMIT 200'
  );
  res.json({ users: rows });
});

// All runs with errors first
adminRouter.get('/runs', async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  const { rows } = await db.query(
    `SELECT sr.id, sr.status, sr.error_message, sr.cost,
            sr.created_at, sr.finished_at,
            u.email AS user_email,
            s.title AS scenario_title
     FROM scenario_runs sr
     JOIN users u ON u.id = sr.user_id
     JOIN scenarios s ON s.id = sr.scenario_id
     ${status ? 'WHERE sr.status = $2' : ''}
     ORDER BY sr.created_at DESC
     LIMIT $1`,
    status ? [limit, status] : [limit]
  );
  res.json({ runs: rows });
});

// Manual re-queue of failed run
adminRouter.post('/runs/:id/retry', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT sr.id, sr.user_id, sr.connection_id, sr.input_data, s.slug AS scenario_slug
     FROM scenario_runs sr JOIN scenarios s ON s.id = sr.scenario_id
     WHERE sr.id = $1 AND sr.status = 'error'`,
    [req.params.id]
  );
  if (!rows.length) {
    res.status(404).json({ error: 'Failed run not found' });
    return;
  }

  const run = rows[0];
  const { scenarioQueue } = await import('../../queue/queue');
  await db.query(
    `UPDATE scenario_runs SET status = 'queued', error_message = null WHERE id = $1`,
    [run.id]
  );
  await scenarioQueue.add('run', {
    runId: run.id,
    userId: run.user_id,
    scenarioSlug: run.scenario_slug,
    connectionId: run.connection_id,
    inputData: run.input_data,
  });

  res.json({ ok: true, runId: run.id });
});

// Toggle scenario active state
adminRouter.patch('/scenarios/:id', async (req: Request, res: Response) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    res.status(400).json({ error: 'is_active must be boolean' });
    return;
  }
  await db.query('UPDATE scenarios SET is_active = $1 WHERE id = $2', [is_active, req.params.id]);
  res.json({ ok: true });
});

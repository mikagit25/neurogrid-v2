import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { createRun, getUserRuns, getRunById } from './runs.service';
import { getSubscription, PLAN_LIMITS, type Plan } from '../subscriptions/subscriptions.service';
import { db } from '../../db';

export const runsRouter = Router();
runsRouter.use(authenticate);

const createRunSchema = z.object({
  scenarioId: z.string().uuid(),
  connectionId: z.string().uuid().nullable().optional(),
  inputData: z.record(z.unknown()).default({}),
});

runsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createRunSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const run = await createRun(
      req.user!.userId,
      parsed.data.scenarioId,
      parsed.data.connectionId ?? null,
      parsed.data.inputData
    );
    res.status(202).json({ run, message: 'Scenario queued' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

runsRouter.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);
  try {
    const runs = await getUserRuns(req.user!.userId, limit, offset);
    res.json({ runs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/runs/quota — monthly usage vs plan limit
runsRouter.get('/quota', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const sub = await getSubscription(userId);
    const limits = PLAN_LIMITS[sub.plan as Plan] ?? PLAN_LIMITS.free;
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM scenario_runs
       WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [userId],
    );
    const used = rows[0]?.cnt ?? 0;
    const max = limits.runsPerMonth;
    res.json({ used, max, plan: sub.plan, unlimited: max >= 9999 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

runsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const run = await getRunById(req.params.id, req.user!.userId);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json({ run });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

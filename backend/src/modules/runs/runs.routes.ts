import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { createRun, getUserRuns, getRunById } from './runs.service';

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

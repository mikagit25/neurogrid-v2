import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  getAutomations,
  upsertAutomation,
  updateAutomation,
  deleteAutomation,
} from './automations.service';
import { Queue } from 'bullmq';
import { redis } from '../../queue/queue';

export const automationsRouter = Router();
automationsRouter.use(authenticate);

automationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const automations = await getAutomations(req.user!.userId);
    res.json({ automations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

automationsRouter.post('/', async (req: Request, res: Response) => {
  const { scenarioSlug, connectionId, enabled, schedule, auto_apply, settings } = req.body;
  if (!scenarioSlug) { res.status(400).json({ error: 'scenarioSlug required' }); return; }
  try {
    const automation = await upsertAutomation(req.user!.userId, scenarioSlug, connectionId ?? null, {
      enabled, schedule, auto_apply, settings,
    });
    res.status(201).json({ automation });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

automationsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const automation = await updateAutomation(req.params.id, req.user!.userId, req.body);
    res.json({ automation });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

automationsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteAutomation(req.params.id, req.user!.userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Manual trigger
automationsRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const queue = new Queue('automation', { connection: redis });
    await queue.add('run-automation', { automationId: req.params.id }, { priority: 1 });
    await queue.close();
    res.json({ ok: true, queued: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

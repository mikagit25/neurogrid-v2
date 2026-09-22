import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  listWebhooks, createWebhook, updateWebhook, deleteWebhook,
  getWebhookDeliveries, dispatchWebhookEvent,
} from './webhooks.service';

export const webhooksRouter = Router();
webhooksRouter.use(authenticate);

const ALLOWED_EVENTS = ['run.completed', 'run.failed', 'alert.fired', 'price.changed', 'stock.low'];

// GET /api/webhooks
webhooksRouter.get('/', async (req: Request, res: Response) => {
  try {
    res.json(await listWebhooks(req.user!.userId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/webhooks
webhooksRouter.post('/', async (req: Request, res: Response) => {
  const { url, events } = req.body;
  if (!url || !Array.isArray(events) || !events.length) {
    res.status(400).json({ error: 'url and events[] required' }); return;
  }
  const invalidEvents = events.filter((e: string) => !ALLOWED_EVENTS.includes(e));
  if (invalidEvents.length) {
    res.status(400).json({ error: `Invalid events: ${invalidEvents.join(', ')}. Allowed: ${ALLOWED_EVENTS.join(', ')}` }); return;
  }
  try {
    const wh = await createWebhook(req.user!.userId, { url, events });
    res.json(wh);
  } catch (err: any) { res.status(err.status ?? 500).json({ error: err.message }); }
});

// PATCH /api/webhooks/:id
webhooksRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    await updateWebhook(req.user!.userId, req.params.id, req.body);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/webhooks/:id
webhooksRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteWebhook(req.user!.userId, req.params.id);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/webhooks/:id/deliveries
webhooksRouter.get('/:id/deliveries', async (req: Request, res: Response) => {
  try {
    res.json(await getWebhookDeliveries(req.user!.userId, req.params.id));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/webhooks/:id/test — send a test ping
webhooksRouter.post('/:id/test', async (req: Request, res: Response) => {
  try {
    await dispatchWebhookEvent(req.user!.userId, 'run.completed', {
      test: true,
      run_id: '00000000-0000-0000-0000-000000000000',
      scenario: 'test',
      status: 'completed',
    });
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

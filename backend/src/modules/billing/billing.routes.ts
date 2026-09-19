import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { initiateTopup, processWebhook, getTopupRequests } from './billing.service';

export const billingRouter = Router();

// Public — WebPay webhook (no JWT, WebPay sends form-encoded POST)
// WebPay expects HTTP 200; any other code triggers retries for 30 days
billingRouter.post('/webhook/webpay', async (req: Request, res: Response) => {
  try {
    await processWebhook(req.body as Record<string, string>);
    res.status(200).send('OK');
  } catch (err) {
    console.error('[webpay webhook]', err);
    res.status(200).send('OK'); // still 200 to stop retries
  }
});

// Authenticated routes
billingRouter.use(authenticate);

billingRouter.get('/transactions', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT id, type, amount, run_id, provider_id, created_at
     FROM transactions WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 100`,
    [req.user!.userId]
  );
  res.json({ transactions: rows });
});

billingRouter.get('/topups', async (req: Request, res: Response) => {
  const topups = await getTopupRequests(req.user!.userId);
  res.json({ topups });
});

billingRouter.post('/topup', async (req: Request, res: Response) => {
  const amount = Number(req.body.amount);
  try {
    const result = await initiateTopup(req.user!.userId, amount);
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

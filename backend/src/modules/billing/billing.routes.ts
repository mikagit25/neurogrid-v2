import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';

export const billingRouter = Router();
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

// bePaid topup — placeholder until bePaid credentials are configured
billingRouter.post('/topup', async (req: Request, res: Response) => {
  const amount = Number(req.body.amount);
  if (!amount || amount < 100 || amount > 100_000) {
    res.status(400).json({ error: 'amount must be between 100 and 100000' });
    return;
  }

  // TODO Sprint 3: integrate bePaid — create payment page, return redirect URL
  // For now return a placeholder so the route exists and can be tested end-to-end
  res.status(501).json({
    error: 'Payment provider not yet configured',
    message: 'bePaid integration is scheduled for Sprint 3. Contact support to top up manually.',
  });
});

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getReferralStats, applyPromoCode } from './referrals.service';

export const referralsRouter = Router();
referralsRouter.use(authenticate);

referralsRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getReferralStats(req.user!.userId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

referralsRouter.post('/apply-promo', async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Укажите промо-код' });
    return;
  }
  try {
    const result = await applyPromoCode(req.user!.userId, code.trim());
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

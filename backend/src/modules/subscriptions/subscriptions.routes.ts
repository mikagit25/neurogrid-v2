import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getSubscription, upgradePlan, PLAN_LIMITS, PLAN_PRICES, Plan } from './subscriptions.service';

export const subscriptionsRouter = Router();
subscriptionsRouter.use(authenticate);

// GET /api/subscriptions/me
subscriptionsRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const sub = await getSubscription(req.user!.userId);
    res.json({ subscription: sub, plans: buildPlansInfo() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscriptions/upgrade — admin / manual activation (later: wired to WebPay)
subscriptionsRouter.post('/upgrade', async (req: Request, res: Response) => {
  const { plan, months } = req.body ?? {};
  if (!['start', 'business'].includes(plan)) {
    res.status(400).json({ error: 'Invalid plan. Use: start | business' });
    return;
  }
  try {
    const sub = await upgradePlan(req.user!.userId, plan as Plan, months ?? 1);
    res.json({ ok: true, subscription: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function buildPlansInfo() {
  return (Object.keys(PLAN_LIMITS) as Plan[]).map(plan => ({
    id: plan,
    name: plan === 'free' ? 'Бесплатно' : plan === 'start' ? 'Старт' : 'Бизнес',
    price: PLAN_PRICES[plan],
    ...PLAN_LIMITS[plan],
  }));
}

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { getSubscription, upgradePlan, payForPlan, PLAN_LIMITS, PLAN_PRICES, Plan } from './subscriptions.service';

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

const upgradeSchema = z.object({
  plan: z.enum(['start', 'business']),
  months: z.number().int().min(1).max(12).optional().default(1),
});

// POST /api/subscriptions/upgrade — admin / manual activation (later: wired to WebPay)
subscriptionsRouter.post('/upgrade', async (req: Request, res: Response) => {
  const parsed = upgradeSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  const { plan, months } = parsed.data;
  try {
    const sub = await upgradePlan(req.user!.userId, plan as Plan, months);
    res.json({ ok: true, subscription: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const paySchema = z.object({ plan: z.enum(['start', 'business']) });

// POST /api/subscriptions/pay — deduct from wallet and activate plan
subscriptionsRouter.post('/pay', async (req: Request, res: Response) => {
  const parsed = paySchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  const { plan } = parsed.data;
  try {
    const { subscription, newBalance } = await payForPlan(req.user!.userId, plan as Plan);
    res.json({ ok: true, subscription, newBalance });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
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

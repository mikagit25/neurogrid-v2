import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';

export const onboardingRouter = Router();
onboardingRouter.use(authenticate);

onboardingRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT steps_done, dismissed FROM onboarding_progress WHERE user_id = $1`,
    [userId],
  );
  res.json(rows[0] ?? { steps_done: [], dismissed: false });
});

onboardingRouter.patch('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { step, dismissed } = req.body;

  if (dismissed !== undefined) {
    await db.query(
      `INSERT INTO onboarding_progress (user_id, dismissed) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET dismissed = $2, updated_at = now()`,
      [userId, !!dismissed],
    );
  } else if (step) {
    await db.query(
      `INSERT INTO onboarding_progress (user_id, steps_done) VALUES ($1, ARRAY[$2::text])
       ON CONFLICT (user_id) DO UPDATE
         SET steps_done = (
           SELECT array_agg(DISTINCT s) FROM unnest(
             array_append(onboarding_progress.steps_done, $2::text)
           ) s
         ),
         updated_at = now()`,
      [userId, step],
    );
  }

  res.json({ ok: true });
});

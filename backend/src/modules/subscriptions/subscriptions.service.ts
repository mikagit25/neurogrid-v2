import { db } from '../../db';

export type Plan = 'free' | 'start' | 'business';

export const PLAN_LIMITS: Record<Plan, { runsPerMonth: number; hasWarehouse: boolean; hasFinance: boolean; maxConnections: number }> = {
  free:     { runsPerMonth: 10,   hasWarehouse: false, hasFinance: false, maxConnections: 1 },
  start:    { runsPerMonth: 100,  hasWarehouse: true,  hasFinance: false, maxConnections: 2 },
  business: { runsPerMonth: 9999, hasWarehouse: true,  hasFinance: true,  maxConnections: 10 },
};

export const PLAN_PRICES: Record<Plan, number> = {
  free: 0,
  start: 490,
  business: 990,
};

export async function getSubscription(userId: string) {
  // Auto-create free plan if missing
  await db.query(
    `INSERT INTO subscriptions (user_id, plan) VALUES ($1, 'free')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const { rows } = await db.query(
    `SELECT plan, expires_at, created_at, updated_at
     FROM subscriptions WHERE user_id = $1`,
    [userId],
  );
  const sub = rows[0];
  // Downgrade expired paid plans to free
  if (sub.plan !== 'free' && sub.expires_at && new Date(sub.expires_at) < new Date()) {
    await db.query(
      `UPDATE subscriptions SET plan = 'free', updated_at = now() WHERE user_id = $1`,
      [userId],
    );
    sub.plan = 'free';
  }
  return { ...sub, limits: PLAN_LIMITS[sub.plan as Plan] ?? PLAN_LIMITS.free };
}

export async function upgradePlan(userId: string, plan: Plan, months = 1) {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + months);
  const { rows } = await db.query(
    `INSERT INTO subscriptions (user_id, plan, expires_at, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET plan = $2, expires_at = $3, updated_at = now()
     RETURNING *`,
    [userId, plan, expiresAt],
  );
  return rows[0];
}

export async function checkFeatureAccess(userId: string, feature: 'warehouse' | 'finance') {
  const sub = await getSubscription(userId);
  const limits = sub.limits;
  if (feature === 'warehouse' && !limits.hasWarehouse)
    throw Object.assign(new Error('Функция доступна с тарифом Старт или выше'), { status: 403 });
  if (feature === 'finance' && !limits.hasFinance)
    throw Object.assign(new Error('Финансовая аналитика доступна с тарифом Бизнес'), { status: 403 });
}

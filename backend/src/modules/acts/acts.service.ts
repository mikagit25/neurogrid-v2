import { db } from '../../db';
import { renderActHtml, type ActData, type ActService } from './act.template';

function formatDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function nextActNumber(client: any, year: number, month: number): Promise<string> {
  const prefix = `АКТ-${year}-${String(month).padStart(2, '0')}-`;
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM service_acts WHERE act_number LIKE $1`,
    [`${prefix}%`],
  );
  const seq = String((rows[0].cnt ?? 0) + 1).padStart(6, '0');
  return `${prefix}${seq}`;
}

// Called on the 1st of each month to generate acts for the previous month.
export async function generateMonthlyActs(): Promise<number> {
  const now = new Date();
  // Previous month
  const periodTo = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
  const periodFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1); // 1st of prev month

  const fromStr = periodFrom.toISOString().slice(0, 10);
  const toStr = periodTo.toISOString().slice(0, 10);

  // Find all users who had charges in the period
  const { rows: users } = await db.query(
    `SELECT DISTINCT user_id FROM transactions
     WHERE type = 'charge' AND created_at >= $1 AND created_at <= $2 + interval '1 day'`,
    [fromStr, toStr],
  );

  let generated = 0;
  for (const row of users) {
    try {
      await generateActForUser(row.user_id, periodFrom, periodTo);
      generated++;
    } catch (err: any) {
      console.error(`[acts] Failed to generate act for user ${row.user_id}:`, err.message);
    }
  }
  return generated;
}

async function generateActForUser(
  userId: string,
  periodFrom: Date,
  periodTo: Date,
): Promise<void> {
  const fromStr = periodFrom.toISOString().slice(0, 10);
  const toStr = periodTo.toISOString().slice(0, 10);

  // Check if act already exists for this period
  const { rows: existing } = await db.query(
    `SELECT id FROM service_acts WHERE user_id = $1 AND period_from = $2 AND period_to = $3`,
    [userId, fromStr, toStr],
  );
  if (existing.length) return; // idempotent

  // Subscription charges
  const { rows: subCharges } = await db.query(
    `SELECT t.provider_id, ABS(t.amount) AS amount
     FROM transactions t
     WHERE t.user_id = $1 AND t.type = 'charge'
       AND t.provider_id LIKE 'subscription:%'
       AND t.created_at >= $2 AND t.created_at <= $3 + interval '1 day'`,
    [userId, fromStr, toStr],
  );

  // Scenario run charges
  const { rows: runCharges } = await db.query(
    `SELECT COUNT(*)::int AS cnt, SUM(ABS(t.amount))::numeric(12,2) AS total
     FROM transactions t
     WHERE t.user_id = $1 AND t.type = 'charge'
       AND t.run_id IS NOT NULL
       AND t.created_at >= $2 AND t.created_at <= $3 + interval '1 day'`,
    [userId, fromStr, toStr],
  );

  const services: ActService[] = [];

  for (const sc of subCharges) {
    const planId = sc.provider_id.replace('subscription:', '');
    const planLabel = planId === 'business' ? 'Бизнес' : planId === 'start' ? 'Старт' : planId;
    services.push({
      description: `Подписка NeuroGrid (тариф ${planLabel})`,
      quantity: 1,
      unit: 'мес.',
      price: parseFloat(sc.amount),
      total: parseFloat(sc.amount),
    });
  }

  const runCount = runCharges[0]?.cnt ?? 0;
  const runTotal = parseFloat(runCharges[0]?.total ?? '0');
  if (runCount > 0 && runTotal > 0) {
    services.push({
      description: 'Запуск AI-сценариев NeuroGrid',
      quantity: runCount,
      unit: 'шт.',
      price: runTotal / runCount,
      total: runTotal,
    });
  }

  if (services.length === 0) return; // no billable activity

  const totalAmount = services.reduce((s, r) => s + r.total, 0);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const year = periodFrom.getFullYear();
    const month = periodFrom.getMonth() + 1;
    const actNumber = await nextActNumber(client, year, month);

    await client.query(
      `INSERT INTO service_acts (user_id, act_number, period_from, period_to, amount, services_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, actNumber, fromStr, toStr, totalAmount, JSON.stringify(services)],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getActs(userId: string) {
  const { rows } = await db.query(
    `SELECT id, act_number, period_from, period_to, amount, created_at
     FROM service_acts WHERE user_id = $1 ORDER BY period_from DESC`,
    [userId],
  );
  return rows;
}

export async function getActForUser(actId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT sa.*, u.email AS user_email
     FROM service_acts sa JOIN users u ON u.id = sa.user_id
     WHERE sa.id = $1 AND sa.user_id = $2`,
    [actId, userId],
  );
  return rows[0] ?? null;
}

export async function generateActHtml(act: any): Promise<string> {
  const periodFrom = new Date(act.period_from);
  const periodTo = new Date(act.period_to);

  const { rows: profileRows } = await db.query(
    'SELECT * FROM user_billing_profiles WHERE user_id = $1',
    [act.user_id],
  );
  const p = profileRows[0];

  const data: ActData = {
    actNumber: act.act_number,
    date: formatDate(periodTo),
    periodFrom: formatDate(periodFrom),
    periodTo: formatDate(periodTo),
    payerEmail: act.user_email,
    payerName:    p?.company_name || undefined,
    payerUnp:     p?.unp          || undefined,
    payerAddress: p?.legal_address || undefined,
    payerPhone:   p?.phone         || undefined,
    services: act.services_json as ActService[],
    totalAmount: parseFloat(act.amount),
  };
  return renderActHtml(data);
}

// Admin: generate act on demand for a specific user+period
export async function adminGenerateAct(userId: string, year: number, month: number) {
  const periodFrom = new Date(year, month - 1, 1);
  const periodTo = new Date(year, month, 0);
  await generateActForUser(userId, periodFrom, periodTo);
  const fromStr = periodFrom.toISOString().slice(0, 10);
  const toStr = periodTo.toISOString().slice(0, 10);
  const { rows } = await db.query(
    `SELECT sa.*, u.email AS user_email
     FROM service_acts sa JOIN users u ON u.id = sa.user_id
     WHERE sa.user_id = $1 AND sa.period_from = $2 AND sa.period_to = $3`,
    [userId, fromStr, toStr],
  );
  return rows[0] ?? null;
}

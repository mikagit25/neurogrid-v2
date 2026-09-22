import { db } from '../../db';
import { scenarioQueue } from '../../queue/queue';
import type { ScenarioJobData } from '../../queue/queue';
import { getSubscription, PLAN_LIMITS, type Plan } from '../subscriptions/subscriptions.service';

export async function createRun(
  userId: string,
  scenarioId: string,
  connectionId: string | null,
  inputData: Record<string, unknown>
) {
  // Check scenario exists and is active
  const { rows: scenRows } = await db.query(
    'SELECT id, slug, price FROM scenarios WHERE id = $1 AND is_active = true',
    [scenarioId]
  );
  if (!scenRows.length) throw Object.assign(new Error('Scenario not found'), { status: 404 });
  const scenario = scenRows[0];

  // Check monthly run quota
  const sub = await getSubscription(userId);
  const limits = PLAN_LIMITS[sub.plan as Plan] ?? PLAN_LIMITS.free;
  if (limits.runsPerMonth < 9999) {
    const { rows: quotaRows } = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM scenario_runs
       WHERE user_id = $1
         AND created_at >= date_trunc('month', now())`,
      [userId],
    );
    const usedThisMonth = quotaRows[0]?.cnt ?? 0;
    if (usedThisMonth >= limits.runsPerMonth) {
      throw Object.assign(
        new Error(`Лимит запусков на месяц исчерпан (${limits.runsPerMonth}). Обновите тариф.`),
        { status: 429 },
      );
    }
  }

  // Check user balance
  const { rows: userRows } = await db.query(
    'SELECT balance FROM users WHERE id = $1',
    [userId]
  );
  const balance = parseFloat(userRows[0]?.balance ?? '0');
  const price = parseFloat(scenario.price);
  if (balance < price) {
    throw Object.assign(
      new Error(`Insufficient balance: need ${price} ₽, have ${balance} ₽`),
      { status: 402 }
    );
  }

  // Create run record
  const { rows } = await db.query(
    `INSERT INTO scenario_runs (user_id, scenario_id, connection_id, input_data)
     VALUES ($1, $2, $3, $4)
     RETURNING id, status, created_at`,
    [userId, scenarioId, connectionId ?? null, JSON.stringify(inputData)]
  );
  const run = rows[0];

  // Enqueue job
  const jobData: ScenarioJobData = {
    runId: run.id,
    userId,
    scenarioSlug: scenario.slug,
    connectionId,
    inputData,
  };
  await scenarioQueue.add('run', jobData, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 7 * 86400 },
  });

  return run;
}

export async function getUserRuns(userId: string, limit = 20, offset = 0) {
  const { rows } = await db.query(
    `SELECT
       sr.id, sr.status, sr.cost, sr.created_at, sr.started_at, sr.finished_at,
       s.title AS scenario_title, s.slug AS scenario_slug,
       mc.platform AS marketplace_platform
     FROM scenario_runs sr
     JOIN scenarios s ON s.id = sr.scenario_id
     LEFT JOIN marketplace_connections mc ON mc.id = sr.connection_id
     WHERE sr.user_id = $1
     ORDER BY sr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}

export async function getRunById(runId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT
       sr.id, sr.status, sr.result, sr.error_message, sr.cost,
       sr.input_data, sr.created_at, sr.started_at, sr.finished_at,
       s.title AS scenario_title, s.slug AS scenario_slug
     FROM scenario_runs sr
     JOIN scenarios s ON s.id = sr.scenario_id
     WHERE sr.id = $1 AND sr.user_id = $2`,
    [runId, userId]
  );
  return rows[0] || null;
}

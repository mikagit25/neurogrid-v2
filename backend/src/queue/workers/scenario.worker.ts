import { Job } from 'bullmq';
import { db } from '../../db';
import { ScenarioJobData } from '../queue';
import { getExecutor } from '../../scenarios/registry';
import { getConnectionById } from '../../modules/connections/connections.service';
import { createAdapter } from '../../integrations/marketplace/factory';
import { dispatchWebhookEvent } from '../../modules/webhooks/webhooks.service';

export async function processScenarioJob(job: Job<ScenarioJobData>): Promise<void> {
  const { runId, userId, scenarioSlug, connectionId, inputData } = job.data;

  await db.query(
    `UPDATE scenario_runs SET status = 'running', started_at = now() WHERE id = $1`,
    [runId]
  );

  try {
    // Load scenario cost
    const { rows: scenarioRows } = await db.query(
      'SELECT price FROM scenarios WHERE slug = $1',
      [scenarioSlug]
    );
    if (!scenarioRows.length) throw new Error(`Scenario not found: ${scenarioSlug}`);
    const cost: number = parseFloat(scenarioRows[0].price);

    // Verify balance (re-check inside transaction)
    const { rows: userRows } = await db.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRows.length) throw new Error('User not found');
    if (parseFloat(userRows[0].balance) < cost) {
      throw new Error('Insufficient balance');
    }

    // Build marketplace adapter if connection required
    let adapter = null;
    if (connectionId) {
      const connection = await getConnectionById(connectionId, userId);
      if (!connection) throw new Error('Marketplace connection not found');
      adapter = createAdapter(connection.platform, connection.credentials_enc);
    }

    // Execute scenario
    const executor = getExecutor(scenarioSlug);
    const result = await executor.execute({ adapter, inputData: { ...inputData, _runId: runId } });

    // Commit result + deduct balance atomically
    await db.query('BEGIN');
    try {
      await db.query(
        `UPDATE scenario_runs
         SET status = 'success', result = $1, cost = $2, finished_at = now()
         WHERE id = $3`,
        [JSON.stringify(result), cost, runId]
      );
      await db.query(
        'UPDATE users SET balance = balance - $1 WHERE id = $2',
        [cost, userId]
      );
      await db.query(
        `INSERT INTO transactions (user_id, type, amount, run_id)
         VALUES ($1, 'charge', $2, $3)`,
        [userId, cost, runId]
      );
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

    // Dispatch webhook (non-blocking)
    dispatchWebhookEvent(userId, 'run.completed', {
      run_id: runId,
      scenario: scenarioSlug,
      cost,
      status: 'completed',
    }).catch(() => {});

  } catch (err: any) {
    await db.query(
      `UPDATE scenario_runs
       SET status = 'error', error_message = $1, finished_at = now()
       WHERE id = $2`,
      [err.message, runId]
    );

    dispatchWebhookEvent(userId, 'run.failed', {
      run_id: runId,
      scenario: scenarioSlug,
      error: err.message,
    }).catch(() => {});

    throw err;
  }
}

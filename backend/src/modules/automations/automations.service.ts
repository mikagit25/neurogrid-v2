import { db } from '../../db';
import { Queue, QueueEvents } from 'bullmq';
import { redis } from '../../queue/queue';

export interface Automation {
  id: string;
  user_id: string;
  scenario_slug: string;
  connection_id: string | null;
  enabled: boolean;
  schedule: 'hourly' | 'daily' | 'weekly';
  auto_apply: boolean;
  settings: Record<string, unknown>;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  updated_at: string;
  // joined
  connection_platform?: string;
  connection_name?: string;
}

const SCHEDULE_CRON: Record<string, string> = {
  hourly: '0 * * * *',
  daily:  '0 9 * * *',
  weekly: '0 9 * * 1',
};

export async function getAutomations(userId: string): Promise<Automation[]> {
  const { rows } = await db.query(
    `SELECT a.*, mc.platform AS connection_platform, mc.display_name AS connection_name
     FROM user_automations a
     LEFT JOIN marketplace_connections mc ON mc.id = a.connection_id
     WHERE a.user_id = $1
     ORDER BY a.created_at ASC`,
    [userId]
  );
  return rows;
}

export async function upsertAutomation(
  userId: string,
  scenarioSlug: string,
  connectionId: string | null,
  data: {
    enabled?: boolean;
    schedule?: string;
    auto_apply?: boolean;
    settings?: Record<string, unknown>;
  }
): Promise<Automation> {
  const { rows } = await db.query(
    `INSERT INTO user_automations (user_id, scenario_slug, connection_id, enabled, schedule, auto_apply, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, scenario_slug, connection_id)
     DO UPDATE SET
       enabled    = EXCLUDED.enabled,
       schedule   = EXCLUDED.schedule,
       auto_apply = EXCLUDED.auto_apply,
       settings   = EXCLUDED.settings,
       updated_at = now()
     RETURNING *`,
    [
      userId,
      scenarioSlug,
      connectionId,
      data.enabled ?? true,
      data.schedule ?? 'daily',
      data.auto_apply ?? false,
      JSON.stringify(data.settings ?? {}),
    ]
  );
  const automation = rows[0] as Automation;
  await syncSchedule(automation);
  return automation;
}

export async function updateAutomation(
  id: string,
  userId: string,
  data: Partial<Pick<Automation, 'enabled' | 'schedule' | 'auto_apply' | 'settings'>>
): Promise<Automation> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (data.enabled !== undefined)    { sets.push(`enabled=$${idx++}`);    vals.push(data.enabled); }
  if (data.schedule !== undefined)   { sets.push(`schedule=$${idx++}`);   vals.push(data.schedule); }
  if (data.auto_apply !== undefined) { sets.push(`auto_apply=$${idx++}`); vals.push(data.auto_apply); }
  if (data.settings !== undefined)   { sets.push(`settings=$${idx++}`);   vals.push(JSON.stringify(data.settings)); }
  sets.push(`updated_at=now()`);

  const { rows } = await db.query(
    `UPDATE user_automations SET ${sets.join(', ')}
     WHERE id=$${idx++} AND user_id=$${idx++}
     RETURNING *`,
    [...vals, id, userId]
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  await syncSchedule(rows[0] as Automation);
  return rows[0] as Automation;
}

export async function deleteAutomation(id: string, userId: string): Promise<void> {
  const { rows } = await db.query(
    `DELETE FROM user_automations WHERE id=$1 AND user_id=$2 RETURNING id`,
    [id, userId]
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  await removeSchedule(id);
}

export async function markRunResult(
  id: string,
  status: 'success' | 'error' | 'skipped'
): Promise<void> {
  await db.query(
    `UPDATE user_automations SET last_run_at=now(), last_run_status=$1 WHERE id=$2`,
    [status, id]
  );
}

/** Sync BullMQ repeatable job for this automation */
async function syncSchedule(automation: Automation): Promise<void> {
  const queue = new Queue('automation', { connection: redis });
  const jobId = `auto:${automation.id}`;

  // Remove existing repeatable first
  const repeatables = await queue.getRepeatableJobs();
  for (const r of repeatables) {
    if (r.key.startsWith(jobId)) {
      await queue.removeRepeatableByKey(r.key);
    }
  }

  if (automation.enabled) {
    const cron = SCHEDULE_CRON[automation.schedule] ?? SCHEDULE_CRON.daily;
    await queue.add(
      'run-automation',
      { automationId: automation.id },
      { repeat: { pattern: cron }, jobId }
    );
  }

  await queue.close();
}

async function removeSchedule(automationId: string): Promise<void> {
  const queue = new Queue('automation', { connection: redis });
  const repeatables = await queue.getRepeatableJobs();
  for (const r of repeatables) {
    if (r.key.startsWith(`auto:${automationId}`)) {
      await queue.removeRepeatableByKey(r.key);
    }
  }
  await queue.close();
}

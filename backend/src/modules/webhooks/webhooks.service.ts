import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { db } from '../../db';

export type WebhookEvent =
  | 'run.completed'
  | 'run.failed'
  | 'alert.fired'
  | 'price.changed'
  | 'stock.low';

export interface Webhook {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  last_fired_at: string | null;
  last_status: number | null;
  created_at: string;
}

function generateSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}

export async function listWebhooks(userId: string): Promise<Webhook[]> {
  const { rows } = await db.query(
    `SELECT id, url, secret, events, is_active, last_fired_at, last_status, created_at
     FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function createWebhook(userId: string, data: { url: string; events: string[] }): Promise<Webhook> {
  if (!data.url || !data.events?.length) {
    throw Object.assign(new Error('url and events required'), { status: 400 });
  }
  const secret = generateSecret();
  const { rows } = await db.query(
    `INSERT INTO webhooks (user_id, url, secret, events)
     VALUES ($1, $2, $3, $4)
     RETURNING id, url, secret, events, is_active, last_fired_at, last_status, created_at`,
    [userId, data.url, secret, data.events],
  );
  return rows[0];
}

export async function updateWebhook(userId: string, id: string, data: { url?: string; events?: string[]; is_active?: boolean }): Promise<void> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (data.url !== undefined) { fields.push(`url = $${fields.length + 1}`); vals.push(data.url); }
  if (data.events !== undefined) { fields.push(`events = $${fields.length + 1}`); vals.push(data.events); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${fields.length + 1}`); vals.push(data.is_active); }
  if (!fields.length) return;
  vals.push(id, userId);
  await db.query(
    `UPDATE webhooks SET ${fields.join(', ')} WHERE id = $${vals.length - 1} AND user_id = $${vals.length}`,
    vals,
  );
}

export async function deleteWebhook(userId: string, id: string): Promise<void> {
  await db.query('DELETE FROM webhooks WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function getWebhookDeliveries(userId: string, webhookId: string) {
  const { rows } = await db.query(
    `SELECT wd.id, wd.event, wd.status_code, wd.response, wd.duration_ms, wd.created_at
     FROM webhook_deliveries wd
     JOIN webhooks w ON w.id = wd.webhook_id
     WHERE wd.webhook_id = $1 AND w.user_id = $2
     ORDER BY wd.created_at DESC LIMIT 50`,
    [webhookId, userId],
  );
  return rows;
}

function signPayload(payload: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function httpPost(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: string; ms: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 10_000,
    };
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data.slice(0, 500), ms: Date.now() - start }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

export async function dispatchWebhookEvent(userId: string, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const { rows } = await db.query(
    `SELECT id, url, secret FROM webhooks
     WHERE user_id = $1 AND is_active = true AND $2 = ANY(events)`,
    [userId, event],
  );
  if (!rows.length) return;

  const body = JSON.stringify({ event, ts: new Date().toISOString(), ...payload });

  for (const wh of rows) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'NeuroGrid-Webhooks/1.0',
        'X-NeuroGrid-Event': event,
      };
      if (wh.secret) {
        headers['X-NeuroGrid-Signature'] = signPayload(body, wh.secret);
      }

      const result = await httpPost(wh.url, body, headers);

      await db.query(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload, status_code, response, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [wh.id, event, JSON.parse(body), result.status, result.body, result.ms],
      );
      await db.query(
        `UPDATE webhooks SET last_fired_at = now(), last_status = $1 WHERE id = $2`,
        [result.status, wh.id],
      );
    } catch (err) {
      console.error(`[webhooks] delivery failed wh=${wh.id} event=${event}:`, (err as Error).message);
      await db.query(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload, status_code, response, duration_ms)
         VALUES ($1, $2, $3, NULL, $4, NULL)`,
        [wh.id, event, JSON.parse(body), (err as Error).message.slice(0, 500)],
      ).catch(() => {});
    }
  }
}

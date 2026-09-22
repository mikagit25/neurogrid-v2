import { db } from '../../db';

export async function getReturns(
  userId: string,
  opts: { status?: string; platform?: string; sku?: string; limit?: number },
) {
  let sql = `SELECT * FROM return_items WHERE user_id = $1`;
  const params: any[] = [userId];
  let i = 2;
  if (opts.status) { sql += ` AND status = $${i++}`; params.push(opts.status); }
  if (opts.platform) { sql += ` AND platform = $${i++}`; params.push(opts.platform); }
  if (opts.sku) { sql += ` AND sku = $${i++}`; params.push(opts.sku); }
  sql += ` ORDER BY return_date DESC NULLS LAST LIMIT $${i}`;
  params.push(opts.limit ?? 200);
  const { rows } = await db.query(sql, params);
  return rows;
}

export async function getReturnStats(userId: string) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'pending') AS pending,
       COUNT(*) FILTER (WHERE status = 'resellable') AS resellable,
       COALESCE(SUM(refund_amount), 0) AS total_refunded,
       COUNT(*) FILTER (WHERE action = 'supplier_claim') AS supplier_claims,
       COUNT(DISTINCT sku) AS skus_affected
     FROM return_items WHERE user_id = $1`,
    [userId],
  );
  return rows[0];
}

export async function updateReturn(userId: string, id: string, data: {
  status?: string; action?: string; notes?: string; refund_amount?: number;
}) {
  const fields: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { fields.push(`${k} = $${i++}`); vals.push(v); }
  }
  if (!fields.length) return;
  vals.push(id, userId);
  await db.query(
    `UPDATE return_items SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
    vals,
  );
}

export async function getReturnAnalytics(userId: string) {
  const { rows } = await db.query(
    `SELECT ri.sku, ri.platform, ri.title,
       COUNT(*) AS return_count,
       ROUND(COUNT(*)::numeric / NULLIF((
         SELECT SUM(quantity) FROM finance_records fr
         WHERE fr.user_id = $1 AND fr.sku = ri.sku AND fr.platform = ri.platform
           AND fr.period_from >= CURRENT_DATE - INTERVAL '90 days'
       ), 0) * 100, 1) AS return_rate,
       MODE() WITHIN GROUP (ORDER BY ri.reason_code) AS top_reason_code,
       MODE() WITHIN GROUP (ORDER BY ri.reason) AS top_reason
     FROM return_items ri
     WHERE ri.user_id = $1
     GROUP BY ri.sku, ri.platform, ri.title
     ORDER BY return_count DESC
     LIMIT 50`,
    [userId],
  );
  return rows;
}

// Manual return entry
export async function createReturn(
  userId: string,
  data: { platform: string; sku: string; title?: string; qty?: number; reason?: string; reason_code?: string; order_id?: string; return_id?: string; refund_amount?: number; return_date?: string; action?: string; notes?: string },
) {
  const { rows } = await db.query(
    `INSERT INTO return_items (user_id, platform, sku, title, order_id, return_id, qty, reason, reason_code, refund_amount, action, notes, return_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [userId, data.platform, data.sku, data.title ?? null, data.order_id ?? null, data.return_id ?? null,
     data.qty ?? 1, data.reason ?? null, data.reason_code ?? null, data.refund_amount ?? null,
     data.action ?? null, data.notes ?? null, data.return_date ?? null],
  );
  return rows[0];
}

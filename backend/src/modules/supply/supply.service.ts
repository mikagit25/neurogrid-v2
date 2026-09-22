import { db } from '../../db';
import { createAdapter } from '../../integrations/marketplace/factory';

// ---- Forecast Computation ----

export async function computeRestockForecasts(userId: string): Promise<number> {
  const { rows: connections } = await db.query(
    `SELECT id, platform, credentials_enc FROM marketplace_connections WHERE user_id = $1 AND status = 'active'`,
    [userId],
  );

  let computed = 0;
  for (const conn of connections) {
    try {
      const adapter = createAdapter(conn.platform, conn.credentials_enc);
      const products = await adapter.getProducts(500);

      for (const p of products) {
        const stock = p.stock ?? 0;

        // Avg daily sales from last 30 days of finance records
        const { rows: salesData } = await db.query(
          `SELECT COALESCE(SUM(quantity), 0)::numeric / 30 AS avg_daily
           FROM finance_records
           WHERE user_id = $1 AND sku = $2 AND platform = $3
             AND period_from >= CURRENT_DATE - INTERVAL '30 days'`,
          [userId, p.sku, conn.platform],
        );

        const avgDaily = Number(salesData[0]?.avg_daily ?? 0);
        const daysLeft = avgDaily > 0 ? Math.floor(stock / avgDaily) : null;

        // Reorder at 14-day supply; suggest 30-day supply
        const reorderPoint = avgDaily > 0 ? Math.ceil(avgDaily * 14) : null;
        const reorderQty = avgDaily > 0 ? Math.ceil(avgDaily * 30) : null;

        let status = 'ok';
        if (stock === 0) status = 'out_of_stock';
        else if (daysLeft !== null && daysLeft <= 3) status = 'critical';
        else if (daysLeft !== null && daysLeft <= 14) status = 'warning';

        await db.query(
          `INSERT INTO restock_forecasts
             (user_id, connection_id, platform, sku, title, current_stock, avg_daily_sales, days_left, reorder_point, reorder_qty, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (connection_id, sku) DO UPDATE SET
             title=$5, current_stock=$6, avg_daily_sales=$7, days_left=$8,
             reorder_point=$9, reorder_qty=$10, status=$11, computed_at=now()`,
          [userId, conn.id, conn.platform, p.sku, p.title ?? null, stock,
           avgDaily, daysLeft, reorderPoint, reorderQty, status],
        );
        computed++;
      }
    } catch (err: any) {
      console.error(`[supply] forecast conn=${conn.id}:`, err.message);
    }
  }
  return computed;
}

export async function getRestockForecasts(
  userId: string,
  opts: { status?: string; platform?: string; sortBy?: string },
) {
  let sql = `SELECT * FROM restock_forecasts WHERE user_id = $1`;
  const params: any[] = [userId];
  let i = 2;
  if (opts.status) { sql += ` AND status = $${i++}`; params.push(opts.status); }
  if (opts.platform) { sql += ` AND platform = $${i++}`; params.push(opts.platform); }

  const orderCol = opts.sortBy === 'days_left' ? 'days_left ASC NULLS FIRST'
    : opts.sortBy === 'stock' ? 'current_stock ASC'
    : 'days_left ASC NULLS FIRST, current_stock ASC';
  sql += ` ORDER BY ${orderCol}`;
  const { rows } = await db.query(sql, params);
  return rows;
}

// ---- Purchase Orders ----

export async function createPurchaseOrder(
  userId: string,
  data: { platform: string; sku: string; title?: string; qty: number; unit_cost?: number; supplier?: string; notes?: string; expected_at?: string },
) {
  const total = data.unit_cost ? data.qty * data.unit_cost : null;
  const { rows } = await db.query(
    `INSERT INTO purchase_orders (user_id, platform, sku, title, qty, unit_cost, total_cost, supplier, notes, expected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [userId, data.platform, data.sku, data.title ?? null, data.qty, data.unit_cost ?? null, total,
     data.supplier ?? null, data.notes ?? null, data.expected_at ?? null],
  );
  return rows[0];
}

export async function getPurchaseOrders(userId: string, status?: string) {
  const { rows } = await db.query(
    `SELECT * FROM purchase_orders WHERE user_id = $1 ${status ? 'AND status = $2' : ''} ORDER BY created_at DESC`,
    status ? [userId, status] : [userId],
  );
  return rows;
}

export async function updatePurchaseOrder(userId: string, id: string, data: Partial<{
  status: string; qty: number; unit_cost: number; supplier: string; notes: string; expected_at: string; received_at: string;
}>) {
  const fields: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { fields.push(`${k} = $${i++}`); vals.push(v); }
  }
  if (!fields.length) return;
  // Recalculate total_cost inline using the new qty/unit_cost values if either changed
  if (data.unit_cost !== undefined || data.qty !== undefined) {
    fields.push(`total_cost = COALESCE($${i++}, qty) * COALESCE($${i++}, unit_cost, 0)`);
    vals.push(data.qty ?? null, data.unit_cost ?? null);
  }
  vals.push(id, userId);
  await db.query(`UPDATE purchase_orders SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i}`, vals);
}

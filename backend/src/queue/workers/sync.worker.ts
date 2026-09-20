import { db } from '../../db';
import { syncWarehouseStocks } from '../../modules/warehouse/warehouse.service';
import { syncFinanceRecords } from '../../modules/finance/finance.service';

const LOW_STOCK_THRESHOLD = 10;

async function getAllUserIds(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT mc.user_id
     FROM marketplace_connections mc
     WHERE mc.status = 'active'`,
  );
  return rows.map((r: any) => r.user_id);
}

async function runStockAlerts(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    try {
      const { rows: lowRows } = await db.query(
        `SELECT platform, sku, title, SUM(quantity)::int AS total_qty
         FROM stock_snapshots
         WHERE user_id = $1
           AND snapped_at > now() - interval '3 hours'
         GROUP BY platform, sku, title
         HAVING SUM(quantity) <= $2`,
        [userId, LOW_STOCK_THRESHOLD],
      );

      for (const row of lowRows) {
        // Dedup: skip if we already notified this sku/platform in the last 24h
        const { rows: existing } = await db.query(
          `SELECT 1 FROM notifications
           WHERE user_id = $1 AND type = 'stock_alert'
             AND (meta->>'sku') = $2
             AND (meta->>'platform') = $3
             AND created_at > now() - interval '24 hours'
           LIMIT 1`,
          [userId, row.sku, row.platform],
        );
        if (existing.length > 0) continue;

        const qty = Number(row.total_qty);
        const name = row.title || row.sku;
        const platformLabel = String(row.platform).toUpperCase();
        const text = qty === 0
          ? `Товар «${name}» закончился на ${platformLabel} — пополните сток`
          : `Остаток товара «${name}» на ${platformLabel}: ${qty} ед. — пора пополнять`;

        await db.query(
          `INSERT INTO notifications (user_id, type, text, meta)
           VALUES ($1, 'stock_alert', $2, $3)`,
          [userId, text, JSON.stringify({ sku: row.sku, platform: row.platform, qty })],
        );
        console.log(`[sync] stock alert: user=${userId} sku=${row.sku} platform=${row.platform} qty=${qty}`);
      }
    } catch (err) {
      console.error(`[sync] stock alerts error user=${userId}:`, err);
    }
  }
}

function dateRange(daysBack: number) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - daysBack);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export async function runStockSync() {
  const userIds = await getAllUserIds();
  console.log(`[sync] stock sync for ${userIds.length} users`);
  for (const userId of userIds) {
    try {
      const n = await syncWarehouseStocks(userId);
      console.log(`[sync] stock: user=${userId} rows=${n}`);
    } catch (err) {
      console.error(`[sync] stock error user=${userId}:`, err);
    }
  }
  await runStockAlerts(userIds);
}

export async function runFinanceSync() {
  const userIds = await getAllUserIds();
  const { from, to } = dateRange(30);
  console.log(`[sync] finance sync ${from}→${to} for ${userIds.length} users`);
  for (const userId of userIds) {
    try {
      const n = await syncFinanceRecords(userId, from, to);
      console.log(`[sync] finance: user=${userId} records=${n}`);
    } catch (err) {
      console.error(`[sync] finance error user=${userId}:`, err);
    }
  }
}

export function startSyncWorker() {
  // Stock: every hour
  setInterval(() => { runStockSync().catch(console.error); }, 60 * 60 * 1000);
  // Finance: every 6 hours
  setInterval(() => { runFinanceSync().catch(console.error); }, 6 * 60 * 60 * 1000);

  // Run once on startup after 30s delay
  setTimeout(() => { runStockSync().catch(console.error); }, 30_000);
  setTimeout(() => { runFinanceSync().catch(console.error); }, 60_000);
}

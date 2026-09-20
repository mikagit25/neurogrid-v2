import { db } from '../../db';
import { syncWarehouseStocks } from '../../modules/warehouse/warehouse.service';
import { syncFinanceRecords } from '../../modules/finance/finance.service';

async function getAllUserIds(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT mc.user_id
     FROM marketplace_connections mc
     WHERE mc.status = 'active'`,
  );
  return rows.map((r: any) => r.user_id);
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

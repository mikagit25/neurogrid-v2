import { db } from '../../db';
import { syncWarehouseStocks } from '../../modules/warehouse/warehouse.service';
import { syncFinanceRecords } from '../../modules/finance/finance.service';
import { sendDailyDigest } from '../../utils/mailer';
import { config } from '../../config';
import { runPricingWorker } from './pricing.worker';

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

export async function runDailyDigest(): Promise<void> {
  const { rows: users } = await db.query<{ id: string; email: string }>(
    `SELECT u.id, u.email
     FROM users u
     WHERE u.digest_enabled = true
       AND EXISTS (
         SELECT 1 FROM marketplace_connections mc
         WHERE mc.user_id = u.id AND mc.status = 'active'
       )`,
  );

  console.log(`[digest] sending to ${users.length} users`);

  for (const user of users) {
    try {
      const [revRow, platformRows, alertRows, unreadRow] = await Promise.all([
        db.query<{ total_revenue: string; total_net_payout: string; total_qty: string }>(
          `SELECT COALESCE(SUM(revenue),0)::numeric AS total_revenue,
                  COALESCE(SUM(net_payout),0)::numeric AS total_net_payout,
                  COALESCE(SUM(quantity),0)::int AS total_qty
           FROM finance_records
           WHERE user_id = $1 AND period_from >= now()::date - interval '7 days'`,
          [user.id],
        ),
        db.query<{ platform: string; revenue: string; net_payout: string }>(
          `SELECT platform,
                  COALESCE(SUM(revenue),0)::numeric AS revenue,
                  COALESCE(SUM(net_payout),0)::numeric AS net_payout
           FROM finance_records
           WHERE user_id = $1 AND period_from >= now()::date - interval '7 days'
           GROUP BY platform ORDER BY SUM(revenue) DESC`,
          [user.id],
        ),
        db.query<{ platform: string; sku: string; title: string; qty: number }>(
          `SELECT platform, sku, title, SUM(quantity)::int AS qty
           FROM stock_snapshots
           WHERE user_id = $1 AND snapped_at > now() - interval '3 hours'
           GROUP BY platform, sku, title
           HAVING SUM(quantity) <= 10
           ORDER BY SUM(quantity) ASC
           LIMIT 10`,
          [user.id],
        ),
        db.query<{ unread: number }>(
          `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = false`,
          [user.id],
        ),
      ]);

      await sendDailyDigest(user.email, {
        revenue7d:   Number(revRow.rows[0]?.total_revenue ?? 0),
        netPayout7d: Number(revRow.rows[0]?.total_net_payout ?? 0),
        qty7d:       Number(revRow.rows[0]?.total_qty ?? 0),
        byPlatform:  platformRows.rows.map((r) => ({ platform: r.platform, revenue: Number(r.revenue), netPayout: Number(r.net_payout) })),
        stockAlerts: alertRows.rows.map((r) => ({ title: r.title || r.sku, platform: r.platform, qty: r.qty })),
        unread:      Number(unreadRow.rows[0]?.unread ?? 0),
        appUrl:      config.frontendUrl,
      });
    } catch (err) {
      console.error(`[digest] error for user=${user.id}:`, err);
    }
  }
}

function msUntilNext8AM(): number {
  // Target 08:00 Moscow time (UTC+3 = 05:00 UTC)
  const now = new Date();
  const nowUtc = now.getTime();
  const moscowOffsetMs = 3 * 60 * 60 * 1000;
  const nowMoscow = new Date(nowUtc + moscowOffsetMs);
  const nextMoscow = new Date(nowMoscow);
  nextMoscow.setUTCHours(8, 0, 0, 0);
  if (nextMoscow <= nowMoscow) nextMoscow.setUTCDate(nextMoscow.getUTCDate() + 1);
  return nextMoscow.getTime() - nowMoscow.getTime();
}

export function startSyncWorker() {
  // Stock: every hour
  setInterval(() => { runStockSync().catch(console.error); }, 60 * 60 * 1000);
  // Finance: every 6 hours
  setInterval(() => { runFinanceSync().catch(console.error); }, 6 * 60 * 60 * 1000);
  // Pricing rules: every 6 hours
  setInterval(() => { runPricingWorker().catch(console.error); }, 6 * 60 * 60 * 1000);
  // Digest: daily at 08:00
  setTimeout(() => {
    runDailyDigest().catch(console.error);
    setInterval(() => { runDailyDigest().catch(console.error); }, 24 * 60 * 60 * 1000);
  }, msUntilNext8AM());

  // Run once on startup after 30s delay
  setTimeout(() => { runStockSync().catch(console.error); }, 30_000);
  setTimeout(() => { runFinanceSync().catch(console.error); }, 60_000);
}

import { db } from '../../db';
import { syncWarehouseStocks } from '../../modules/warehouse/warehouse.service';
import { syncFinanceRecords } from '../../modules/finance/finance.service';
import { sendDailyDigest, sendMail } from '../../utils/mailer';
import { config } from '../../config';
import { runPricingWorker } from './pricing.worker';
import { PLAN_PRICES, type Plan } from '../../modules/subscriptions/subscriptions.service';
import { generateAndEmailReport } from '../../modules/reports/reports.service';

const LOW_STOCK_THRESHOLD = 10;

async function getAllUserIds(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT mc.user_id
     FROM marketplace_connections mc
     JOIN users u ON u.id = mc.user_id
     WHERE mc.status = 'active'
       AND u.is_demo = false
       AND mc.credentials_enc != 'demo_placeholder'`,
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
      const [revRow, platformRows, alertRows, unreadRow, reviewRow, posDropRow] = await Promise.all([
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
        db.query<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt FROM product_reviews
           WHERE user_id = $1 AND is_answered = false`,
          [user.id],
        ),
        db.query<{ cnt: number }>(
          // Count keywords where latest position is >5 worse than the prior check
          `SELECT COUNT(*)::int AS cnt
           FROM (
             SELECT kp.keyword_id,
               FIRST_VALUE(kp.position) OVER (PARTITION BY kp.keyword_id ORDER BY kp.checked_at DESC) AS latest,
               NTH_VALUE(kp.position, 2) OVER (PARTITION BY kp.keyword_id ORDER BY kp.checked_at DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS prev
             FROM keyword_positions kp
             JOIN tracked_keywords tk ON tk.id = kp.keyword_id
             WHERE tk.user_id = $1 AND kp.checked_at >= now() - interval '7 days'
           ) sub
           WHERE latest IS NOT NULL AND prev IS NOT NULL AND latest > prev + 5`,
          [user.id],
        ),
      ]);

      await sendDailyDigest(user.email, {
        revenue7d:          Number(revRow.rows[0]?.total_revenue ?? 0),
        netPayout7d:        Number(revRow.rows[0]?.total_net_payout ?? 0),
        qty7d:              Number(revRow.rows[0]?.total_qty ?? 0),
        byPlatform:         platformRows.rows.map((r) => ({ platform: r.platform, revenue: Number(r.revenue), netPayout: Number(r.net_payout) })),
        stockAlerts:        alertRows.rows.map((r) => ({ title: r.title || r.sku, platform: r.platform, qty: r.qty })),
        unread:             Number(unreadRow.rows[0]?.unread ?? 0),
        unansweredReviews:  Number(reviewRow.rows[0]?.cnt ?? 0),
        positionDrops:      Number(posDropRow.rows[0]?.cnt ?? 0),
        appUrl:             config.frontendUrl,
      });
    } catch (err) {
      console.error(`[digest] error for user=${user.id}:`, err);
    }
  }
}

export async function runMonthlyRenewal(): Promise<void> {
  // Renew all active paid subscriptions: deduct price from balance or downgrade to free
  const { rows: subs } = await db.query<{ user_id: string; plan: string }>(
    `SELECT s.user_id, s.plan FROM subscriptions s
     WHERE s.plan IN ('start', 'business')
       AND s.expires_at IS NOT NULL
       AND s.expires_at <= now() + interval '2 days'`,
  );
  console.log(`[renewal] processing ${subs.length} subscriptions`);

  for (const sub of subs) {
    const price = PLAN_PRICES[sub.plan as Plan] ?? 0;
    if (price === 0) continue;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query(
        'SELECT balance, email FROM users WHERE id = $1 FOR UPDATE',
        [sub.user_id],
      );
      const balance = parseFloat(userRows[0]?.balance ?? '0');
      const email: string = userRows[0]?.email ?? '';

      if (balance >= price) {
        // Renew: deduct + extend by 1 month
        const newBalance = balance - price;
        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, sub.user_id]);
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, provider_id)
           VALUES ($1, 'charge', $2, $3)`,
          [sub.user_id, price, `subscription_renewal:${sub.plan}`],
        );
        await client.query(
          `UPDATE subscriptions SET expires_at = expires_at + interval '1 month', updated_at = now()
           WHERE user_id = $1`,
          [sub.user_id],
        );
        await client.query('COMMIT');
        console.log(`[renewal] renewed user=${sub.user_id} plan=${sub.plan} charged=${price}`);
        // Email notification
        try {
          await sendMail({
            to: email,
            subject: `NeuroGrid: тариф «${sub.plan === 'start' ? 'Старт' : 'Бизнес'}» продлён`,
            html: `<p>Ваш тариф <strong>${sub.plan === 'start' ? 'Старт' : 'Бизнес'}</strong> продлён на месяц. Списано ${price} ₽. Остаток: ${newBalance.toFixed(2)} ₽.</p><p><a href="${config.frontendUrl}/wallet">Перейти в кошелёк</a></p>`,
          });
        } catch { /* mail failure non-critical */ }
      } else {
        // Insufficient funds — downgrade to free
        await client.query(
          `UPDATE subscriptions SET plan = 'free', expires_at = NULL, updated_at = now()
           WHERE user_id = $1`,
          [sub.user_id],
        );
        await client.query('COMMIT');
        console.log(`[renewal] downgraded user=${sub.user_id} (balance=${balance} < price=${price})`);
        try {
          await sendMail({
            to: email,
            subject: 'NeuroGrid: тариф понижен до Бесплатного',
            html: `<p>К сожалению, на вашем балансе недостаточно средств (${balance.toFixed(2)} ₽) для продления тарифа. Ваш тариф понижен до <strong>Бесплатного</strong>.</p><p>Пополните баланс и обновите тариф: <a href="${config.frontendUrl}/pricing">${config.frontendUrl}/pricing</a></p>`,
          });
        } catch { /* mail failure non-critical */ }
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[renewal] error user=${sub.user_id}:`, err);
    } finally {
      client.release();
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

export async function runWeeklyReports(): Promise<void> {
  const { rows: users } = await db.query<{ id: string; email: string }>(
    `SELECT u.id, u.email
     FROM users u
     WHERE u.digest_enabled = true
       AND EXISTS (
         SELECT 1 FROM marketplace_connections mc
         WHERE mc.user_id = u.id AND mc.status = 'active'
       )`,
  );
  console.log(`[weekly-reports] generating for ${users.length} users`);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 7 * 86400000);
  for (const user of users) {
    try {
      await generateAndEmailReport(user.id, user.email, start, end);
      console.log(`[weekly-reports] sent to ${user.email}`);
    } catch (err) {
      console.error(`[weekly-reports] error for ${user.email}:`, err);
    }
  }
}

function msUntilNextMonday9AM(): number {
  const moscowOffsetMs = 3 * 60 * 60 * 1000;
  const now = new Date();
  const nowMoscow = new Date(now.getTime() + moscowOffsetMs);
  // day 0=Sun,1=Mon,...,6=Sat — target Monday 09:00 Moscow
  const day = nowMoscow.getUTCDay();
  const daysUntilMon = day === 1 ? 7 : (8 - day) % 7;
  const nextMon = new Date(nowMoscow);
  nextMon.setUTCDate(nowMoscow.getUTCDate() + daysUntilMon);
  nextMon.setUTCHours(9, 0, 0, 0);
  // nextMon is Monday 09:00 Moscow (= 06:00 UTC)
  return nextMon.getTime() - nowMoscow.getTime();
}

function msUntilFirst3AM(): number {
  // Target 03:00 Moscow time on the 1st of next month
  const now = new Date();
  const moscowOffsetMs = 3 * 60 * 60 * 1000;
  const nowMoscow = new Date(now.getTime() + moscowOffsetMs);
  const next = new Date(Date.UTC(nowMoscow.getUTCFullYear(), nowMoscow.getUTCMonth() + 1, 1, 0, 0, 0));
  // next is 00:00 UTC on 1st of next month = 03:00 Moscow
  return next.getTime() - now.getTime();
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

  // Monthly renewal: 1st of month at 03:00 Moscow
  function scheduleNextRenewal() {
    const ms = msUntilFirst3AM();
    console.log(`[renewal] next run in ${Math.round(ms / 3600000)}h`);
    setTimeout(() => {
      runMonthlyRenewal().catch(console.error);
      scheduleNextRenewal();
    }, ms);
  }
  scheduleNextRenewal();

  // Weekly reports: every Monday at 09:00 Moscow
  function scheduleNextWeeklyReports() {
    const ms = msUntilNextMonday9AM();
    console.log(`[weekly-reports] next run in ${Math.round(ms / 3600000)}h`);
    setTimeout(() => {
      runWeeklyReports().catch(console.error);
      scheduleNextWeeklyReports();
    }, ms);
  }
  scheduleNextWeeklyReports();

  // Run once on startup after 30s delay
  setTimeout(() => { runStockSync().catch(console.error); }, 30_000);
  setTimeout(() => { runFinanceSync().catch(console.error); }, 60_000);
}

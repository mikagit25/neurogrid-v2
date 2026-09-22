import { db } from '../../db';
import { notifyUser } from '../../modules/telegram/telegram.service';
import { dispatchWebhookEvent } from '../../modules/webhooks/webhooks.service';
import { sendAlertEmail } from '../../utils/mailer';
import { config } from '../../config';

async function getAllUsersWithConnections(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT user_id FROM marketplace_connections WHERE status = 'active'`,
  );
  return rows.map((r: any) => r.user_id);
}

async function getActiveRules(userId: string) {
  const { rows } = await db.query(
    `SELECT * FROM alert_rules WHERE user_id = $1 AND is_active = true`,
    [userId],
  );
  return rows;
}

async function isDuplicate(userId: string, type: string, sku: string | null, platform: string | null): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM alert_events
     WHERE user_id = $1 AND type = $2
       AND (sku = $3 OR ($3 IS NULL AND sku IS NULL))
       AND (platform = $4 OR ($4 IS NULL AND platform IS NULL))
       AND triggered_at > now() - interval '6 hours'
     LIMIT 1`,
    [userId, type, sku, platform],
  );
  return rows.length > 0;
}

async function fireAlert(
  userId: string,
  ruleId: string | null,
  type: string,
  platform: string | null,
  sku: string | null,
  skuTitle: string | null,
  value: number | null,
  threshold: number | null,
  message: string,
) {
  if (await isDuplicate(userId, type, sku, platform)) return;

  await db.query(
    `INSERT INTO alert_events (user_id, rule_id, type, platform, sku, sku_title, value, threshold, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [userId, ruleId, type, platform, sku, skuTitle, value, threshold, message],
  );

  // Push to notifications table for the bell icon
  await db.query(
    `INSERT INTO notifications (user_id, type, text, meta)
     VALUES ($1, $2, $3, $4)`,
    [userId, `alert_${type}`, message, JSON.stringify({ sku, platform, value, threshold })],
  );

  // Send Telegram notification
  notifyUser(userId, `🔔 <b>NeuroGrid Alert</b>\n${message}`).catch(() => {});

  // Dispatch outbound webhook
  dispatchWebhookEvent(userId, 'alert.fired', { type, platform, sku, value, threshold, message }).catch(() => {});

  // Send instant email if user has alert_email_enabled
  db.query<{ email: string; alert_email_enabled: boolean }>(
    `SELECT email, alert_email_enabled FROM users WHERE id = $1`, [userId],
  ).then(({ rows }) => {
    if (rows[0]?.alert_email_enabled) {
      sendAlertEmail(rows[0].email, type, message, { sku, platform, value, threshold }, config.frontendUrl).catch(() => {});
    }
  }).catch(() => {});
}

async function checkLowStock(userId: string, rule: any) {
  const threshold = Number(rule.threshold ?? 10);
  const platformFilter = rule.platform ? 'AND platform = $3' : '';
  const skuFilter = rule.sku ? `AND sku = ${rule.platform ? '$4' : '$3'}` : '';
  const params: unknown[] = [userId, threshold];
  if (rule.platform) params.push(rule.platform);
  if (rule.sku) params.push(rule.sku);

  const { rows } = await db.query(
    `SELECT platform, sku, title, SUM(quantity)::int AS total_qty
     FROM stock_snapshots
     WHERE user_id = $1
       AND snapped_at > now() - interval '3 hours'
       ${platformFilter} ${skuFilter}
     GROUP BY platform, sku, title
     HAVING SUM(quantity) <= $2`,
    params,
  );

  for (const row of rows) {
    const qty = Number(row.total_qty);
    const name = row.title || row.sku;
    const pl = String(row.platform).toUpperCase();
    const msg = qty === 0
      ? `Товар «${name}» закончился на ${pl}`
      : `Остаток «${name}» на ${pl}: ${qty} ед. (порог ${threshold})`;
    await fireAlert(userId, rule.id, 'low_stock', row.platform, row.sku, row.title, qty, threshold, msg);
  }
}

async function checkPnlNegative(userId: string, rule: any) {
  const dateFrom = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const dateTo = new Date().toISOString().slice(0, 10);
  const platformFilter = rule.platform ? 'AND fr.platform = $4' : '';
  const params: unknown[] = [userId, dateFrom, dateTo];
  if (rule.platform) params.push(rule.platform);

  const { rows } = await db.query(
    `SELECT
       fr.platform, fr.sku,
       COALESCE(uc.title, fr.title) AS title,
       SUM(fr.net_payout)::numeric(12,2) AS net_payout,
       COALESCE(SUM(uc.purchase_price * fr.quantity), 0)::numeric(12,2) AS cogs,
       COALESCE((
         SELECT SUM(ar.spend)
         FROM advertising_records ar
         WHERE ar.user_id = fr.user_id AND ar.platform = fr.platform
           AND ar.sku = fr.sku AND ar.date BETWEEN $2 AND $3
       ), 0)::numeric(12,2) AS ad_spend
     FROM finance_records fr
     LEFT JOIN user_catalog uc ON uc.user_id = fr.user_id AND uc.platform = fr.platform AND uc.sku = fr.sku
     WHERE fr.user_id = $1 AND fr.period_from >= $2 AND fr.period_to <= $3
       ${platformFilter}
       AND uc.purchase_price IS NOT NULL
     GROUP BY fr.platform, fr.sku, uc.title, fr.title, uc.purchase_price`,
    params,
  );

  for (const row of rows) {
    const netProfit = Number(row.net_payout) - Number(row.ad_spend) - Number(row.cogs);
    if (netProfit < 0) {
      const name = row.title || row.sku;
      const pl = String(row.platform).toUpperCase();
      const msg = `SKU «${name}» (${pl}) убыточен за 30 дней: ${Math.round(netProfit).toLocaleString('ru-RU')} ₽`;
      await fireAlert(userId, rule.id, 'pnl_negative', row.platform, row.sku, row.title, netProfit, 0, msg);
    }
  }
}

async function checkSalesDrop(userId: string, rule: any) {
  const dropThreshold = Number(rule.threshold ?? 30); // default 30% drop
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const d3Ago = new Date(now.getTime() - 3 * 86400_000).toISOString().slice(0, 10);
  const d10Ago = new Date(now.getTime() - 10 * 86400_000).toISOString().slice(0, 10);

  const { rows: recent } = await db.query(
    `SELECT platform, SUM(revenue)::numeric(12,2) AS rev
     FROM finance_records WHERE user_id = $1 AND period_from >= $2 AND period_to <= $3
     GROUP BY platform`,
    [userId, d3Ago, todayStr],
  );
  const { rows: prior } = await db.query(
    `SELECT platform, SUM(revenue)::numeric(12,2) AS rev
     FROM finance_records WHERE user_id = $1 AND period_from >= $2 AND period_to < $3
     GROUP BY platform`,
    [userId, d10Ago, d3Ago],
  );

  const priorMap: Record<string, number> = {};
  for (const r of prior) priorMap[r.platform] = Number(r.rev);

  for (const r of recent) {
    const recentRev = Number(r.rev);
    const priorRev = priorMap[r.platform] ?? 0;
    if (priorRev <= 0) continue;
    const dropPct = ((priorRev - recentRev) / priorRev) * 100;
    if (dropPct >= dropThreshold) {
      const pl = String(r.platform).toUpperCase();
      const msg = `Выручка на ${pl} упала на ${Math.round(dropPct)}% за последние 3 дня`;
      await fireAlert(userId, rule.id, 'sales_drop', r.platform, null, null, dropPct, dropThreshold, msg);
    }
  }
}

async function checkHighReturns(userId: string, rule: any) {
  const threshold = Number(rule.threshold ?? 15);
  const dateFrom = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const dateTo = new Date().toISOString().slice(0, 10);

  // Return rate = penalty amounts as proxy for returns cost
  // A more accurate approach would use the orders table returns
  const { rows } = await db.query(
    `SELECT fr.platform, fr.sku, COALESCE(uc.title, fr.title) AS title,
            SUM(fr.quantity)::int AS qty, SUM(fr.penalty)::numeric(12,2) AS penalties,
            SUM(fr.revenue)::numeric(12,2) AS revenue
     FROM finance_records fr
     LEFT JOIN user_catalog uc ON uc.user_id = fr.user_id AND uc.platform = fr.platform AND uc.sku = fr.sku
     WHERE fr.user_id = $1 AND fr.period_from >= $2 AND fr.period_to <= $3
       AND fr.revenue > 0
     GROUP BY fr.platform, fr.sku, uc.title, fr.title
     HAVING SUM(fr.penalty) / NULLIF(SUM(fr.revenue), 0) * 100 >= $4`,
    [userId, dateFrom, dateTo, threshold],
  );

  for (const row of rows) {
    const rate = Math.round((Number(row.penalties) / Number(row.revenue)) * 1000) / 10;
    const name = row.title || row.sku;
    const pl = String(row.platform).toUpperCase();
    const msg = `Высокие штрафы/возвраты по «${name}» (${pl}): ${rate}% от выручки (порог ${threshold}%)`;
    await fireAlert(userId, rule.id, 'high_returns', row.platform, row.sku, row.title, rate, threshold, msg);
  }
}

function applyComparison(value: number, threshold: number, comparison: string): boolean {
  switch (comparison) {
    case 'lt':         return value < threshold;
    case 'lte':        return value <= threshold;
    case 'gt':         return value > threshold;
    case 'gte':        return value >= threshold;
    case 'change_pct': return Math.abs(value) >= threshold;
    default:           return false;
  }
}

async function evaluateCustomRule(rule: any): Promise<void> {
  const userId: string = rule.user_id;
  const condition: Record<string, any> = rule.condition ?? {};
  const threshold = Number(rule.threshold);
  const comparison: string = rule.comparison;

  switch (rule.rule_type) {
    case 'stock_low': {
      const params: unknown[] = [userId];
      let extra = '';
      if (condition.platform) { params.push(condition.platform); extra += ` AND platform = $${params.length}`; }
      if (condition.sku)      { params.push(condition.sku);      extra += ` AND sku = $${params.length}`; }
      const { rows } = await db.query(
        `SELECT platform, sku, title, SUM(quantity)::float AS qty
         FROM stock_snapshots
         WHERE user_id = $1 AND snapped_at > now() - interval '4 hours' ${extra}
         GROUP BY platform, sku, title`,
        params,
      );
      for (const row of rows) {
        if (!applyComparison(Number(row.qty), threshold, comparison)) continue;
        const msg = `[${rule.name}] Остаток «${row.title || row.sku}» (${String(row.platform).toUpperCase()}): ${Math.round(row.qty)} ед.`;
        await fireAlert(userId, rule.id, 'stock_low', row.platform, row.sku, row.title, Number(row.qty), threshold, msg);
        await db.query(`UPDATE custom_alert_rules SET last_fired_at = now(), fire_count = fire_count + 1 WHERE id = $1`, [rule.id]);
      }
      break;
    }

    case 'drr_high': {
      const days = condition.days ?? 7;
      const params: unknown[] = [userId, days];
      if (condition.platform) params.push(condition.platform);
      const platCond = condition.platform ? ` AND platform = $${params.length}` : '';
      const { rows } = await db.query(
        `SELECT platform, SUM(spend)::float AS spend, SUM(revenue)::float AS rev
         FROM advertising_records
         WHERE user_id = $1 AND date > now() - ($2::text || ' days')::interval ${platCond}
         GROUP BY platform`,
        params,
      );
      for (const row of rows) {
        if (!row.rev || Number(row.rev) <= 0) continue;
        const drr = (Number(row.spend) / Number(row.rev)) * 100;
        if (!applyComparison(drr, threshold, comparison)) continue;
        const msg = `[${rule.name}] ДРР на ${String(row.platform).toUpperCase()}: ${drr.toFixed(1)}% (порог ${threshold}%)`;
        await fireAlert(userId, rule.id, 'drr_high', row.platform, null, null, drr, threshold, msg);
        await db.query(`UPDATE custom_alert_rules SET last_fired_at = now(), fire_count = fire_count + 1 WHERE id = $1`, [rule.id]);
      }
      break;
    }

    case 'no_sales': {
      const days = threshold;
      const params: unknown[] = [userId, days];
      let extra = '';
      if (condition.platform) { params.push(condition.platform); extra += ` AND uc.platform = $${params.length}`; }
      if (condition.sku)      { params.push(condition.sku);      extra += ` AND uc.sku = $${params.length}`; }
      const { rows } = await db.query(
        `SELECT uc.platform, uc.sku, uc.title
         FROM user_catalog uc
         WHERE uc.user_id = $1 ${extra}
           AND NOT EXISTS (
             SELECT 1 FROM finance_records fr
             WHERE fr.user_id = $1 AND fr.sku = uc.sku AND fr.platform = uc.platform
               AND fr.revenue > 0 AND fr.period_from > now() - ($2::text || ' days')::interval
           )
         LIMIT 10`,
        params,
      );
      for (const row of rows) {
        const msg = `[${rule.name}] Нет продаж «${row.title || row.sku}» (${String(row.platform).toUpperCase()}) за ${days} дней`;
        await fireAlert(userId, rule.id, 'no_sales', row.platform, row.sku, row.title, 0, days, msg);
        await db.query(`UPDATE custom_alert_rules SET last_fired_at = now(), fire_count = fire_count + 1 WHERE id = $1`, [rule.id]);
      }
      break;
    }

    case 'price_change': {
      const params: unknown[] = [userId];
      let extra = '';
      if (condition.platform) { params.push(condition.platform); extra += ` AND platform = $${params.length}`; }
      if (condition.sku)      { params.push(condition.sku);      extra += ` AND sku = $${params.length}`; }
      const { rows } = await db.query(
        `SELECT platform, sku, title, pct_change, new_price, old_price
         FROM price_change_log
         WHERE user_id = $1 AND changed_at > now() - interval '24 hours' ${extra}
         ORDER BY ABS(pct_change) DESC LIMIT 20`,
        params,
      ).catch(() => ({ rows: [] as any[] }));
      for (const row of rows) {
        const pct = Math.abs(Number(row.pct_change));
        if (!applyComparison(pct, threshold, comparison)) continue;
        const msg = `[${rule.name}] Цена «${row.title || row.sku}» (${String(row.platform).toUpperCase()}) изменилась на ${pct.toFixed(1)}%`;
        await fireAlert(userId, rule.id, 'price_change', row.platform, row.sku, row.title, pct, threshold, msg);
        await db.query(`UPDATE custom_alert_rules SET last_fired_at = now(), fire_count = fire_count + 1 WHERE id = $1`, [rule.id]);
      }
      break;
    }

    case 'rating_drop': {
      const params: unknown[] = [userId];
      let extra = '';
      if (condition.platform) { params.push(condition.platform); extra += ` AND platform = $${params.length}`; }
      if (condition.sku)      { params.push(condition.sku);      extra += ` AND sku = $${params.length}`; }
      const { rows } = await db.query(
        `SELECT platform, sku, title, avg_rating::float AS rating
         FROM user_catalog
         WHERE user_id = $1 AND avg_rating IS NOT NULL ${extra}`,
        params,
      );
      for (const row of rows) {
        if (!applyComparison(Number(row.rating), threshold, comparison)) continue;
        const msg = `[${rule.name}] Рейтинг «${row.title || row.sku}» (${String(row.platform).toUpperCase()}): ${Number(row.rating).toFixed(1)} (порог ${threshold})`;
        await fireAlert(userId, rule.id, 'rating_drop', row.platform, row.sku, row.title, Number(row.rating), threshold, msg);
        await db.query(`UPDATE custom_alert_rules SET last_fired_at = now(), fire_count = fire_count + 1 WHERE id = $1`, [rule.id]);
      }
      break;
    }
  }
}

export async function runCustomAlertEvaluation(): Promise<void> {
  const { rows: rules } = await db.query(
    `SELECT * FROM custom_alert_rules WHERE enabled = true`,
  );
  for (const rule of rules) {
    try {
      await evaluateCustomRule(rule);
    } catch (err) {
      console.error(`[alerts] custom rule ${rule.id} (${rule.rule_type}):`, err);
    }
  }
}

export async function runAlertChecks(): Promise<void> {
  const userIds = await getAllUsersWithConnections();
  for (const userId of userIds) {
    try {
      const rules = await getActiveRules(userId);
      for (const rule of rules) {
        try {
          switch (rule.type) {
            case 'low_stock':     await checkLowStock(userId, rule);     break;
            case 'pnl_negative':  await checkPnlNegative(userId, rule);  break;
            case 'sales_drop':    await checkSalesDrop(userId, rule);    break;
            case 'high_returns':  await checkHighReturns(userId, rule);  break;
          }
        } catch (err) {
          console.error(`[alerts] rule ${rule.id} (${rule.type}) user=${userId}:`, err);
        }
      }
    } catch (err) {
      console.error(`[alerts] user=${userId}:`, err);
    }
  }
  await runCustomAlertEvaluation();
}

export function startAlertWorker(): void {
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  async function tick() {
    try {
      await runAlertChecks();
    } catch (err) {
      console.error('[alerts] worker tick error:', err);
    }
    setTimeout(tick, INTERVAL_MS);
  }

  // First run after 2 minutes to let the server warm up
  setTimeout(tick, 2 * 60 * 1000);
  console.log('[alerts] worker started — first check in 2 min');
}

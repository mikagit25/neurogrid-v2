import { db } from '../../db';
import { createAdapter } from '../../integrations/marketplace/factory';

async function getConnectionsWithCreds(userId: string) {
  const { rows } = await db.query(
    `SELECT id, platform, credentials_enc, display_name
     FROM marketplace_connections WHERE user_id = $1 AND status = 'active'`,
    [userId],
  );
  return rows;
}

export async function syncFinanceRecords(
  userId: string,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const connections = await getConnectionsWithCreds(userId);
  let total = 0;

  for (const conn of connections) {
    try {
      const adapter = createAdapter(conn.platform, conn.credentials_enc);
      const records = await adapter.getFinanceRecords(dateFrom, dateTo);

      for (const r of records) {
        await db.query(
          `INSERT INTO finance_records
             (connection_id, user_id, platform, period_from, period_to,
              sku, title, quantity, revenue, commission, logistics, penalty, net_payout)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (connection_id, period_from, period_to, sku) DO UPDATE
             SET quantity = $8, revenue = $9, commission = $10,
                 logistics = $11, penalty = $12, net_payout = $13,
                 title = COALESCE($7, finance_records.title),
                 recorded_at = now()`,
          [
            conn.id, userId, conn.platform, dateFrom, dateTo,
            r.sku, r.title, r.quantity,
            r.revenue, r.commission, r.logistics, r.penalty, r.netPayout,
          ],
        );
      }
      total += records.length;
    } catch (err) {
      console.error(`[finance] sync error for connection ${conn.id}:`, err);
    }
  }
  return total;
}

export interface FinanceSummaryResult {
  platform: string;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  gross_profit: number;      // net_payout - cost_of_goods
  cost_of_goods: number;     // purchase_price × quantity
  margin_pct: number;        // gross_profit / revenue × 100
  quantity: number;
}

export async function getFinanceSummary(
  userId: string,
  dateFrom: string,
  dateTo: string,
): Promise<FinanceSummaryResult[]> {
  const { rows } = await db.query(
    `SELECT
       fr.platform,
       SUM(fr.revenue)::numeric(12,2)    AS revenue,
       SUM(fr.commission)::numeric(12,2) AS commission,
       SUM(fr.logistics)::numeric(12,2)  AS logistics,
       SUM(fr.penalty)::numeric(12,2)    AS penalty,
       SUM(fr.net_payout)::numeric(12,2) AS net_payout,
       SUM(fr.quantity)::int             AS quantity,
       COALESCE(SUM(
         CASE WHEN uc.purchase_price IS NOT NULL
              THEN uc.purchase_price * fr.quantity
              ELSE 0 END
       ), 0)::numeric(12,2) AS cost_of_goods
     FROM finance_records fr
     LEFT JOIN user_catalog uc
       ON uc.user_id = fr.user_id AND uc.platform = fr.platform AND uc.sku = fr.sku
     WHERE fr.user_id = $1
       AND fr.period_from >= $2
       AND fr.period_to   <= $3
     GROUP BY fr.platform`,
    [userId, dateFrom, dateTo],
  );

  return rows.map((r: any) => {
    const revenue = Number(r.revenue);
    const netPayout = Number(r.net_payout);
    const costOfGoods = Number(r.cost_of_goods);
    const grossProfit = netPayout - costOfGoods;
    return {
      ...r,
      revenue,
      net_payout: netPayout,
      cost_of_goods: costOfGoods,
      gross_profit: grossProfit,
      margin_pct: revenue > 0 ? Math.round((grossProfit / revenue) * 100 * 10) / 10 : 0,
    };
  });
}

export async function getFinanceRecords(
  userId: string,
  dateFrom: string,
  dateTo: string,
  sku?: string,
) {
  const { rows } = await db.query(
    `SELECT
       fr.platform,
       fr.sku,
       COALESCE(uc.title, fr.title) AS title,
       fr.quantity,
       fr.revenue::numeric(12,2),
       fr.commission::numeric(12,2),
       fr.logistics::numeric(12,2),
       fr.penalty::numeric(12,2),
       fr.net_payout::numeric(12,2),
       COALESCE(uc.purchase_price, null) AS purchase_price,
       CASE WHEN uc.purchase_price IS NOT NULL
            THEN (fr.net_payout - uc.purchase_price * fr.quantity)::numeric(12,2)
            ELSE null END AS gross_profit
     FROM finance_records fr
     LEFT JOIN user_catalog uc
       ON uc.user_id = fr.user_id AND uc.platform = fr.platform AND uc.sku = fr.sku
     WHERE fr.user_id = $1
       AND fr.period_from >= $2
       AND fr.period_to   <= $3
       ${sku ? 'AND fr.sku = $4' : ''}
     ORDER BY fr.revenue DESC`,
    sku ? [userId, dateFrom, dateTo, sku] : [userId, dateFrom, dateTo],
  );
  return rows;
}

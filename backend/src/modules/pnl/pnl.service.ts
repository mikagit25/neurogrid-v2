import { db } from '../../db';

export interface PnlSkuRow {
  platform: string;
  sku: string;
  title: string | null;
  quantity: number;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  ad_spend: number;
  cost_of_goods: number;
  gross_profit: number;  // net_payout - cost_of_goods
  net_profit: number;    // net_payout - ad_spend - cost_of_goods
  margin_pct: number;    // net_profit / revenue × 100
  drr_pct: number;       // ad_spend / revenue × 100
}

export interface PnlSummary {
  revenue: number;
  net_payout: number;
  ad_spend: number;
  cost_of_goods: number;
  net_profit: number;
  margin_pct: number;
  drr_pct: number;
  profitable_skus: number;
  losing_skus: number;
  unknown_skus: number; // no purchase_price set
}

export async function getPnlBySku(
  userId: string,
  dateFrom: string,
  dateTo: string,
  platform?: string,
): Promise<{ rows: PnlSkuRow[]; summary: PnlSummary }> {
  const platformFilter = platform ? 'AND fr.platform = $4' : '';
  const params: unknown[] = [userId, dateFrom, dateTo];
  if (platform) params.push(platform);

  const { rows } = await db.query(
    `WITH ad_agg AS (
       SELECT platform, sku, SUM(spend) AS total_spend
       FROM advertising_records
       WHERE user_id = $1 AND date BETWEEN $2 AND $3
       GROUP BY platform, sku
     )
     SELECT
       fr.platform,
       fr.sku,
       COALESCE(uc.title, fr.title)        AS title,
       SUM(fr.quantity)::int               AS quantity,
       SUM(fr.revenue)::numeric(12,2)      AS revenue,
       SUM(fr.commission)::numeric(12,2)   AS commission,
       SUM(fr.logistics)::numeric(12,2)    AS logistics,
       SUM(fr.penalty)::numeric(12,2)      AS penalty,
       SUM(fr.net_payout)::numeric(12,2)   AS net_payout,
       COALESCE(MAX(ad.total_spend), 0)::numeric(12,2) AS ad_spend,
       COALESCE(uc.purchase_price, NULL)   AS purchase_price
     FROM finance_records fr
     LEFT JOIN user_catalog uc
       ON uc.user_id = fr.user_id AND uc.platform = fr.platform AND uc.sku = fr.sku
     LEFT JOIN ad_agg ad ON ad.platform = fr.platform AND ad.sku = fr.sku
     WHERE fr.user_id = $1
       AND fr.period_from >= $2
       AND fr.period_to   <= $3
       ${platformFilter}
       AND fr.sku IS NOT NULL
       AND fr.sku != ''
     GROUP BY fr.platform, fr.sku, uc.title, fr.title, uc.purchase_price
     ORDER BY SUM(fr.revenue) DESC`,
    params,
  );

  const result: PnlSkuRow[] = rows.map((r: any) => {
    const revenue = Number(r.revenue);
    const netPayout = Number(r.net_payout);
    const adSpend = Number(r.ad_spend);
    const purchasePrice = r.purchase_price != null ? Number(r.purchase_price) : null;
    const cogs = purchasePrice != null ? purchasePrice * Number(r.quantity) : 0;
    const grossProfit = netPayout - cogs;
    const netProfit = netPayout - adSpend - cogs;
    return {
      platform: r.platform,
      sku: r.sku,
      title: r.title,
      quantity: Number(r.quantity),
      revenue,
      commission: Number(r.commission),
      logistics: Number(r.logistics),
      penalty: Number(r.penalty),
      net_payout: netPayout,
      ad_spend: adSpend,
      cost_of_goods: cogs,
      gross_profit: grossProfit,
      net_profit: purchasePrice != null ? netProfit : null as unknown as number,
      margin_pct: revenue > 0 && purchasePrice != null
        ? Math.round((netProfit / revenue) * 1000) / 10
        : null as unknown as number,
      drr_pct: revenue > 0 ? Math.round((adSpend / revenue) * 1000) / 10 : 0,
    };
  });

  const summary: PnlSummary = {
    revenue: result.reduce((s, r) => s + r.revenue, 0),
    net_payout: result.reduce((s, r) => s + r.net_payout, 0),
    ad_spend: result.reduce((s, r) => s + r.ad_spend, 0),
    cost_of_goods: result.reduce((s, r) => s + r.cost_of_goods, 0),
    net_profit: result.reduce((s, r) => s + (r.net_profit ?? 0), 0),
    margin_pct: 0,
    drr_pct: 0,
    profitable_skus: result.filter(r => r.net_profit != null && r.net_profit > 0).length,
    losing_skus: result.filter(r => r.net_profit != null && r.net_profit <= 0).length,
    unknown_skus: result.filter(r => r.net_profit == null).length,
  };
  if (summary.revenue > 0) {
    summary.margin_pct = Math.round((summary.net_profit / summary.revenue) * 1000) / 10;
    summary.drr_pct = Math.round((summary.ad_spend / summary.revenue) * 1000) / 10;
  }

  return { rows: result, summary };
}

export async function getPnlTrend(
  userId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ date: string; revenue: number; net_payout: number; ad_spend: number; net_profit: number }[]> {
  // Aggregate by week (period_from)
  const { rows } = await db.query(
    `WITH ad_agg AS (
       SELECT date AS ad_date, SUM(spend) AS total_spend
       FROM advertising_records
       WHERE user_id = $1 AND date BETWEEN $2 AND $3
       GROUP BY date
     )
     SELECT
       fr.period_from::text AS date,
       SUM(fr.revenue)::numeric(12,2)    AS revenue,
       SUM(fr.net_payout)::numeric(12,2) AS net_payout,
       COALESCE(SUM(ad.total_spend), 0)::numeric(12,2) AS ad_spend
     FROM finance_records fr
     LEFT JOIN ad_agg ad ON ad.ad_date = fr.period_from
     WHERE fr.user_id = $1
       AND fr.period_from >= $2
       AND fr.period_to   <= $3
     GROUP BY fr.period_from
     ORDER BY fr.period_from`,
    [userId, dateFrom, dateTo],
  );

  return rows.map((r: any) => ({
    date: r.date,
    revenue: Number(r.revenue),
    net_payout: Number(r.net_payout),
    ad_spend: Number(r.ad_spend),
    net_profit: Number(r.net_payout) - Number(r.ad_spend),
  }));
}

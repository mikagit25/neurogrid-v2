import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getUserConnections } from '../connections/connections.service';
import { createAdapter } from '../../integrations/marketplace/factory';
import type { SalesDay } from '../../integrations/marketplace/base.adapter';
import { db } from '../../db';
import { callLlm } from '../../integrations/llm/llm.client';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

// Simple in-memory cache keyed by userId+period to avoid hammering the marketplace APIs
const cache = new Map<string, { ts: number; data: unknown }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data as T);
  return fn().then((data) => { cache.set(key, { ts: Date.now(), data }); return data; });
}

function periodDates(period: string): { dateFrom: string; dateTo: string; days: number } {
  const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  return { dateFrom, dateTo, days };
}

// GET /api/analytics/summary?period=7d|30d|90d
analyticsRouter.get('/summary', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const period = (req.query.period as string) || '30d';

  try {
    const result = await cached(`${userId}:${period}`, async () => {
      const { dateFrom, dateTo } = periodDates(period);
      const connections = await getUserConnections(userId);

      const perConnection = await Promise.allSettled(
        connections.map(async (conn) => {
          const adapter = createAdapter(conn.platform, conn.credentials_enc);
          const [salesDays, finance, stocks, products] = await Promise.allSettled([
            adapter.getSalesByDay(dateFrom, dateTo),
            adapter.getFinanceSummary(dateFrom, dateTo),
            adapter.getStockLevels(),
            adapter.getProducts(100),
          ]);
          return {
            platform: conn.platform,
            connectionId: conn.id,
            name: conn.display_name,
            salesDays: salesDays.status === 'fulfilled' ? salesDays.value : [] as SalesDay[],
            finance: finance.status === 'fulfilled' ? finance.value : { revenue: 0, commissions: 0, logistics: 0, penalties: 0, netPayout: 0 },
            stocks: stocks.status === 'fulfilled' ? stocks.value : [] as { sku: string; stock: number }[],
            products: products.status === 'fulfilled' ? products.value : [],
          };
        })
      );

      // Merge daily chart data across all connections
      const chartMap: Record<string, { date: string; wb: number; ozon: number; ym: number; mm: number; total: number }> = {};
      const byPlatform: Record<string, { revenue: number; orders: number; returns: number; netPayout: number }> = {
        wb: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
        ozon: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
        ym: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
        mm: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
      };

      const productRevMap: Record<string, { sku: string; title: string; platform: string; revenue: number; orders: number }> = {};
      const stockAlerts: { sku: string; title: string; stock: number; platform: string; level: 'critical' | 'low' }[] = [];

      for (const r of perConnection) {
        if (r.status !== 'fulfilled') continue;
        const { platform, salesDays, finance, stocks, products } = r.value;

        byPlatform[platform].revenue += finance.revenue;
        byPlatform[platform].netPayout += finance.netPayout;

        for (const d of salesDays) {
          if (!chartMap[d.date]) chartMap[d.date] = { date: d.date, wb: 0, ozon: 0, ym: 0, mm: 0, total: 0 };
          chartMap[d.date][platform as 'wb' | 'ozon' | 'ym' | 'mm'] += d.revenue;
          chartMap[d.date].total += d.revenue;
          byPlatform[platform].orders += d.orders;
          byPlatform[platform].returns += d.returns;
        }

        // Build product revenue map (approximation: use orders * price for each product)
        // Here we just surface top products by listing from catalog
        for (const p of products) {
          if (!productRevMap[p.sku]) {
            productRevMap[p.sku] = { sku: p.sku, title: p.title, platform, revenue: 0, orders: 0 };
          }
        }

        // Stock alerts
        const stockMap: Record<string, number> = {};
        for (const s of stocks) stockMap[s.sku] = s.stock;
        for (const p of products) {
          const stock = stockMap[p.sku] ?? p.stock;
          if (stock <= 0) {
            stockAlerts.push({ sku: p.sku, title: p.title, stock, platform, level: 'critical' });
          } else if (stock <= 5) {
            stockAlerts.push({ sku: p.sku, title: p.title, stock, platform, level: 'low' });
          }
        }
      }

      const chart = Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date));
      const totalRevenue = Object.values(byPlatform).reduce((s, p) => s + p.revenue, 0);
      const totalOrders = Object.values(byPlatform).reduce((s, p) => s + p.orders, 0);
      const totalReturns = Object.values(byPlatform).reduce((s, p) => s + p.returns, 0);
      const totalNetPayout = Object.values(byPlatform).reduce((s, p) => s + p.netPayout, 0);
      const returnRate = totalOrders > 0 ? Math.round((totalReturns / (totalOrders + totalReturns)) * 100) : 0;

      // Fallback to finance_records when adapters returned no data (demo or no real connection)
      if (totalRevenue === 0 && totalOrders === 0) {
        const { rows: finRows } = await db.query(
          `SELECT period_from::date AS date, platform,
             SUM(revenue)::float AS revenue,
             SUM(quantity)::int  AS orders,
             SUM(net_payout)::float AS net_payout
           FROM finance_records
           WHERE user_id = $1 AND period_from >= $2 AND period_from <= $3
           GROUP BY period_from::date, platform
           ORDER BY period_from::date`,
          [userId, dateFrom, dateTo],
        );

        const fbChartMap: Record<string, Record<string, number | string>> = {};
        const fbByPlatform: typeof byPlatform = {
          wb: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
          ozon: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
          ym: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
          mm: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
        };

        for (const r of finRows) {
          const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date);
          if (!fbChartMap[d]) fbChartMap[d] = { date: d, wb: 0, ozon: 0, ym: 0, mm: 0, total: 0 };
          const plt = r.platform as 'wb' | 'ozon' | 'ym' | 'mm';
          if (!fbByPlatform[plt]) fbByPlatform[plt] = { revenue: 0, orders: 0, returns: 0, netPayout: 0 };
          fbChartMap[d][plt] = (fbChartMap[d][plt] as number) + Number(r.revenue);
          (fbChartMap[d].total as number) += Number(r.revenue);
          fbByPlatform[plt].revenue += Number(r.revenue);
          fbByPlatform[plt].orders += Number(r.orders);
          fbByPlatform[plt].netPayout += Number(r.net_payout);
        }

        const fbTotalRevenue = Object.values(fbByPlatform).reduce((s, p) => s + p.revenue, 0);
        const fbTotalOrders = Object.values(fbByPlatform).reduce((s, p) => s + p.orders, 0);
        const fbTotalNetPayout = Object.values(fbByPlatform).reduce((s, p) => s + p.netPayout, 0);

        return {
          period, dateFrom, dateTo,
          summary: { totalRevenue: fbTotalRevenue, totalOrders: fbTotalOrders, totalReturns: 0, totalNetPayout: fbTotalNetPayout, returnRate: 0 },
          byPlatform: fbByPlatform,
          chart: Object.values(fbChartMap).sort((a, b) => String(a.date).localeCompare(String(b.date))),
          stockAlerts: [],
          connections: [],
        };
      }

      return {
        period, dateFrom, dateTo,
        summary: { totalRevenue, totalOrders, totalReturns, totalNetPayout, returnRate },
        byPlatform,
        chart,
        stockAlerts: stockAlerts.sort((a, b) => a.stock - b.stock).slice(0, 20),
        connections: perConnection
          .filter(r => r.status === 'fulfilled')
          .map(r => ({ id: (r as any).value.connectionId, name: (r as any).value.name, platform: (r as any).value.platform })),
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/calendar?year=YYYY&month=MM — daily revenue for calendar heatmap
analyticsRouter.get('/calendar', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;

  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);

  const { rows } = await db.query(
    `SELECT
       period_from::date AS date,
       SUM(revenue)::numeric(12,2) AS revenue,
       SUM(net_payout)::numeric(12,2) AS net_payout,
       SUM(quantity)::int AS qty
     FROM finance_records
     WHERE user_id = $1 AND period_from >= $2 AND period_from <= $3
     GROUP BY period_from::date
     ORDER BY period_from::date`,
    [userId, firstDay, lastDay],
  );

  const maxRevenue = rows.reduce((m: number, r: any) => Math.max(m, Number(r.revenue)), 0);

  res.json({
    year, month,
    days: rows.map((r: any) => ({
      date: r.date,
      revenue: Number(r.revenue),
      net_payout: Number(r.net_payout),
      qty: Number(r.qty),
      intensity: maxRevenue > 0 ? Math.round((Number(r.revenue) / maxRevenue) * 4) : 0,
    })),
    max_revenue: maxRevenue,
  });
});

// DELETE /api/analytics/cache — force refresh
analyticsRouter.delete('/cache', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  for (const key of cache.keys()) {
    if (key.startsWith(userId)) cache.delete(key);
  }
  res.json({ ok: true });
});

// GET /api/analytics/abc?period=30d|60d|90d — ABC product analysis
analyticsRouter.get('/abc', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const days = req.query.period === '90d' ? 90 : req.query.period === '60d' ? 60 : 30;
  const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const dateTo = new Date().toISOString().slice(0, 10);

  const { rows } = await db.query(
    `SELECT
       fr.platform, fr.sku,
       COALESCE(uc.title, fr.title) AS title,
       uc.avg_rating::float AS avg_rating,
       uc.purchase_price::numeric(12,2) AS purchase_price,
       SUM(fr.revenue)::numeric(12,2) AS revenue,
       SUM(fr.net_payout)::numeric(12,2) AS net_payout,
       SUM(fr.quantity)::int AS qty,
       SUM(fr.penalty)::numeric(12,2) AS penalties,
       COALESCE((
         SELECT SUM(ar.spend) FROM advertising_records ar
         WHERE ar.user_id = fr.user_id AND ar.platform = fr.platform
           AND ar.sku = fr.sku AND ar.date BETWEEN $2 AND $3
       ), 0)::numeric(12,2) AS ad_spend
     FROM finance_records fr
     LEFT JOIN user_catalog uc ON uc.user_id = fr.user_id AND uc.platform = fr.platform AND uc.sku = fr.sku
     WHERE fr.user_id = $1 AND fr.period_from >= $2 AND fr.period_to <= $3 AND fr.revenue > 0
     GROUP BY fr.platform, fr.sku, uc.title, fr.title, uc.avg_rating, uc.purchase_price
     ORDER BY revenue DESC`,
    [userId, dateFrom, dateTo],
  );

  if (!rows.length) { res.json({ items: [], summary: { a: 0, b: 0, c: 0 } }); return; }

  const totalRevenue = rows.reduce((s: number, r: any) => s + Number(r.revenue), 0);
  let cumulative = 0;
  const items = rows.map((r: any) => {
    const revenue = Number(r.revenue);
    const adSpend = Number(r.ad_spend);
    const netPayout = Number(r.net_payout);
    const cogs = r.purchase_price != null ? Number(r.purchase_price) * Number(r.qty) : null;
    const netProfit = cogs != null ? netPayout - adSpend - cogs : null;
    const marginPct = revenue > 0 && netProfit != null ? Math.round((netProfit / revenue) * 1000) / 10 : null;
    const drrPct = revenue > 0 ? Math.round((adSpend / revenue) * 1000) / 10 : 0;
    const revShare = Math.round((revenue / totalRevenue) * 1000) / 10;

    cumulative += revenue;
    const cumPct = Math.round((cumulative / totalRevenue) * 1000) / 10;
    const abcClass = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C';

    return {
      platform: r.platform,
      sku: r.sku,
      title: r.title ?? null,
      avg_rating: r.avg_rating ?? null,
      revenue,
      net_payout: Number(r.net_payout),
      qty: Number(r.qty),
      ad_spend: adSpend,
      net_profit: netProfit,
      margin_pct: marginPct,
      drr_pct: drrPct,
      rev_share: revShare,
      cum_pct: cumPct,
      abc_class: abcClass,
    };
  });

  const summary = {
    a: items.filter((i: any) => i.abc_class === 'A').length,
    b: items.filter((i: any) => i.abc_class === 'B').length,
    c: items.filter((i: any) => i.abc_class === 'C').length,
    total_revenue: totalRevenue,
  };

  res.json({ items, summary });
});

// GET /api/analytics/scoreboard?period=30d — composite SKU performance score
analyticsRouter.get('/scoreboard', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const period = (req.query.period as string) || '30d';
  const days = period === '90d' ? 90 : period === '7d' ? 7 : 30;
  const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const dateTo   = new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `WITH sales AS (
         SELECT
           fr.sku,
           fr.platform,
           SUM(fr.revenue)::numeric                                        AS revenue,
           SUM(fr.quantity)::integer                                       AS qty,
           SUM(fr.quantity)::float / NULLIF($3, 0)                        AS daily_velocity,
           AVG(fr.price)::numeric                                          AS avg_price
         FROM finance_records fr
         WHERE fr.user_id = $1 AND fr.date >= $2 AND fr.date <= $4
         GROUP BY fr.sku, fr.platform
       ),
       catalog AS (
         SELECT sku, platform, title, purchase_price
         FROM user_catalog
         WHERE user_id = $1
       ),
       returns_agg AS (
         SELECT sku, platform, COUNT(*)::integer AS return_count
         FROM returns
         WHERE user_id = $1 AND returned_at >= $2
         GROUP BY sku, platform
       ),
       scores AS (
         SELECT
           s.sku,
           s.platform,
           COALESCE(c.title, s.sku)                                        AS title,
           s.revenue,
           s.qty,
           ROUND(s.daily_velocity::numeric, 2)                             AS daily_velocity,
           s.avg_price,
           c.purchase_price,
           CASE WHEN c.purchase_price > 0 AND s.avg_price > 0
                THEN ROUND(((s.avg_price - c.purchase_price) / s.avg_price * 100)::numeric, 1)
                ELSE NULL END                                              AS margin_pct,
           COALESCE(r.return_count, 0)                                     AS return_count,
           CASE WHEN s.qty > 0
                THEN ROUND((COALESCE(r.return_count, 0)::numeric / s.qty * 100), 1)
                ELSE 0 END                                                 AS return_rate_pct
         FROM sales s
         LEFT JOIN catalog c USING (sku, platform)
         LEFT JOIN returns_agg r USING (sku, platform)
       ),
       max_vals AS (
         SELECT
           NULLIF(MAX(daily_velocity), 0) AS max_vel,
           NULLIF(MAX(margin_pct), 0)     AS max_margin,
           NULLIF(MAX(revenue), 0)        AS max_rev
         FROM scores
       )
       SELECT
         sc.*,
         ROUND((
           0.40 * LEAST(1.0, COALESCE(sc.daily_velocity / mv.max_vel, 0))
         + 0.30 * LEAST(1.0, COALESCE(sc.margin_pct::float / mv.max_margin::float, 0))
         + 0.20 * LEAST(1.0, COALESCE(sc.revenue::float / mv.max_rev::float, 0))
         + 0.10 * (1.0 - LEAST(1.0, sc.return_rate_pct::float / 20.0))
         ) * 100)::numeric                 AS score
       FROM scores sc
       CROSS JOIN max_vals mv
       ORDER BY score DESC`,
      [userId, dateFrom, days, dateTo],
    );

    res.json({
      items: rows.map((r: any, i: number) => ({
        rank:            i + 1,
        sku:             r.sku,
        platform:        r.platform,
        title:           r.title,
        score:           Number(r.score ?? 0),
        revenue:         Number(r.revenue ?? 0),
        qty:             Number(r.qty ?? 0),
        daily_velocity:  Number(r.daily_velocity ?? 0),
        avg_price:       Number(r.avg_price ?? 0),
        purchase_price:  r.purchase_price != null ? Number(r.purchase_price) : null,
        margin_pct:      r.margin_pct != null ? Number(r.margin_pct) : null,
        return_count:    Number(r.return_count ?? 0),
        return_rate_pct: Number(r.return_rate_pct ?? 0),
      })),
      period,
      days,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/dow?period=90d — revenue breakdown by day of week
analyticsRouter.get('/dow', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const days = req.query.period === '30d' ? 30 : req.query.period === '180d' ? 180 : 90;
  try {
    const { rows } = await db.query(`
      SELECT
        EXTRACT(DOW FROM period_from)::int          AS dow,
        TO_CHAR(period_from, 'Day')                 AS dow_name,
        COUNT(*)::int                               AS data_points,
        SUM(revenue)::float                         AS total_revenue,
        SUM(quantity)::int                          AS total_qty,
        ROUND(AVG(revenue)::numeric, 2)::float      AS avg_revenue,
        ROUND(AVG(quantity)::numeric, 2)::float     AS avg_qty
      FROM finance_records
      WHERE user_id = $1
        AND period_from >= (CURRENT_DATE - INTERVAL '1 day' * $2)
      GROUP BY EXTRACT(DOW FROM period_from), TO_CHAR(period_from, 'Day')
      ORDER BY dow ASC
    `, [userId, days]);

    const DAY_LABELS: Record<number, string> = {
      0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб',
    };

    const reorder = [1, 2, 3, 4, 5, 6, 0];
    const byDow = Object.fromEntries(rows.map((r: any) => [Number(r.dow), r]));
    const result = reorder.map(d => ({
      dow:           d,
      label:         DAY_LABELS[d],
      total_revenue: Number(byDow[d]?.total_revenue ?? 0),
      total_qty:     Number(byDow[d]?.total_qty ?? 0),
      avg_revenue:   Number(byDow[d]?.avg_revenue ?? 0),
      avg_qty:       Number(byDow[d]?.avg_qty ?? 0),
      data_points:   Number(byDow[d]?.data_points ?? 0),
    }));

    res.json({ days, dow: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/lifecycle — classify SKUs into lifecycle stages
analyticsRouter.get('/lifecycle', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const { rows } = await db.query(`
      WITH
        w1 AS (
          SELECT sku, platform,
            SUM(revenue)::float  AS rev1,
            SUM(quantity)::int   AS qty1
          FROM finance_records
          WHERE user_id = $1
            AND period_from >= (CURRENT_DATE - INTERVAL '90 days')
            AND period_from <  (CURRENT_DATE - INTERVAL '45 days')
          GROUP BY sku, platform
        ),
        w2 AS (
          SELECT sku, platform,
            SUM(revenue)::float  AS rev2,
            SUM(quantity)::int   AS qty2
          FROM finance_records
          WHERE user_id = $1
            AND period_from >= (CURRENT_DATE - INTERVAL '45 days')
          GROUP BY sku, platform
        ),
        combined AS (
          SELECT
            COALESCE(w1.sku, w2.sku)           AS sku,
            COALESCE(w1.platform, w2.platform) AS platform,
            COALESCE(w1.rev1, 0)               AS rev1,
            COALESCE(w1.qty1, 0)               AS qty1,
            COALESCE(w2.rev2, 0)               AS rev2,
            COALESCE(w2.qty2, 0)               AS qty2
          FROM w1 FULL OUTER JOIN w2 USING (sku, platform)
        ),
        titles AS (
          SELECT DISTINCT ON (sku, platform) sku, platform, title
          FROM (
            SELECT sku, platform, title FROM user_catalog WHERE user_id = $1 AND title IS NOT NULL
            UNION ALL
            SELECT sku, platform, title FROM stock_snapshots WHERE user_id = $1 AND title IS NOT NULL
          ) t
          ORDER BY sku, platform
        )
      SELECT
        c.sku, c.platform,
        COALESCE(t.title, c.sku) AS title,
        c.rev1, c.qty1, c.rev2, c.qty2,
        CASE
          WHEN c.qty2 = 0 AND c.qty1 = 0 THEN 'dead'
          WHEN c.qty1 = 0 AND c.qty2 > 0 THEN 'launch'
          WHEN c.qty2 > c.qty1 * 1.2      THEN 'growth'
          WHEN c.qty2 < c.qty1 * 0.4      THEN 'dead'
          WHEN c.qty2 < c.qty1 * 0.8      THEN 'declining'
          ELSE 'stable'
        END AS stage
      FROM combined c
      LEFT JOIN titles t USING (sku, platform)
      ORDER BY c.rev2 DESC NULLS LAST
    `, [userId]);

    const items = rows.map((r: any) => ({
      sku:        r.sku,
      platform:   r.platform,
      title:      r.title,
      stage:      r.stage as 'launch' | 'growth' | 'stable' | 'declining' | 'dead',
      rev1:       Number(r.rev1 ?? 0),
      qty1:       Number(r.qty1 ?? 0),
      rev2:       Number(r.rev2 ?? 0),
      qty2:       Number(r.qty2 ?? 0),
      change_pct: Number(r.qty1) > 0
        ? Math.round(((Number(r.qty2) - Number(r.qty1)) / Number(r.qty1)) * 100)
        : null,
    }));

    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/ai-digest — AI weekly performance digest
analyticsRouter.post('/ai-digest', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // Fetch current 7 days and prior 7 days from finance_records (no external API calls)
    const { rows: cur } = await db.query(`
      SELECT
        SUM(revenue)::float    AS revenue,
        SUM(quantity)::int     AS orders,
        SUM(net_payout)::float AS net_payout,
        COUNT(DISTINCT sku)::int AS active_skus
      FROM finance_records
      WHERE user_id = $1
        AND period_from >= (CURRENT_DATE - INTERVAL '7 days')
    `, [userId]);

    const { rows: prev } = await db.query(`
      SELECT
        SUM(revenue)::float    AS revenue,
        SUM(quantity)::int     AS orders,
        SUM(net_payout)::float AS net_payout,
        COUNT(DISTINCT sku)::int AS active_skus
      FROM finance_records
      WHERE user_id = $1
        AND period_from >= (CURRENT_DATE - INTERVAL '14 days')
        AND period_from < (CURRENT_DATE - INTERVAL '7 days')
    `, [userId]);

    // Top 5 SKUs this week by revenue
    const { rows: topSkus } = await db.query(`
      SELECT sku, platform,
        SUM(revenue)::float  AS revenue,
        SUM(quantity)::int   AS orders,
        MIN(title)           AS title
      FROM finance_records
      WHERE user_id = $1
        AND period_from >= (CURRENT_DATE - INTERVAL '7 days')
      GROUP BY sku, platform
      ORDER BY SUM(revenue) DESC
      LIMIT 5
    `, [userId]);

    // Top 3 SKUs with highest returns this week
    const { rows: topReturns } = await db.query(`
      SELECT sku, platform, COUNT(*)::int AS cnt
      FROM return_items
      WHERE user_id = $1
        AND return_date >= (CURRENT_DATE - INTERVAL '7 days')
      GROUP BY sku, platform
      ORDER BY cnt DESC
      LIMIT 3
    `, [userId]);

    const c = cur[0] ?? { revenue: 0, orders: 0, net_payout: 0, active_skus: 0 };
    const p = prev[0] ?? { revenue: 0, orders: 0, net_payout: 0, active_skus: 0 };

    const pctChange = (cur: number, prv: number) =>
      prv > 0 ? Math.round(((cur - prv) / prv) * 100) : null;

    const revChg = pctChange(Number(c.revenue), Number(p.revenue));
    const ordChg = pctChange(Number(c.orders), Number(p.orders));

    if (Number(c.revenue) === 0 && Number(c.orders) === 0) {
      res.json({
        summary: 'Нет данных за последние 7 дней. Синхронизируйте финансовые данные в разделе Финансы.',
        highlights: [],
        recommendations: ['Подключите магазин и импортируйте данные о продажах для получения AI-анализа.'],
        mood: 'neutral',
        current: { revenue: 0, orders: 0, net_payout: 0, active_skus: 0 },
        previous: { revenue: 0, orders: 0, net_payout: 0, active_skus: 0 },
        top_skus: [],
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const topSkuStr = topSkus.map((s: any, i: number) =>
      `${i + 1}. ${s.title || s.sku} (${s.platform?.toUpperCase()}) — ${Number(s.revenue).toLocaleString('ru')} ₽, ${s.orders} заказов`
    ).join('\n');

    const returnsStr = topReturns.length
      ? topReturns.map((r: any) => `${r.sku} (${r.platform}) — ${r.cnt} возвратов`).join(', ')
      : 'возвратов нет';

    const prompt = `/no_think Ты аналитик электронной коммерции. Составь краткий деловой итог недели для продавца маркетплейсов на русском языке.

Данные за последние 7 дней:
- Выручка: ${Number(c.revenue).toLocaleString('ru')} ₽ (${revChg !== null ? (revChg >= 0 ? '+' : '') + revChg + '% vs прошлая неделя' : 'нет сравнения'})
- Заказы: ${c.orders} шт. (${ordChg !== null ? (ordChg >= 0 ? '+' : '') + ordChg + '% vs прошлая неделя' : 'нет сравнения'})
- Выплаты: ${Number(c.net_payout).toLocaleString('ru')} ₽
- Активных SKU: ${c.active_skus}

Топ товаров недели:
${topSkuStr || 'нет данных'}

Возвраты: ${returnsStr}

Прошлая неделя: выручка ${Number(p.revenue).toLocaleString('ru')} ₽, заказов ${p.orders}

Ответь СТРОГО в формате JSON:
{
  "summary": "<2-3 предложения об итогах недели — конкретно, с числами, деловым тоном>",
  "highlights": [
    "<ключевое наблюдение 1 с цифрами>",
    "<ключевое наблюдение 2 с цифрами>",
    "<ключевое наблюдение 3 с цифрами>"
  ],
  "recommendations": [
    "<конкретное действие на следующую неделю 1>",
    "<конкретное действие на следующую неделю 2>",
    "<конкретное действие на следующую неделю 3>"
  ],
  "mood": "positive|neutral|negative"
}`;

    const { callLlm } = await import('../../integrations/llm/llm.client');
    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 1200);

    let digest: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      digest = match ? JSON.parse(match[0]) : null;
    } catch { digest = null; }

    if (!digest) {
      // Fallback: build a static digest from the numbers
      const trend = revChg !== null ? (revChg >= 0 ? `рост на ${revChg}%` : `снижение на ${Math.abs(revChg)}%`) : 'нет данных за прошлую неделю';
      digest = {
        summary: `За неделю выручка составила ${Number(c.revenue).toLocaleString('ru')} ₽ при ${c.orders} заказах — ${trend} к прошлой неделе. Выплат: ${Number(c.net_payout).toLocaleString('ru')} ₽.`,
        highlights: [
          `Выручка: ${Number(c.revenue).toLocaleString('ru')} ₽${revChg !== null ? ` (${revChg >= 0 ? '+' : ''}${revChg}%)` : ''}`,
          `Заказов: ${c.orders}${ordChg !== null ? ` (${ordChg >= 0 ? '+' : ''}${ordChg}%)` : ''}`,
          topSkus.length ? `Лидер: ${topSkus[0].title || topSkus[0].sku} — ${Number(topSkus[0].revenue).toLocaleString('ru')} ₽` : `Активных SKU: ${c.active_skus}`,
        ],
        recommendations: [
          revChg !== null && revChg < 0 ? 'Проверьте цены — выручка снизилась относительно прошлой недели' : 'Поддерживайте текущую стратегию ценообразования',
          topReturns.length ? `Разберитесь с возвратами по ${topReturns[0].sku}` : 'Мониторьте остатки склада',
          'Обновите карточки товаров с низкими просмотрами',
        ],
        mood: revChg !== null && revChg >= 5 ? 'positive' : revChg !== null && revChg < -10 ? 'negative' : 'neutral',
      };
    }

    res.json({
      ...digest,
      current: { revenue: Number(c.revenue), orders: Number(c.orders), net_payout: Number(c.net_payout), active_skus: Number(c.active_skus) },
      previous: { revenue: Number(p.revenue), orders: Number(p.orders), net_payout: Number(p.net_payout), active_skus: Number(p.active_skus) },
      top_skus: topSkus.map((s: any) => ({ sku: s.sku, platform: s.platform, title: s.title, revenue: Number(s.revenue), orders: Number(s.orders) })),
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/scoreboard-ai — AI tier analysis of product portfolio
analyticsRouter.post('/scoreboard-ai', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const days = 30;
  const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(`
      WITH sales AS (
        SELECT sku, platform,
          SUM(revenue)::float    AS revenue,
          SUM(quantity)::int     AS qty,
          SUM(quantity)::float / $2 AS daily_velocity,
          AVG(CASE WHEN quantity > 0 THEN revenue / quantity ELSE NULL END)::float AS avg_price,
          SUM(net_payout)::float AS net_payout
        FROM finance_records
        WHERE user_id = $1 AND period_from >= $3
        GROUP BY sku, platform
      ),
      catalog AS (
        SELECT sku, platform, title, purchase_price FROM user_catalog WHERE user_id = $1
      )
      SELECT s.sku, s.platform, COALESCE(c.title, s.sku) AS title,
        s.revenue, s.qty, ROUND(s.daily_velocity::numeric, 2) AS daily_velocity,
        s.avg_price, c.purchase_price,
        CASE WHEN c.purchase_price > 0 AND s.avg_price > 0
             THEN ROUND(((s.avg_price - c.purchase_price) / s.avg_price * 100)::numeric, 1)
             ELSE NULL END AS margin_pct
      FROM sales s LEFT JOIN catalog c USING (sku, platform)
      ORDER BY s.revenue DESC
    `, [userId, days, dateFrom]);

    if (!rows.length) {
      res.json({
        summary: 'Нет данных о продажах за последние 30 дней.',
        portfolio_health: 'unknown',
        stars_tips: [],
        mid_tips: [],
        laggard_actions: [],
        overall_strategy: 'Синхронизируйте финансовые данные для получения анализа.',
        total_skus: 0,
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const total = rows.length;
    const topN   = Math.max(1, Math.ceil(total * 0.2));
    const botN   = Math.max(1, Math.ceil(total * 0.2));
    const stars    = rows.slice(0, topN);
    const laggards = rows.slice(total - botN);
    const mid      = rows.slice(topN, total - botN);

    const totalRev  = rows.reduce((s: number, r: any) => s + Number(r.revenue), 0);
    const starsRev  = stars.reduce((s: number, r: any) => s + Number(r.revenue), 0);
    const starsRevPct = totalRev > 0 ? Math.round((starsRev / totalRev) * 100) : 0;

    const fmtItem = (r: any) =>
      `SKU="${r.sku}" "${r.title}" выручка=${Math.round(Number(r.revenue))}₽ скорость=${Number(r.daily_velocity).toFixed(1)}/д${r.margin_pct != null ? ` маржа=${r.margin_pct}%` : ''}`;

    const prompt = `/no_think Ты — стратег e-commerce. Проведи тир-анализ товарного портфеля продавца.

Всего SKU: ${total} | Период: 30 дней | Топ-${topN} генерирует ${starsRevPct}% выручки

Звёзды (топ ${topN} по выручке):
${stars.map(fmtItem).join('\n')}

Середина (${mid.length} SKU):
${mid.slice(0, 5).map(fmtItem).join('\n') || 'нет'}

Аутсайдеры (нижние ${botN} по выручке):
${laggards.map(fmtItem).join('\n')}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения о здоровье портфеля>",
  "portfolio_health": "<excellent|good|mixed|poor>",
  "stars_tips": ["<совет по развитию звёзд 1>", "<совет 2>"],
  "mid_tips": ["<как поднять товары из середины 1>", "<совет 2>"],
  "laggard_actions": [
    { "sku": "<SKU>", "title": "<название>", "action": "<конкретное действие — снизить цену/улучшить SEO/вывести>", "urgency": "<high|medium>" }
  ],
  "overall_strategy": "<1-2 предложения об общей стратегии портфеля>"
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 1500);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      result = {
        summary: `Портфель: ${total} SKU. Топ-${topN} приносит ${starsRevPct}% выручки.`,
        portfolio_health: starsRevPct > 80 ? 'mixed' : 'good',
        stars_tips: ['Обеспечьте запасы для топ-товаров', 'Усильте рекламу на лидерах'],
        mid_tips: ['Проверьте цены на средних товарах', 'Улучшите SEO карточек'],
        laggard_actions: laggards.slice(0, 3).map((r: any) => ({ sku: r.sku, title: r.title, action: 'Снизьте цену или улучшите карточку', urgency: 'medium' })),
        overall_strategy: 'Сфокусируйтесь на развитии лидеров и постепенном выводе аутсайдеров.',
      };
    }

    res.json({
      ...result,
      total_skus: total,
      stars_count: topN,
      laggards_count: botN,
      stars_revenue_pct: starsRevPct,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/lifecycle-ai — AI advisor for product lifecycle stages
analyticsRouter.post('/lifecycle-ai', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const { rows } = await db.query(`
      WITH
        w1 AS (
          SELECT sku, platform, SUM(revenue)::float AS rev1, SUM(quantity)::int AS qty1
          FROM finance_records
          WHERE user_id = $1
            AND period_from >= (CURRENT_DATE - INTERVAL '90 days')
            AND period_from <  (CURRENT_DATE - INTERVAL '45 days')
          GROUP BY sku, platform
        ),
        w2 AS (
          SELECT sku, platform, SUM(revenue)::float AS rev2, SUM(quantity)::int AS qty2
          FROM finance_records
          WHERE user_id = $1 AND period_from >= (CURRENT_DATE - INTERVAL '45 days')
          GROUP BY sku, platform
        ),
        combined AS (
          SELECT
            COALESCE(w1.sku, w2.sku) AS sku, COALESCE(w1.platform, w2.platform) AS platform,
            COALESCE(w1.rev1, 0) AS rev1, COALESCE(w1.qty1, 0) AS qty1,
            COALESCE(w2.rev2, 0) AS rev2, COALESCE(w2.qty2, 0) AS qty2
          FROM w1 FULL OUTER JOIN w2 USING (sku, platform)
        ),
        titles AS (
          SELECT DISTINCT ON (sku, platform) sku, platform, title
          FROM (
            SELECT sku, platform, title FROM user_catalog WHERE user_id = $1 AND title IS NOT NULL
            UNION ALL
            SELECT sku, platform, title FROM stock_snapshots WHERE user_id = $1 AND title IS NOT NULL
          ) t ORDER BY sku, platform
        )
      SELECT c.sku, c.platform, COALESCE(t.title, c.sku) AS title,
        c.rev1, c.qty1, c.rev2, c.qty2,
        CASE
          WHEN c.qty2 = 0 AND c.qty1 = 0 THEN 'dead'
          WHEN c.qty1 = 0 AND c.qty2 > 0  THEN 'launch'
          WHEN c.qty2 > c.qty1 * 1.2       THEN 'growth'
          WHEN c.qty2 < c.qty1 * 0.4       THEN 'dead'
          WHEN c.qty2 < c.qty1 * 0.8       THEN 'declining'
          ELSE 'stable'
        END AS stage
      FROM combined c LEFT JOIN titles t USING (sku, platform)
      ORDER BY c.rev2 DESC NULLS LAST
    `, [userId]);

    if (!rows.length) {
      res.json({
        summary: 'Нет данных о продажах за последние 90 дней.',
        stage_counts: { launch: 0, growth: 0, stable: 0, declining: 0, dead: 0 },
        total_skus: 0,
        declining_actions: [], dead_actions: [], growth_tips: [],
        overall_strategy: 'Синхронизируйте финансовые данные для получения анализа.',
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const byStage = (stage: string) => rows.filter((r: any) => r.stage === stage);
    const declining = byStage('declining');
    const dead      = byStage('dead');
    const growth    = byStage('growth');
    const launch    = byStage('launch');
    const stable    = byStage('stable');

    const itemLine = (r: any) => {
      const chg = Number(r.qty1) > 0 ? Math.round(((Number(r.qty2) - Number(r.qty1)) / Number(r.qty1)) * 100) : null;
      return `SKU="${r.sku}" "${r.title}" выр.новая=${Math.round(Number(r.rev2))}₽ выр.старая=${Math.round(Number(r.rev1))}₽${chg != null ? ` изм.=${chg >= 0 ? '+' : ''}${chg}%` : ''}`;
    };

    const prompt = `/no_think Ты — аналитик e-commerce. Оцени жизненный цикл товаров продавца.

Статистика (45 дн. → последние 45 дн.):
- Запуск: ${launch.length} товаров
- Рост: ${growth.length} товаров
- Стабильные: ${stable.length} товаров
- Спад: ${declining.length} товаров
- Уходят: ${dead.length} товаров

Товары в спаде (топ-5):
${declining.slice(0, 5).map(itemLine).join('\n') || 'нет'}

Уходящие товары (топ-5):
${dead.slice(0, 5).map(itemLine).join('\n') || 'нет'}

Растущие товары (топ-3):
${growth.slice(0, 3).map(itemLine).join('\n') || 'нет'}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения об общей картине портфеля>",
  "declining_actions": [
    { "sku": "<SKU>", "title": "<название>", "action": "<конкретное действие>", "priority": "<high|medium>" }
  ],
  "dead_actions": [
    { "sku": "<SKU>", "title": "<название>", "action": "<вывести/распродать/реанимировать — конкретно>" }
  ],
  "growth_tips": ["<совет по растущим товарам 1>", "<совет 2>"],
  "overall_strategy": "<1-2 предложения об общей стратегии портфеля>"
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 1500);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      result = {
        summary: `В портфеле ${rows.length} SKU: ${growth.length} растут, ${stable.length} стабильны, ${declining.length} в спаде, ${dead.length} уходят.`,
        declining_actions: declining.slice(0, 3).map((r: any) => ({ sku: r.sku, title: r.title, action: 'Проверьте цену и конкурентов, снизьте при необходимости', priority: 'medium' })),
        dead_actions: dead.slice(0, 3).map((r: any) => ({ sku: r.sku, title: r.title, action: 'Распродайте остатки со скидкой или выведите из ассортимента' })),
        growth_tips: ['Обеспечьте запасы для растущих товаров', 'Усильте рекламу на растущих SKU'],
        overall_strategy: 'Сфокусируйтесь на росте растущих товаров и постепенном выводе уходящих.',
      };
    }

    res.json({
      ...result,
      stage_counts: { launch: launch.length, growth: growth.length, stable: stable.length, declining: declining.length, dead: dead.length },
      total_skus: rows.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

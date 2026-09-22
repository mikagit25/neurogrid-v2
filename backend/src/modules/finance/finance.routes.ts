import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { checkFeatureAccess } from '../subscriptions/subscriptions.service';
import { syncFinanceRecords, getFinanceSummary, getFinanceRecords } from './finance.service';
import { callLlm } from '../../integrations/llm/llm.client';
import { db } from '../../db';

export const financeRouter = Router();
financeRouter.use(authenticate);

// All finance routes require 'business' plan
financeRouter.use(async (req: Request, res: Response, next) => {
  try {
    await checkFeatureAccess(req.user!.userId, 'finance');
    next();
  } catch (err: any) {
    res.status(err.status || 403).json({ error: err.message });
  }
});

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

// GET /api/finance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
financeRouter.get('/summary', async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = defaultDateRange();
  const from = (req.query.from as string) || dateFrom;
  const to = (req.query.to as string) || dateTo;
  try {
    const summary = await getFinanceSummary(req.user!.userId, from, to);
    res.json({ summary, from, to });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/records?from=&to=&sku=
financeRouter.get('/records', async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = defaultDateRange();
  const from = (req.query.from as string) || dateFrom;
  const to = (req.query.to as string) || dateTo;
  const sku = req.query.sku as string | undefined;
  try {
    const records = await getFinanceRecords(req.user!.userId, from, to, sku);
    res.json({ records, from, to });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/sync?from=&to= — pull data from marketplace APIs
financeRouter.post('/sync', async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = defaultDateRange();
  const from = (req.query.from as string) || req.body?.from || dateFrom;
  const to = (req.query.to as string) || req.body?.to || dateTo;
  try {
    const count = await syncFinanceRecords(req.user!.userId, from, to);
    res.json({ ok: true, records: count, from, to });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/forecast — 30-day revenue projection using linear trend on last 60 days
financeRouter.get('/forecast', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const d60 = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { rows } = await db.query(
    `SELECT period_from::date AS date, SUM(revenue)::float AS revenue
     FROM finance_records
     WHERE user_id = $1 AND period_from >= $2 AND period_from <= $3 AND revenue > 0
     GROUP BY period_from::date
     ORDER BY period_from::date`,
    [userId, d60, today],
  );

  if (rows.length < 5) {
    res.json({ forecast: [], trend: 0, avg_30d: 0, avg_prev_30d: 0, change_pct: 0, message: 'insufficient_data' });
    return;
  }

  // Split into two 30-day windows
  const midpoint = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const recent = rows.filter((r: any) => r.date >= midpoint);
  const prior  = rows.filter((r: any) => r.date < midpoint);

  const sum30 = recent.reduce((s: number, r: any) => s + Number(r.revenue), 0);
  const sum60 = prior.reduce((s: number, r: any) => s + Number(r.revenue), 0);

  const avgPerDay30 = recent.length > 0 ? sum30 / 30 : 0;
  const avgPerDay60 = prior.length > 0 ? sum60 / 30 : avgPerDay30;

  const changePct = avgPerDay60 > 0 ? ((avgPerDay30 - avgPerDay60) / avgPerDay60) * 100 : 0;

  // Simple linear regression on all points
  const n = rows.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  rows.forEach((r: any, i: number) => {
    sumX += i; sumY += Number(r.revenue);
    sumXY += i * Number(r.revenue);
    sumX2 += i * i;
  });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
  const intercept = (sumY - slope * sumX) / n;

  // Generate 30 future days
  const forecast = Array.from({ length: 30 }, (_, i) => {
    const futureDate = new Date(Date.now() + (i + 1) * 86400_000).toISOString().slice(0, 10);
    const predicted = Math.max(0, intercept + slope * (n + i));
    const lower = Math.max(0, predicted * 0.8);
    const upper = predicted * 1.2;
    return { date: futureDate, revenue: Math.round(predicted), lower: Math.round(lower), upper: Math.round(upper) };
  });

  // Last 30 actual days for context
  const actual = recent.map((r: any) => ({ date: r.date, revenue: Math.round(Number(r.revenue)) }));

  res.json({
    actual,
    forecast,
    trend: Math.round(slope * 10) / 10,
    avg_30d: Math.round(sum30),
    avg_prev_30d: Math.round(sum60),
    change_pct: Math.round(changePct * 10) / 10,
    forecast_30d_total: forecast.reduce((s, f) => s + f.revenue, 0),
  });
});

// GET /api/finance/platform-split?from=&to= — per-platform breakdown for comparison chart
financeRouter.get('/platform-split', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { dateFrom, dateTo } = defaultDateRange();
  const from = (req.query.from as string) || dateFrom;
  const to   = (req.query.to   as string) || dateTo;

  try {
    const { rows } = await db.query(
      `SELECT
         fr.platform,
         SUM(fr.revenue)::float             AS revenue,
         SUM(fr.commission)::float          AS commission,
         SUM(fr.logistics)::float           AS logistics,
         SUM(fr.penalty)::float             AS penalty,
         SUM(fr.net_payout)::float          AS net_payout,
         SUM(fr.quantity)::int              AS quantity,
         SUM(CASE WHEN c.purchase_price IS NOT NULL
             THEN fr.quantity * c.purchase_price ELSE 0 END)::float AS cost_of_goods,
         COALESCE(SUM(ar.spend), 0)::float  AS ad_spend
       FROM finance_records fr
       LEFT JOIN user_catalog c
         ON c.user_id = fr.user_id AND c.sku = fr.sku AND c.platform = fr.platform
       LEFT JOIN (
         SELECT platform, SUM(spend) AS spend
         FROM advertising_records
         WHERE user_id = $1 AND date BETWEEN $2 AND $3
         GROUP BY platform
       ) ar ON ar.platform = fr.platform
       WHERE fr.user_id = $1
         AND fr.period_from >= $2
         AND fr.period_to   <= $3
         AND fr.sku IS NOT NULL
         AND fr.sku != ''
       GROUP BY fr.platform
       ORDER BY SUM(fr.revenue) DESC`,
      [userId, from, to],
    );

    const platforms = rows.map((r: any) => {
      const revenue = Number(r.revenue ?? 0);
      const netPayout = Number(r.net_payout ?? 0);
      const cogs = Number(r.cost_of_goods ?? 0);
      const adSpend = Number(r.ad_spend ?? 0);
      const grossProfit = netPayout - cogs;
      const netProfit = grossProfit - adSpend;
      return {
        platform: r.platform,
        revenue,
        commission:   Number(r.commission ?? 0),
        logistics:    Number(r.logistics ?? 0),
        penalty:      Number(r.penalty ?? 0),
        net_payout:   netPayout,
        quantity:     Number(r.quantity ?? 0),
        cost_of_goods: cogs,
        ad_spend:     adSpend,
        gross_profit: grossProfit,
        net_profit:   netProfit,
        margin_pct:   revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
        drr_pct:      revenue > 0 ? Math.round((adSpend / revenue) * 1000) / 10 : 0,
      };
    });

    res.json({ platforms, from, to });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/export?from=&to= — CSV download
// GET /api/finance/weekly-trend?weeks=12
financeRouter.get('/weekly-trend', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const weeks = Math.min(26, Math.max(4, Number(req.query.weeks) || 12));
  try {
    const { rows } = await db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('week', period_from), 'YYYY-MM-DD') AS week_start,
        SUM(revenue)::float        AS revenue,
        SUM(commission)::float     AS commission,
        SUM(logistics)::float      AS logistics,
        SUM(penalty)::float        AS penalty,
        SUM(net_payout)::float     AS net_payout,
        SUM(CASE WHEN c.purchase_price IS NOT NULL
            THEN fr.quantity * c.purchase_price ELSE 0 END)::float AS cost_of_goods,
        SUM(net_payout)::float
          - SUM(CASE WHEN c.purchase_price IS NOT NULL
              THEN fr.quantity * c.purchase_price ELSE 0 END)::float AS gross_profit
      FROM finance_records fr
      LEFT JOIN user_catalog c
        ON c.user_id = fr.user_id AND c.sku = fr.sku AND c.platform = fr.platform
      WHERE fr.user_id = $1
        AND fr.period_from >= (CURRENT_DATE - ($2 * INTERVAL '1 week'))
      GROUP BY DATE_TRUNC('week', period_from)
      ORDER BY week_start ASC
    `, [userId, weeks]);

    const trend = rows.map((r: any) => ({
      week:         r.week_start,
      revenue:      Number(r.revenue ?? 0),
      commission:   Number(r.commission ?? 0),
      logistics:    Number(r.logistics ?? 0),
      penalty:      Number(r.penalty ?? 0),
      net_payout:   Number(r.net_payout ?? 0),
      cost_of_goods:Number(r.cost_of_goods ?? 0),
      gross_profit: Number(r.gross_profit ?? 0),
      margin_pct:   Number(r.revenue ?? 0) > 0
        ? Math.round((Number(r.gross_profit ?? 0) / Number(r.revenue)) * 1000) / 10
        : null,
    }));

    res.json({ trend, weeks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/today — today vs yesterday quick stats for dashboard
financeRouter.get('/today', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const week_ago  = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `SELECT
         SUM(CASE WHEN period_from = $2 THEN revenue    ELSE 0 END)::float    AS today_revenue,
         SUM(CASE WHEN period_from = $2 THEN net_payout ELSE 0 END)::float    AS today_payout,
         SUM(CASE WHEN period_from = $2 THEN quantity   ELSE 0 END)::int      AS today_qty,
         SUM(CASE WHEN period_from = $3 THEN revenue    ELSE 0 END)::float    AS yest_revenue,
         SUM(CASE WHEN period_from = $3 THEN net_payout ELSE 0 END)::float    AS yest_payout,
         SUM(CASE WHEN period_from = $3 THEN quantity   ELSE 0 END)::int      AS yest_qty,
         SUM(CASE WHEN period_from >= $4 THEN revenue    ELSE 0 END)::float   AS week_revenue,
         SUM(CASE WHEN period_from >= $4 THEN net_payout ELSE 0 END)::float   AS week_payout
       FROM finance_records
       WHERE user_id = $1 AND period_from >= $4`,
      [userId, today, yesterday, week_ago],
    );

    const r = rows[0];
    const rev = Number(r.today_revenue ?? 0);
    const prevRev = Number(r.yest_revenue ?? 0);
    const delta_pct = prevRev > 0 ? Math.round(((rev - prevRev) / prevRev) * 1000) / 10 : null;

    res.json({
      today: {
        revenue:    rev,
        payout:     Number(r.today_payout  ?? 0),
        quantity:   Number(r.today_qty     ?? 0),
      },
      yesterday: {
        revenue:    prevRev,
        payout:     Number(r.yest_payout   ?? 0),
        quantity:   Number(r.yest_qty      ?? 0),
      },
      week: {
        revenue:    Number(r.week_revenue  ?? 0),
        payout:     Number(r.week_payout   ?? 0),
      },
      delta_pct,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

financeRouter.get('/export', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { dateFrom, dateTo } = defaultDateRange();
  const from = (req.query.from as string) || dateFrom;
  const to = (req.query.to as string) || dateTo;
  try {
    const records = await getFinanceRecords(userId, from, to);
    const header = 'Дата,Площадка,SKU,Тип,Выручка,Комиссия,Логистика,Штрафы,Выплата\n';
    const rows = records.map((r: any) =>
      [r.period_from, r.platform, r.sku, r.record_type,
       r.revenue, r.commissions, r.logistics, r.penalties, r.net_payout]
        .map(v => `"${v ?? ''}"`)
        .join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="finance-${from}-${to}.csv"`);
    res.send('﻿' + header + rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/ai-forecast — AI cashflow projection for next 4 weeks
financeRouter.post('/ai-forecast', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const weeksBack = 10;
    const { rows: trendRows } = await db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('week', period_from), 'YYYY-MM-DD') AS week_start,
        SUM(revenue)::float   AS revenue,
        SUM(net_payout)::float AS net_payout,
        SUM(quantity)::int    AS orders
      FROM finance_records
      WHERE user_id = $1
        AND period_from >= (CURRENT_DATE - ($2 * INTERVAL '1 week'))
      GROUP BY DATE_TRUNC('week', period_from)
      ORDER BY week_start ASC
    `, [userId, weeksBack]);

    if (!trendRows.length) {
      res.json({
        summary: 'Нет данных для построения прогноза. Загрузите финансовые данные за последние недели.',
        trend_direction: 'unknown',
        avg_weekly_revenue: 0,
        forecast: [],
        risks: [],
        opportunities: [],
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const revenues = trendRows.map((r: any) => Number(r.revenue));
    const avgRev = Math.round(revenues.reduce((s, v) => s + v, 0) / revenues.length);
    const lastRev = revenues[revenues.length - 1];
    const firstRev = revenues[0];
    const trendPct = firstRev > 0 ? Math.round(((lastRev - firstRev) / firstRev) * 100) : 0;

    const weekLines = trendRows.map((r: any) =>
      `Нед. ${r.week_start}: выр=${Math.round(Number(r.revenue))}₽ выпл=${Math.round(Number(r.net_payout))}₽ заказов=${r.orders}`
    ).join('\n');

    const prompt = `/no_think Ты — финансовый аналитик. Составь прогноз кассового потока на 4 недели.

История по неделям (${trendRows.length} нед.):
${weekLines}

Тренд: ${trendPct >= 5 ? 'рост' : trendPct <= -5 ? 'снижение' : 'стабильно'} (${trendPct >= 0 ? '+' : ''}${trendPct}% с начала периода)
Средняя выручка/нед.: ${avgRev}₽

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения о тренде и прогнозе>",
  "trend_direction": "<growing|stable|declining|volatile>",
  "avg_weekly_revenue": <число>,
  "forecast": [
    { "week_label": "Нед. 1", "projected_revenue": <число>, "projected_payout": <число>, "confidence": "<high|medium|low>" },
    { "week_label": "Нед. 2", "projected_revenue": <число>, "projected_payout": <число>, "confidence": "<high|medium|low>" },
    { "week_label": "Нед. 3", "projected_revenue": <число>, "projected_payout": <число>, "confidence": "<high|medium|low>" },
    { "week_label": "Нед. 4", "projected_revenue": <число>, "projected_payout": <число>, "confidence": "<high|medium|low>" }
  ],
  "risks": ["<риск 1>", "<риск 2>"],
  "opportunities": ["<возможность 1>", "<возможность 2>"]
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 1200);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      const direction = trendPct >= 5 ? 'growing' : trendPct <= -5 ? 'declining' : 'stable';
      const nextRev = Math.round(avgRev * (1 + trendPct / 100 / trendRows.length));
      result = {
        summary: `За ${trendRows.length} недель средняя выручка ${avgRev}₽/нед. Тренд: ${direction}.`,
        trend_direction: direction,
        avg_weekly_revenue: avgRev,
        forecast: [1, 2, 3, 4].map(i => ({
          week_label: `Нед. ${i}`,
          projected_revenue: Math.round(avgRev * (1 + (trendPct / 100 / trendRows.length) * i)),
          projected_payout: Math.round(avgRev * 0.8),
          confidence: i <= 2 ? 'medium' : 'low',
        })),
        risks: ['Возможные сезонные колебания', 'Изменение алгоритмов маркетплейса'],
        opportunities: ['Оптимизация рекламы для роста выручки', 'Расширение ассортимента в прибыльных категориях'],
      };
    }

    result.avg_weekly_revenue = avgRev;
    res.json({ ...result, weeks_analyzed: trendRows.length, generated_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getPnlBySku, getPnlTrend } from './pnl.service';
import { callLlm } from '../../integrations/llm/llm.client';
import { db } from '../../db';

export const pnlRouter = Router();
pnlRouter.use(authenticate);

function periodDates(period: string): { dateFrom: string; dateTo: string } {
  const days = period === '90d' ? 90 : period === '60d' ? 60 : 30;
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

// GET /api/pnl?period=30d|60d|90d&platform=wb|ozon
pnlRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const period = (req.query.period as string) || '30d';
  const platform = req.query.platform as string | undefined;
  const { dateFrom, dateTo } = periodDates(period);
  try {
    const result = await getPnlBySku(userId, dateFrom, dateTo, platform);
    res.json({ ...result, dateFrom, dateTo, period });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pnl/trend?period=90d
pnlRouter.get('/trend', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const period = (req.query.period as string) || '90d';
  const { dateFrom, dateTo } = periodDates(period);
  try {
    const trend = await getPnlTrend(userId, dateFrom, dateTo);
    res.json({ trend, dateFrom, dateTo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Finance Goals ────────────────────────────────────────────────────────────
// GET /api/pnl/goals?month=YYYY-MM  (defaults to current month)
pnlRouter.get('/goals', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const { rows } = await db.query(
    `SELECT * FROM finance_goals WHERE user_id = $1 AND year_month = $2`,
    [userId, month],
  );
  res.json({ goal: rows[0] ?? null, month });
});

// GET /api/pnl/goals/list — last 12 months for history view
pnlRouter.get('/goals/list', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT * FROM finance_goals WHERE user_id = $1 ORDER BY year_month DESC LIMIT 12`,
    [userId],
  );
  res.json({ goals: rows });
});

// PUT /api/pnl/goals — upsert goals for a month
pnlRouter.put('/goals', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { month, revenue_goal, payout_goal, profit_goal, ad_spend_goal, drr_goal } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month must be YYYY-MM' }); return;
  }
  const { rows } = await db.query(
    `INSERT INTO finance_goals (user_id, year_month, revenue_goal, payout_goal, profit_goal, ad_spend_goal, drr_goal)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id, year_month) DO UPDATE SET
       revenue_goal   = EXCLUDED.revenue_goal,
       payout_goal    = EXCLUDED.payout_goal,
       profit_goal    = EXCLUDED.profit_goal,
       ad_spend_goal  = EXCLUDED.ad_spend_goal,
       drr_goal       = EXCLUDED.drr_goal,
       updated_at     = now()
     RETURNING *`,
    [userId, month,
     revenue_goal != null ? Number(revenue_goal) : null,
     payout_goal  != null ? Number(payout_goal)  : null,
     profit_goal  != null ? Number(profit_goal)  : null,
     ad_spend_goal != null ? Number(ad_spend_goal) : null,
     drr_goal     != null ? Number(drr_goal)     : null],
  );
  res.json({ goal: rows[0] });
});

// GET /api/pnl/goals/progress?month=YYYY-MM  — goal vs actual for month
pnlRouter.get('/goals/progress', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const dateFrom = `${month}-01`;
  // last day of month
  const nextMonth = new Date(dateFrom);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(nextMonth.getDate() - 1);
  const dateTo = nextMonth.toISOString().slice(0, 10);

  const today = new Date().toISOString().slice(0, 10);
  const effectiveTo = dateTo < today ? dateTo : today;

  const [goalRes, actualRes, adRes] = await Promise.all([
    db.query(`SELECT * FROM finance_goals WHERE user_id = $1 AND year_month = $2`, [userId, month]),
    db.query(
      `SELECT
         COALESCE(SUM(revenue),0)::float    AS revenue,
         COALESCE(SUM(net_payout),0)::float AS payout
       FROM finance_records
       WHERE user_id = $1 AND period_from >= $2 AND period_from <= $3`,
      [userId, dateFrom, effectiveTo],
    ),
    db.query(
      `SELECT COALESCE(SUM(spend),0)::float AS ad_spend
       FROM advertising_records
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [userId, dateFrom, effectiveTo],
    ),
  ]);

  const goal = goalRes.rows[0] ?? null;
  const actual = actualRes.rows[0];
  const adSpend = Number(adRes.rows[0]?.ad_spend ?? 0);
  const revenue = Number(actual?.revenue ?? 0);
  const payout  = Number(actual?.payout ?? 0);
  const drrPct  = revenue > 0 ? Math.round((adSpend / revenue) * 1000) / 10 : 0;

  res.json({
    month, goal,
    actual: { revenue, payout, ad_spend: adSpend, drr_pct: drrPct },
    days_in_month: new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate(),
    days_elapsed: Math.min(
      Math.ceil((new Date(effectiveTo).getTime() - new Date(dateFrom).getTime()) / 86400_000) + 1,
      new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate(),
    ),
  });
});

// GET /api/pnl/export-csv?period=30d&platform=
pnlRouter.get('/export-csv', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const period   = (req.query.period   as string) || '30d';
  const platform = req.query.platform as string | undefined;
  const { dateFrom, dateTo } = periodDates(period);
  try {
    const result = await getPnlBySku(userId, dateFrom, dateTo, platform);
    const rows: any[] = result.rows ?? [];

    const header = 'sku,platform,title,revenue,quantity,avg_price,purchase_price,gross_profit,gross_margin_pct,returns_cost,net_profit,net_margin_pct\n';
    const csvRows = rows.map((r: any) =>
      [
        `"${(r.sku ?? '').replace(/"/g, '""')}"`,
        r.platform ?? '',
        `"${(r.title ?? '').replace(/"/g, '""')}"`,
        r.revenue ?? 0,
        r.quantity ?? 0,
        r.avg_price ?? '',
        r.purchase_price ?? '',
        r.gross_profit ?? '',
        r.gross_margin_pct ?? '',
        r.returns_cost ?? '',
        r.net_profit ?? '',
        r.net_margin_pct ?? '',
      ].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pnl_${period}_${dateFrom}.csv"`);
    res.send('﻿' + header + csvRows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pnl/ai-diagnostic — AI diagnosis of unprofitable and low-margin SKUs
pnlRouter.post('/ai-diagnostic', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const period = (req.body?.period as string) || '30d';
  const { dateFrom, dateTo } = periodDates(period);
  try {
    const { rows, summary } = await getPnlBySku(userId, dateFrom, dateTo);

    const counts = {
      losing:     rows.filter(r => r.net_profit != null && r.net_profit < 0).length,
      low_margin: rows.filter(r => r.net_profit != null && r.net_profit >= 0 && r.margin_pct != null && r.margin_pct < 10).length,
      unknown:    rows.filter(r => r.net_profit == null).length,
      profitable: rows.filter(r => r.net_profit != null && r.net_profit > 0 && (r.margin_pct ?? 0) >= 10).length,
    };

    if (!rows.length) {
      res.json({
        summary: 'Нет финансовых данных за выбранный период.',
        health: 'unknown',
        key_issues: [],
        sku_advice: [],
        overall_actions: ['Синхронизируйте финансовые данные за выбранный период'],
        counts: { losing: 0, low_margin: 0, unknown: 0, profitable: 0 },
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const losing    = rows.filter(r => r.net_profit != null && r.net_profit < 0).sort((a, b) => a.net_profit - b.net_profit).slice(0, 7);
    const lowMargin = rows.filter(r => r.net_profit != null && r.net_profit >= 0 && r.margin_pct != null && r.margin_pct < 10).slice(0, 5);

    const fmtRow = (r: any) => {
      const parts = [`SKU="${r.sku}" "${r.title ?? ''}" выр=${Math.round(r.revenue)}₽`];
      if (r.margin_pct != null) parts.push(`маржа=${r.margin_pct}%`);
      if (r.drr_pct > 0) parts.push(`ДРР=${r.drr_pct}%`);
      parts.push(`логист=${Math.round(r.logistics)}₽ комисс=${Math.round(r.commission)}₽`);
      if (r.net_profit != null) parts.push(`прибыль=${Math.round(r.net_profit)}₽`);
      return parts.join(' ');
    };

    const prompt = `/no_think Ты — финансовый аналитик e-commerce. Диагностируй проблемы рентабельности.

Итоги портфеля (${period}): выручка=${Math.round(summary.revenue)}₽ маржа=${summary.margin_pct}% ДРР=${summary.drr_pct}%
Прибыльных SKU: ${counts.profitable} | Убыточных: ${counts.losing} | Низкомаржинальных: ${counts.low_margin} | Без себест.: ${counts.unknown}

${losing.length > 0 ? `Убыточные SKU (топ-${losing.length}):\n${losing.map(fmtRow).join('\n')}` : ''}
${lowMargin.length > 0 ? `\nНизкомаржинальные SKU (<10%):\n${lowMargin.map(fmtRow).join('\n')}` : ''}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения об общем финансовом здоровье>",
  "health": "<healthy|warning|critical>",
  "key_issues": ["<ключевая проблема 1>", "<ключевая проблема 2>"],
  "sku_advice": [
    {
      "sku": "<SKU>",
      "title": "<название>",
      "diagnosis": "<причина убытка: высокий ДРР/высокая логистика/низкая цена/etc>",
      "action": "<конкретное действие — поднять цену на X%/отключить рекламу/etc>",
      "priority": "<critical|high|medium>"
    }
  ],
  "overall_actions": ["<системное действие 1>", "<системное действие 2>", "<системное действие 3>"]
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
        summary: `Убыточных: ${counts.losing}, низкомаржинальных: ${counts.low_margin} SKU из ${rows.length}.`,
        health: counts.losing > rows.length * 0.3 ? 'critical' : counts.losing > 0 ? 'warning' : 'healthy',
        key_issues: counts.losing > 0 ? [`${counts.losing} убыточных SKU требуют внимания`] : [],
        sku_advice: losing.slice(0, 3).map(r => ({
          sku: r.sku, title: r.title ?? r.sku,
          diagnosis: r.drr_pct > 30 ? 'Высокий ДРР — реклама съедает маржу' : 'Высокие косты относительно цены',
          action: 'Проверьте себестоимость и ставки рекламы',
          priority: 'high' as const,
        })),
        overall_actions: ['Проверьте себестоимость товаров в каталоге', 'Снизьте ДРР для убыточных SKU', 'Рассмотрите повышение цен на товары с отрицательной маржой'],
      };
    }

    res.json({ ...result, counts, period, generated_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

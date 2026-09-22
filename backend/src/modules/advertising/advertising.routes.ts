import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import {
  syncAdCampaigns,
  getDayparting, saveDayparting,
  getBidderRule, saveBidderRule,
} from './advertising.service';

export const advertisingRouter = Router();
advertisingRouter.use(authenticate);

// GET /api/advertising/campaigns
advertisingRouter.get('/campaigns', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT ac.*, mc.display_name AS connection_name
     FROM ad_campaigns ac
     JOIN marketplace_connections mc ON mc.id = ac.connection_id
     WHERE ac.user_id = $1
     ORDER BY ac.spend DESC, ac.name`,
    [req.user!.userId],
  );
  // Check if user has ad credentials configured
  const { rows: connections } = await db.query(
    `SELECT platform, credentials_enc FROM marketplace_connections WHERE user_id = $1 AND status = 'active'`,
    [req.user!.userId],
  );
  const hasAdCredentials = connections.some((c: any) => {
    try {
      const { decrypt } = require('../../utils/encryption');
      const creds = JSON.parse(decrypt(c.credentials_enc));
      return (c.platform === 'wb' && creds.advertApiKey) ||
             (c.platform === 'ozon' && creds.performanceClientId);
    } catch { return false; }
  });
  res.json({ campaigns: rows, has_ad_credentials: hasAdCredentials });
});

// POST /api/advertising/campaigns/sync
advertisingRouter.post('/campaigns/sync', async (req: Request, res: Response) => {
  try {
    const result = await syncAdCampaigns(req.user!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/advertising/campaigns/:id/status
advertisingRouter.patch('/campaigns/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!['running', 'paused'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' }); return;
  }
  const { rows } = await db.query(
    `UPDATE ad_campaigns SET status = $1, synced_at = now()
     WHERE id = $2 AND user_id = $3 RETURNING *`,
    [status, req.params.id, req.user!.userId],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  // TODO: call marketplace API to actually pause/resume
  res.json({ campaign: rows[0] });
});

// GET /api/advertising/dayparting/:campaignId
advertisingRouter.get('/dayparting/:campaignId', async (req: Request, res: Response) => {
  try {
    const result = await getDayparting(req.user!.userId, req.params.campaignId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/advertising/dayparting/:campaignId
advertisingRouter.put('/dayparting/:campaignId', async (req: Request, res: Response) => {
  const { schedule, is_active } = req.body;
  if (!Array.isArray(schedule) || schedule.length !== 7) {
    res.status(400).json({ error: 'schedule must be 7×24 array' }); return;
  }
  try {
    await saveDayparting(req.user!.userId, req.params.campaignId, schedule, !!is_active);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.message === 'Campaign not found' ? 404 : 500).json({ error: err.message });
  }
});

// GET /api/advertising/bidder/:campaignId
advertisingRouter.get('/bidder/:campaignId', async (req: Request, res: Response) => {
  try {
    const rule = await getBidderRule(req.user!.userId, req.params.campaignId);
    res.json(rule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/advertising/bidder/:campaignId
advertisingRouter.put('/bidder/:campaignId', async (req: Request, res: Response) => {
  const { is_active, mode, max_drr_pct, max_bid, min_bid } = req.body;
  if (!['aggressive_growth', 'hold_position', 'min_spend'].includes(mode)) {
    res.status(400).json({ error: 'Invalid mode' }); return;
  }
  try {
    await saveBidderRule(req.user!.userId, req.params.campaignId, {
      is_active: !!is_active, mode, max_drr_pct: Number(max_drr_pct ?? 25),
      max_bid: max_bid ? Number(max_bid) : undefined,
      min_bid: min_bid ? Number(min_bid) : undefined,
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.message === 'Campaign not found' ? 404 : 500).json({ error: err.message });
  }
});

// GET /api/advertising/stats — aggregated stats across all campaigns
advertisingRouter.get('/stats', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total_campaigns,
       COUNT(*) FILTER (WHERE status='running')::int AS running,
       SUM(spend)::numeric(12,2) AS total_spend,
       SUM(impressions)::bigint AS total_impressions,
       SUM(clicks)::int AS total_clicks,
       SUM(orders)::int AS total_orders,
       SUM(revenue)::numeric(12,2) AS total_revenue,
       CASE WHEN SUM(revenue) > 0 THEN (SUM(spend)/SUM(revenue)*100)::numeric(6,2) ELSE 0 END AS avg_drr
     FROM ad_campaigns
     WHERE user_id = $1`,
    [req.user!.userId],
  );
  res.json(rows[0] ?? {});
});

// POST /api/advertising/ai-analyze?period=30d — AI recommendations for campaigns
advertisingRouter.post('/ai-analyze', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const period = (req.query.period as string) || '30d';
  const days   = period === '90d' ? 90 : period === '7d' ? 7 : 30;
  const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  try {
    // Aggregate by campaign from advertising_records
    const { rows: campRows } = await db.query(
      `SELECT
         ar.campaign_id,
         ar.campaign_name,
         ar.platform,
         SUM(ar.spend)::numeric(12,2)                          AS spend,
         SUM(ar.ad_revenue)::numeric(12,2)                     AS revenue,
         SUM(ar.impressions)::bigint                           AS impressions,
         SUM(ar.clicks)::int                                   AS clicks,
         SUM(ar.orders)::int                                   AS orders,
         CASE WHEN SUM(ar.spend) > 0 THEN (SUM(ar.ad_revenue)/SUM(ar.spend))::numeric(6,2) ELSE 0 END AS roas,
         CASE WHEN SUM(ar.impressions) > 0 THEN (SUM(ar.clicks)::float/SUM(ar.impressions)*100)::numeric(5,2) ELSE 0 END AS ctr,
         CASE WHEN SUM(ar.clicks) > 0 THEN (SUM(ar.spend)/SUM(ar.clicks))::numeric(8,2) ELSE 0 END AS cpc
       FROM advertising_records ar
       WHERE ar.user_id = $1 AND ar.date >= $2
       GROUP BY ar.campaign_id, ar.campaign_name, ar.platform
       ORDER BY spend DESC
       LIMIT 20`,
      [userId, dateFrom],
    );

    if (!campRows.length) {
      res.json({ campaigns: [], suggestions: [], message: 'Нет данных за период. Синхронизируйте рекламные кампании.' });
      return;
    }

    const campSummary = campRows.map((c: any) =>
      `- "${c.campaign_name ?? c.campaign_id}" (${c.platform}): расход ${c.spend} ₽, выручка ${c.revenue} ₽, ROAS ${c.roas}, CTR ${c.ctr}%, CPC ${c.cpc} ₽, заказов ${c.orders}`
    ).join('\n');

    const avgRoas = campRows.length
      ? (campRows.reduce((s: number, c: any) => s + Number(c.roas), 0) / campRows.length).toFixed(2)
      : 0;

    const prompt = `Ты эксперт по рекламе на маркетплейсах (WildBerries, Ozon).

Период анализа: последние ${days} дней.
Средний ROAS по аккаунту: ${avgRoas}

Данные по кампаниям:
${campSummary}

Дай рекомендации по оптимизации. Ответь ТОЛЬКО в формате JSON:
{
  "overall_assessment": "<1-2 предложения об общем состоянии рекламы>",
  "suggestions": [
    {
      "campaign_id": "<id или название>",
      "action": "pause" | "boost" | "reduce_budget" | "change_bid" | "add_negatives" | "keep",
      "reason": "<почему>",
      "expected_impact": "<ожидаемый результат>",
      "priority": "high" | "medium" | "low"
    }
  ],
  "budget_reallocation": "<совет по общему перераспределению бюджета или null>",
  "quick_wins": ["<совет 1>", "<совет 2>", "<совет 3>"]
}`;

    const { callLlm } = await import('../../integrations/llm/llm.client');
    const { text } = await callLlm([{ role: 'user', content: prompt }], 'claude-haiku-4-5-20251001', 900);

    let analysis: any = null;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      analysis = match ? JSON.parse(match[0]) : null;
    } catch { analysis = null; }

    res.json({
      campaigns: campRows.map((c: any) => ({
        campaign_id:   c.campaign_id,
        campaign_name: c.campaign_name ?? c.campaign_id,
        platform:      c.platform,
        spend:         Number(c.spend),
        revenue:       Number(c.revenue),
        roas:          Number(c.roas),
        ctr:           Number(c.ctr),
        cpc:           Number(c.cpc),
        orders:        Number(c.orders),
        impressions:   Number(c.impressions),
        clicks:        Number(c.clicks),
      })),
      analysis,
      period,
      raw: analysis ? undefined : text,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  createLaunchCampaign, getLaunchCampaigns, getLaunchCampaign,
  updateLaunchCampaign, updateLaunchStep, deleteLaunchCampaign,
} from './launch.service';
import { db } from '../../db';

export const launchRouter = Router();
launchRouter.use(authenticate);

launchRouter.get('/', async (req, res) => {
  const userId = req.user!.userId;
  res.json(await getLaunchCampaigns(userId));
});

launchRouter.post('/', async (req, res) => {
  const userId = req.user!.userId;
  const { name, platform, sku, target_sales, target_position, budget, notes } = req.body;
  if (!name || !platform || !sku) return res.status(400).json({ error: 'name, platform, sku required' });
  try {
    const campaign = await createLaunchCampaign(userId, { name, platform, sku, target_sales, target_position, budget, notes });
    res.json(campaign);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

launchRouter.get('/:id', async (req, res) => {
  const userId = req.user!.userId;
  const c = await getLaunchCampaign(userId, req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

launchRouter.patch('/:id', async (req, res) => {
  const userId = req.user!.userId;
  await updateLaunchCampaign(userId, req.params.id, req.body);
  res.json({ ok: true });
});

launchRouter.delete('/:id', async (req, res) => {
  const userId = req.user!.userId;
  await deleteLaunchCampaign(userId, req.params.id);
  res.json({ ok: true });
});

launchRouter.patch('/steps/:stepId', async (req, res) => {
  const userId = req.user!.userId;
  await updateLaunchStep(userId, req.params.stepId, req.body);
  res.json({ ok: true });
});

// POST /api/launch/ai-plan — generate AI launch steps (not saved to DB)
launchRouter.post('/ai-plan', async (req: Request, res: Response) => {
  const { productName, platform, sku, targetPosition, targetSales, budget, days = 30 } = req.body;
  if (!productName || !platform) {
    res.status(400).json({ error: 'productName and platform required' }); return;
  }

  const platformLabel = platform === 'wb' ? 'Wildberries' : platform === 'ozon' ? 'Ozon' : platform === 'ym' ? 'Яндекс Маркет' : 'Мегамаркет';
  const budgetStr = budget ? `${Number(budget).toLocaleString('ru-RU')} ₽` : 'не задан';
  const posStr = targetPosition ? `топ-${targetPosition}` : 'как можно выше';
  const salesStr = targetSales ? `${targetSales} продаж в день` : 'максимум';

  const prompt = `/no_think Ты эксперт по запуску товаров на маркетплейсах.

Товар: "${productName}" (артикул: ${sku || 'не указан'})
Площадка: ${platformLabel}
Бюджет: ${budgetStr}
Цель по позиции: ${posStr}
Цель по продажам: ${salesStr}
Период: ${days} дней

Составь детальный план запуска товара. Ответь СТРОГО в формате JSON:
{
  "summary": "<2-3 предложения о стратегии запуска>",
  "steps": [
    {
      "step_order": 1,
      "day_start": 1,
      "day_end": 3,
      "type": "listing_update",
      "title": "<короткое название шага>",
      "description": "<конкретные действия, 2-3 предложения>",
      "budget_share_pct": 0,
      "expected_result": "<измеримый результат>",
      "priority": "high"
    }
  ],
  "budget_split": {
    "listing": 0,
    "advertising": 70,
    "discount": 20,
    "other": 10
  },
  "key_risks": ["<риск 1>", "<риск 2>"]
}

Типы шагов (используй один из): listing_update, price_discount, ad_boost, seo_optimization, review_request, self_purchase.
Создай 5-7 шагов, реалистичных для ${platformLabel}.`;

  try {
    const { callLlm } = await import('../../integrations/llm/llm.client');
    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 2500);

    let plan: any = null;
    try {
      // Strip markdown code fences if present
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      plan = match ? JSON.parse(match[0]) : null;
    } catch { plan = null; }

    if (!plan) { res.status(500).json({ error: 'AI response parse failed', raw: text }); return; }
    res.json({ plan, productName, platform, sku, budget, targetPosition, targetSales, days });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/launch/campaigns/:id/apply-ai-plan — apply AI plan steps to existing campaign
launchRouter.post('/:id/apply-ai-plan', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { steps } = req.body;
  if (!Array.isArray(steps) || !steps.length) {
    res.status(400).json({ error: 'steps array required' }); return;
  }

  const campaign = await getLaunchCampaign(userId, req.params.id);
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

  try {
    // Delete existing steps
    await db.query('DELETE FROM launch_steps WHERE campaign_id = $1', [campaign.id]);
    // Insert AI steps
    for (const step of steps.slice(0, 10)) {
      const meta = {
        day_start: Number(step.day_start ?? 1),
        day_end: Number(step.day_end ?? 7),
        expected_result: step.expected_result ?? '',
        priority: step.priority ?? 'medium',
        budget_share_pct: step.budget_share_pct ?? 0,
      };
      await db.query(
        `INSERT INTO launch_steps (campaign_id, step_order, type, title, description, meta)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          campaign.id,
          Number(step.step_order ?? 1),
          String(step.type ?? 'listing_update'),
          String(step.title ?? '').slice(0, 256),
          String(step.description ?? '').slice(0, 1000),
          JSON.stringify(meta),
        ],
      );
    }
    const updated = await getLaunchCampaign(userId, req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

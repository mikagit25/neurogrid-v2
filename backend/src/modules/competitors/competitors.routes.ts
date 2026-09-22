import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { addCompetitor, getCompetitorsWithHistory, scrapeAllActive } from './competitors.service';
import { callLlm } from '../../integrations/llm/llm.client';

export const competitorsRouter = Router();
competitorsRouter.use(authenticate);

// GET /api/competitors
competitorsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const rows = await getCompetitorsWithHistory(req.user!.userId);
    res.json({ competitors: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/competitors
competitorsRouter.post('/', async (req: Request, res: Response) => {
  const { platform, external_id, our_sku, alert_pct } = req.body;
  if (!platform || !external_id) {
    res.status(400).json({ error: 'platform and external_id required' }); return;
  }
  if (!['wb', 'ozon'].includes(platform)) {
    res.status(400).json({ error: 'platform must be wb or ozon' }); return;
  }
  try {
    const competitor = await addCompetitor(req.user!.userId, platform, String(external_id).trim(), {
      our_sku: our_sku ?? undefined,
      alert_pct: alert_pct ? Number(alert_pct) : undefined,
    });
    res.json({ competitor });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/competitors/:id — update alert_pct / our_sku
competitorsRouter.patch('/:id', async (req: Request, res: Response) => {
  const { alert_pct, our_sku } = req.body;
  const { rows } = await db.query(
    `UPDATE competitor_skus
     SET alert_pct = COALESCE($3, alert_pct),
         our_sku   = COALESCE($4, our_sku)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [req.params.id, req.user!.userId,
     alert_pct != null ? Number(alert_pct) : null,
     our_sku ?? null],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ competitor: rows[0] });
});

// DELETE /api/competitors/:id
competitorsRouter.delete('/:id', async (req: Request, res: Response) => {
  await db.query(
    `UPDATE competitor_skus SET is_active = false WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.userId],
  );
  res.json({ ok: true });
});

// POST /api/competitors/scrape-all — manual trigger to refresh all prices
competitorsRouter.post('/scrape-all', async (req: Request, res: Response) => {
  try {
    const count = await scrapeAllActive(req.user!.userId);
    res.json({ ok: true, updated: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/competitors/ai-summary — AI competitive positioning analysis
competitorsRouter.post('/ai-summary', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const competitors = await getCompetitorsWithHistory(userId);

    if (!competitors.length) {
      res.json({
        positioning: 'unknown',
        summary: 'Добавьте конкурентов для мониторинга, чтобы получить AI-анализ конкурентной позиции.',
        advantages: [],
        weaknesses: [],
        strategy_tips: ['Добавьте хотя бы 2-3 конкурентов в разделе «Конкуренты»'],
        generated_at: new Date().toISOString(),
      });
      return;
    }

    // Fetch user's own revenue/pricing context (last 30 days)
    const { rows: ownData } = await db.query(`
      SELECT
        sku, MIN(title) AS title,
        AVG(revenue / NULLIF(quantity, 0))::float AS avg_price,
        SUM(revenue)::float AS revenue
      FROM finance_records
      WHERE user_id = $1
        AND period_from >= (CURRENT_DATE - INTERVAL '30 days')
        AND sku IS NOT NULL
      GROUP BY sku
      ORDER BY SUM(revenue) DESC
      LIMIT 20
    `, [userId]);

    const competitorLines = competitors.map((c: any) => {
      const latest = c.price_history?.[0];
      const trend = (() => {
        const hist = c.price_history ?? [];
        if (hist.length < 2) return 'нет истории';
        const oldest = hist[hist.length - 1].price;
        const newest = hist[0].price;
        const diff = newest - oldest;
        if (diff < 0) return `снизил на ${Math.abs(Math.round((diff / oldest) * 100))}%`;
        if (diff > 0) return `поднял на ${Math.round((diff / oldest) * 100)}%`;
        return 'без изменений';
      })();
      const ourSku = c.our_sku ? ownData.find((o: any) => o.sku === c.our_sku) : null;
      const myPrice = ourSku?.avg_price ? Math.round(ourSku.avg_price) : null;
      const compPrice = latest?.price ?? null;
      const diffPct = myPrice && compPrice ? Math.round(((myPrice - compPrice) / compPrice) * 100) : null;
      return `${c.platform?.toUpperCase()} конкурент="${c.name || c.external_id}"${c.our_sku ? ` vs мой=${c.our_sku}` : ''} цена_конк=${compPrice ?? '?'} ₽${myPrice ? ` моя_цена=${myPrice} ₽ (разн. ${diffPct != null ? (diffPct >= 0 ? '+' : '') + diffPct + '%' : '?'})` : ''} тренд_цены: ${trend}`;
    }).join('\n');

    const prompt = `/no_think Ты — эксперт по конкурентному анализу маркетплейсов. Проанализируй позицию продавца.

Мои товары (топ по выручке за 30 дней):
${ownData.slice(0, 5).map((o: any) => `SKU=${o.sku} "${o.title || ''}" ср.цена=${Math.round(o.avg_price ?? 0)} ₽ выручка=${Math.round(o.revenue)} ₽`).join('\n') || 'Нет данных о продажах'}

Отслеживаемые конкуренты:
${competitorLines}

Ответь СТРОГО в JSON:
{
  "positioning": "leader|competitive|lagging|mixed",
  "positioning_label": "<Лидер цен|Конкурентоспособен|Отстаём|Смешанная позиция>",
  "summary": "<2-3 предложения об общей конкурентной позиции>",
  "advantages": ["<преимущество 1>", "<преимущество 2>"],
  "weaknesses": ["<слабое место 1>", "<слабое место 2>"],
  "strategy_tips": ["<конкретный совет 1>", "<конкретный совет 2>", "<конкретный совет 3>"]
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 900);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      result = {
        positioning: 'mixed',
        positioning_label: 'Смешанная позиция',
        summary: `Отслеживается ${competitors.length} конкурентов. Регулярно обновляйте цены и анализируйте их тренды.`,
        advantages: ['Вы активно отслеживаете конкурентов'],
        weaknesses: ['Не удалось получить детальный AI-анализ'],
        strategy_tips: ['Обновите цены конкурентов через кнопку «Обновить»', 'Добавьте больше конкурентов для полного анализа'],
      };
    }

    res.json({ ...result, competitors_count: competitors.length, generated_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  analyzeProduct,
  executeAutopilot,
  getSession,
  getSessions,
  getPricingRules,
  upsertPricingRule,
  deletePricingRule,
} from './autopilot.service';
import { applyPricingRule } from '../../queue/workers/pricing.worker';
import { db } from '../../db';

export const autopilotRouter = Router();
autopilotRouter.use(authenticate);

// Analyze product → return plan (stateless, no DB write)
autopilotRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { productName, description, photoUrls, platform } = req.body;
    if (!productName) {
      res.status(400).json({ error: 'productName is required' });
      return;
    }
    const plan = await analyzeProduct({
      productName: String(productName),
      description: String(description ?? ''),
      photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
      platform: platform === 'ozon' ? 'ozon' : 'wb',
    });
    res.json({ plan });
  } catch (err) {
    const e = err as any;
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

// Batch analyze — array of products
autopilotRouter.post('/analyze/batch', async (req: Request, res: Response) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      res.status(400).json({ error: 'products array is required' });
      return;
    }
    const plans = await Promise.all(
      products.slice(0, 10).map((p: any) =>
        analyzeProduct({
          productName: String(p.productName ?? ''),
          description: String(p.description ?? ''),
          photoUrls: Array.isArray(p.photoUrls) ? p.photoUrls : [],
          platform: p.platform === 'ozon' ? 'ozon' : 'wb',
        }).catch((err) => ({ error: (err as Error).message }))
      )
    );
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Execute autopilot plan → create session + queue jobs + setup agents
autopilotRouter.post('/execute', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { product, connectionId, actions, photoEnhancements, pricingRule } = req.body;
    if (!product?.name) {
      res.status(400).json({ error: 'product.name is required' });
      return;
    }
    const result = await executeAutopilot(userId, {
      product: {
        name: String(product.name),
        description: String(product.description ?? ''),
        photoUrls: Array.isArray(product.photoUrls) ? product.photoUrls : [],
        platform: product.platform === 'ozon' ? 'ozon' : 'wb',
        characteristics: Array.isArray(product.characteristics) ? product.characteristics : [],
      },
      connectionId: connectionId ?? null,
      actions: Array.isArray(actions) ? actions : [],
      photoEnhancements: Array.isArray(photoEnhancements) ? photoEnhancements : [],
      pricingRule: pricingRule ?? null,
    });
    res.json(result);
  } catch (err) {
    const e = err as any;
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

// Get session status + run results
autopilotRouter.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const session = await getSession(userId, req.params.id);
    res.json({ session });
  } catch (err) {
    const e = err as any;
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

// List sessions
autopilotRouter.get('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const sessions = await getSessions(userId, Number(req.query.limit) || 20);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---- Pricing rules ----

autopilotRouter.get('/pricing-rules', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const rules = await getPricingRules(userId);
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

autopilotRouter.post('/pricing-rules', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const rule = await upsertPricingRule(userId, req.body);
    res.json({ rule });
  } catch (err) {
    const e = err as any;
    res.status(e.status ?? 400).json({ error: e.message });
  }
});

autopilotRouter.patch('/pricing-rules/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const rule = await upsertPricingRule(userId, { ...req.body, id: req.params.id });
    res.json({ rule });
  } catch (err) {
    const e = err as any;
    res.status(e.status ?? 400).json({ error: e.message });
  }
});

autopilotRouter.delete('/pricing-rules/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    await deletePricingRule(userId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/autopilot/pricing-rules/:id/apply — manual trigger
autopilotRouter.post('/pricing-rules/:id/apply', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const result = await applyPricingRule(req.params.id, userId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/autopilot/pricing-rules/history — all changes for user (must be BEFORE /:id/history)
autopilotRouter.get('/pricing-rules/history', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { rows } = await db.query(
      `SELECT pcl.id, pcl.rule_id, pr.name AS rule_name, pcl.platform, pcl.sku,
              pcl.title, pcl.old_price, pcl.new_price, pcl.reason, pcl.applied_at
       FROM price_change_log pcl
       LEFT JOIN pricing_rules pr ON pr.id = pcl.rule_id
       WHERE pcl.user_id = $1
       ORDER BY pcl.applied_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/autopilot/pricing-rules/:id/history?limit=50
autopilotRouter.get('/pricing-rules/:id/history', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { rows } = await db.query(
      `SELECT pcl.id, pcl.platform, pcl.sku, pcl.title, pcl.old_price, pcl.new_price, pcl.reason, pcl.applied_at
       FROM price_change_log pcl
       WHERE pcl.rule_id = $1 AND pcl.user_id = $2
       ORDER BY pcl.applied_at DESC
       LIMIT $3`,
      [req.params.id, userId, limit],
    );
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/autopilot/optimize-price — AI price suggestion for a SKU
autopilotRouter.post('/optimize-price', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { sku, platform } = req.body;
  if (!sku) { res.status(400).json({ error: 'sku is required' }); return; }

  try {
    // Current price from price_change_log (latest) or user_catalog
    const { rows: catalogRows } = await db.query(
      `SELECT uc.title, uc.purchase_price,
              (SELECT pcl.new_price FROM price_change_log pcl WHERE pcl.sku = uc.sku AND pcl.user_id = $1 ORDER BY pcl.applied_at DESC LIMIT 1) AS last_set_price
       FROM user_catalog uc
       WHERE uc.user_id = $1 AND uc.sku = $2 ${platform ? 'AND uc.platform = $3' : ''}
       LIMIT 1`,
      platform ? [userId, sku, platform] : [userId, sku],
    );
    const catalog = catalogRows[0] ?? null;

    // 30-day revenue + avg selling price
    const dateFrom = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const { rows: finRows } = await db.query(
      `SELECT AVG(fr.price)::numeric AS avg_price, SUM(fr.revenue)::numeric AS revenue,
              SUM(fr.quantity)::integer AS qty
       FROM finance_records fr
       WHERE fr.user_id = $1 AND fr.sku = $2 AND fr.date >= $3`,
      [userId, sku, dateFrom],
    );
    const fin = finRows[0];

    // Competitor prices for this SKU
    const { rows: compRows } = await db.query(
      `SELECT cs.name, cs.platform, cs.last_price, cs.alert_pct
       FROM competitor_skus cs
       WHERE cs.user_id = $1 AND cs.our_sku = $2 AND cs.is_active = true AND cs.last_price IS NOT NULL`,
      [userId, sku],
    );

    const currentPrice = Number(fin?.avg_price ?? catalog?.last_set_price ?? 0);
    const purchasePrice = Number(catalog?.purchase_price ?? 0);
    const margin = currentPrice > 0 && purchasePrice > 0
      ? ((currentPrice - purchasePrice) / currentPrice * 100).toFixed(1)
      : null;

    const competitorSummary = compRows.length
      ? compRows.map((c: any) => `- ${c.name ?? c.platform}: ${c.last_price} ₽`).join('\n')
      : 'Данных нет';

    const prompt = `Ты эксперт по ценообразованию на маркетплейсах (WildBerries, Ozon).

Товар: "${catalog?.title ?? sku}" (SKU: ${sku}${platform ? ', ' + platform : ''})
Текущая средняя цена продажи: ${currentPrice > 0 ? currentPrice + ' ₽' : 'неизвестно'}
Себестоимость: ${purchasePrice > 0 ? purchasePrice + ' ₽' : 'неизвестно'}
Текущая маржа: ${margin != null ? margin + '%' : 'неизвестно'}
Продажи за 30 дней: ${fin?.qty ?? 0} шт., выручка ${Math.round(Number(fin?.revenue ?? 0))} ₽

Цены конкурентов:
${competitorSummary}

Дай рекомендацию по оптимальной цене. Ответь ТОЛЬКО в формате JSON:
{
  "suggested_price": <число>,
  "price_range": {"min": <число>, "max": <число>},
  "reasoning": "<2-3 предложения — почему именно эта цена>",
  "strategy": "premium" | "competitive" | "penetration" | "value",
  "expected_margin_pct": <число или null>,
  "caution": "<краткое предупреждение или null>"
}`;

    const { callLlm } = await import('../../integrations/llm/llm.client');
    const { text } = await callLlm([{ role: 'user', content: prompt }], 'claude-haiku-4-5-20251001', 600);

    let suggestion: any = null;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      suggestion = match ? JSON.parse(match[0]) : null;
    } catch { suggestion = null; }

    res.json({
      sku,
      platform: platform ?? null,
      title: catalog?.title ?? sku,
      current_price: currentPrice || null,
      purchase_price: purchasePrice || null,
      margin_pct: margin ? parseFloat(margin) : null,
      competitors: compRows,
      suggestion,
      raw: suggestion ? undefined : text,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

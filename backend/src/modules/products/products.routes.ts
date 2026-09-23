import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getUserConnections, getConnectionById } from '../connections/connections.service';
import { createAdapter } from '../../integrations/marketplace/factory';
import { scoreProduct, scoreLabel, ScoredProduct } from './products.service';
import { db } from '../../db';

export const productsRouter = Router();
productsRouter.use(authenticate);

productsRouter.get('/', async (req: Request, res: Response) => {
  const connectionId = req.query.connectionId as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  try {
    let connections;
    if (connectionId) {
      const c = await getConnectionById(connectionId, req.user!.userId);
      connections = c ? [c] : [];
    } else {
      connections = await getUserConnections(req.user!.userId);
    }

    if (connections.length === 0) {
      res.json({ products: [], summary: { total: 0, poor: 0, average: 0, good: 0, excellent: 0, avgScore: 0 } });
      return;
    }

    const allProducts: ScoredProduct[] = [];

    for (const conn of connections) {
      try {
        const adapter = createAdapter(conn.platform, conn.credentials_enc);
        const raw = await adapter.getProducts(limit);
        for (const p of raw) {
          const { score, issues } = scoreProduct(p, conn.platform);
          allProducts.push({
            ...p,
            score,
            scoreLabel: scoreLabel(score),
            issues,
            platform: conn.platform,
            connectionId: conn.id,
          });
        }
      } catch (e) {
        // Skip failed connection, return rest
        console.error(`[products] connection ${conn.id} failed:`, (e as Error).message);
      }
    }

    // Fallback: if adapters returned nothing, serve from user_catalog + stock_snapshots
    if (allProducts.length === 0) {
      const { rows } = await db.query(
        `SELECT
           uc.platform, uc.sku, uc.title, uc.purchase_price,
           COALESCE(uc.description, '') AS description,
           COALESCE(ss.quantity, 0) AS stock,
           COALESCE(
             (SELECT ROUND(SUM(revenue)::numeric / NULLIF(SUM(quantity), 0), 0)
              FROM finance_records
              WHERE user_id = uc.user_id AND sku = uc.sku AND platform = uc.platform
                AND period_from >= NOW() - INTERVAL '30 days'),
             uc.purchase_price * 2.5
           )::numeric AS price
         FROM user_catalog uc
         LEFT JOIN LATERAL (
           SELECT SUM(quantity)::int AS quantity
           FROM stock_snapshots
           WHERE user_id = $1 AND platform = uc.platform AND sku = uc.sku
         ) ss ON true
         WHERE uc.user_id = $1
         ORDER BY uc.updated_at DESC
         LIMIT $2`,
        [req.user!.userId, limit],
      );

      for (const row of rows) {
        const p = {
          sku: row.sku,
          title: row.title ?? row.sku,
          price: parseFloat(row.price ?? row.purchase_price ?? '0'),
          stock: parseInt(row.stock ?? '0', 10),
          description: row.description ?? '',
        };
        const { score, issues } = scoreProduct(p, row.platform);
        allProducts.push({
          ...p,
          score,
          scoreLabel: scoreLabel(score),
          issues,
          platform: row.platform,
          connectionId: '',
        });
      }
    }

    // Sort: worst first so user sees what to fix
    allProducts.sort((a, b) => a.score - b.score);

    const summary = {
      total: allProducts.length,
      poor:      allProducts.filter((p) => p.scoreLabel === 'poor').length,
      average:   allProducts.filter((p) => p.scoreLabel === 'average').length,
      good:      allProducts.filter((p) => p.scoreLabel === 'good').length,
      excellent: allProducts.filter((p) => p.scoreLabel === 'excellent').length,
      avgScore:  allProducts.length
        ? Math.round(allProducts.reduce((s, p) => s + p.score, 0) / allProducts.length)
        : 0,
    };

    res.json({ products: allProducts, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/products/price — inline price update from catalog
productsRouter.patch('/price', async (req: Request, res: Response) => {
  const { connectionId, sku, price } = req.body;
  if (!connectionId || !sku || typeof price !== 'number' || price <= 0) {
    res.status(400).json({ error: 'connectionId, sku and price required' });
    return;
  }

  try {
    const conn = await getConnectionById(connectionId, req.user!.userId);
    if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }
    const adapter = createAdapter(conn.platform, conn.credentials_enc);
    await adapter.updatePrice(sku, price);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/export — CSV of all products across connections
productsRouter.get('/export', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const connections = await getUserConnections(userId);
    const rows: any[] = [];
    for (const conn of connections) {
      try {
        const adapter = createAdapter(conn.platform, conn.credentials_enc);
        const products = await adapter.getProducts(500);
        for (const p of products) {
          const scored = scoreProduct(p, conn.platform as any);
          rows.push({
            platform: conn.platform,
            sku: p.sku,
            title: p.title,
            price: p.price,
            stock: p.stock,
            score: scored.score,
            score_label: scoreLabel(scored.score),
          });
        }
      } catch { /* skip failed connection */ }
    }
    const header = 'Площадка,SKU,Название,Цена,Остаток,Балл,Оценка\n';
    const body = rows.map((r: any) =>
      [r.platform, r.sku, r.title, r.price, r.stock, r.score, r.score_label]
        .map((v: any) => `"${v ?? ''}"`)
        .join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.send('﻿' + header + body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/bulk-price — update prices for multiple SKUs
productsRouter.post('/bulk-price', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { connectionId, updates } = req.body;
  // updates: [{sku: string, price: number}]
  if (!connectionId || !Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'connectionId and updates[] required' }); return;
  }

  const conn = await getConnectionById(connectionId, userId);
  if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

  const adapter = createAdapter(conn.platform, conn.credentials_enc);
  let applied = 0; let failed = 0;
  for (const { sku, price } of updates) {
    if (!sku || typeof price !== 'number' || price <= 0) { failed++; continue; }
    try {
      await adapter.updatePrice(String(sku), price);
      applied++;
    } catch { failed++; }
  }
  res.json({ ok: true, applied, failed });
});

// POST /api/products/bulk-ai-content — AI-generate improved titles/descriptions
productsRouter.post('/bulk-ai-content', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { connectionId, skus } = req.body;
  if (!connectionId || !Array.isArray(skus) || skus.length === 0) {
    res.status(400).json({ error: 'connectionId and skus[] required' }); return;
  }
  if (skus.length > 20) {
    res.status(400).json({ error: 'Maximum 20 SKUs per request' }); return;
  }

  const conn = await getConnectionById(connectionId, userId);
  if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

  const adapter = createAdapter(conn.platform, conn.credentials_enc);
  const allProducts = await adapter.getProducts(500);
  const targets = allProducts.filter(p => skus.includes(p.sku));

  const { callLlm } = await import('../../integrations/llm/llm.client');
  const results: { sku: string; title: string; description: string }[] = [];

  for (const p of targets) {
    try {
      const prompt = `Ты SEO-копирайтер для маркетплейса.
Товар: ${p.title}
Описание: ${p.description ? p.description.slice(0, 300) : '(нет)'}
Платформа: ${conn.platform.toUpperCase()}

Напиши:
1. Улучшенный SEO-заголовок (60–90 символов, с ключевыми словами, без повторов)
2. Описание товара (300–500 символов, преимущества + ключи, без маркеров списка)

Формат ответа (строго):
ЗАГОЛОВОК: <заголовок>
ОПИСАНИЕ: <описание>`;

      const { text } = await callLlm([{ role: 'user', content: prompt }]);
      const titleMatch = text.match(/ЗАГОЛОВОК:\s*(.+)/);
      const descMatch = text.match(/ОПИСАНИЕ:\s*([\s\S]+)/);
      results.push({
        sku: p.sku,
        title: titleMatch?.[1]?.trim() ?? p.title,
        description: descMatch?.[1]?.trim() ?? p.description ?? '',
      });
    } catch {
      results.push({ sku: p.sku, title: p.title, description: p.description ?? '' });
    }
    // Avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  res.json({ results });
});

// GET /api/products/:sku/detail?connectionId=  — aggregated per-product analytics
productsRouter.get('/:sku/detail', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { sku } = req.params;
  const { connectionId } = req.query as { connectionId?: string };

  try {
    const [priceHistory, competitorPrices, stockTrend, seoPositions, reviews] = await Promise.all([
      db.query(
        `SELECT applied_at, old_price, new_price, reason
         FROM price_change_log
         WHERE user_id = $1 AND sku = $2
         ORDER BY applied_at DESC LIMIT 30`,
        [userId, sku],
      ),
      db.query(
        `SELECT DISTINCT ON (competitor_sku)
           competitor_sku, competitor_name, price, my_price, diff_pct, checked_at, platform
         FROM competitor_prices
         WHERE user_id = $1 AND my_sku = $2
         ORDER BY competitor_sku, checked_at DESC`,
        [userId, sku],
      ),
      db.query(
        `SELECT date_trunc('day', snapped_at) AS day, SUM(quantity)::int AS qty
         FROM stock_snapshots
         WHERE user_id = $1 AND sku = $2 AND snapped_at > now() - interval '30 days'
         GROUP BY 1 ORDER BY 1 ASC`,
        [userId, sku],
      ),
      db.query(
        `SELECT tk.keyword, kp.position, kp.page, kp.checked_at, tk.platform
         FROM keyword_positions kp
         JOIN tracked_keywords tk ON tk.id = kp.keyword_id
         WHERE tk.user_id = $1 AND tk.sku = $2
           AND kp.checked_at = (
             SELECT MAX(checked_at) FROM keyword_positions kp2 WHERE kp2.keyword_id = kp.keyword_id
           )
         ORDER BY kp.position ASC LIMIT 20`,
        [userId, sku],
      ).catch(() => ({ rows: [] })),
      db.query(
        `SELECT id, rating, text, author, platform, answered_text, is_answered, created_at
         FROM product_reviews
         WHERE user_id = $1 AND sku = $2
         ORDER BY created_at DESC LIMIT 10`,
        [userId, sku],
      ).catch(() => ({ rows: [] })),
    ]);

    // Try to get current product info from marketplace
    let product: Record<string, unknown> | null = null;
    if (connectionId) {
      try {
        const conn = await getConnectionById(connectionId, userId);
        if (conn) {
          const adapter = createAdapter(conn.platform, conn.credentials_enc);
          const products = await adapter.getProducts(500);
          const found = products.find((p) => p.sku === sku);
          if (found) {
            const { score, issues } = scoreProduct(found, conn.platform);
            product = { ...found, score, scoreLabel: scoreLabel(score), issues, platform: conn.platform, connectionId };
          }
        }
      } catch { /* best effort */ }
    }

    res.json({
      sku,
      product,
      priceHistory: priceHistory.rows,
      competitorPrices: competitorPrices.rows,
      stockTrend: stockTrend.rows,
      seoPositions: seoPositions.rows,
      reviews: reviews.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:sku/smart-price — AI price recommendation
productsRouter.get('/:sku/smart-price', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { sku } = req.params;
  const { connectionId } = req.query as { connectionId?: string };
  try {
    // Gather data
    const [priceRow, competitorRow, salesRow, adRow] = await Promise.all([
      db.query<{ new_price: string; applied_at: string }>(
        `SELECT new_price, applied_at FROM price_change_log
         WHERE user_id = $1 AND sku = $2 ORDER BY applied_at DESC LIMIT 1`,
        [userId, sku],
      ),
      db.query<{ competitor_sku: string; price: string; platform: string }>(
        `SELECT competitor_sku, price::numeric AS price, platform
         FROM competitor_prices WHERE user_id = $1 AND our_sku = $2
         ORDER BY recorded_at DESC LIMIT 10`,
        [userId, sku],
      ).catch(() => ({ rows: [] as any[] })),
      db.query<{ qty: string; revenue: string }>(
        `SELECT SUM(quantity)::int AS qty, SUM(revenue)::numeric AS revenue
         FROM finance_records WHERE user_id = $1 AND sku = $2
         AND period_from >= now()::date - interval '30 days'`,
        [userId, sku],
      ),
      db.query<{ spend: string; orders: string }>(
        `SELECT SUM(spend)::numeric AS spend, SUM(orders)::int AS orders
         FROM advertising_stats WHERE user_id = $1 AND sku = $2
         AND stat_date >= now()::date - interval '30 days'`,
        [userId, sku],
      ).catch(() => ({ rows: [{ spend: '0', orders: '0' }] })),
    ]);

    const currentPrice = parseFloat(priceRow.rows[0]?.new_price ?? '0');
    const compPrices = competitorRow.rows.map((r) => parseFloat(r.price));
    const avgCompPrice = compPrices.length > 0 ? compPrices.reduce((a, b) => a + b, 0) / compPrices.length : null;
    const minCompPrice = compPrices.length > 0 ? Math.min(...compPrices) : null;
    const monthlySales = parseInt(salesRow.rows[0]?.qty ?? '0', 10);
    const monthlyRevenue = parseFloat(salesRow.rows[0]?.revenue ?? '0');
    const adSpend = parseFloat(adRow.rows[0]?.spend ?? '0');
    const cpo = monthlySales > 0 ? adSpend / monthlySales : 0;
    const avgSalePrice = monthlySales > 0 ? monthlyRevenue / monthlySales : currentPrice;

    // Simple rule-based recommendation when we have enough data
    let recommended: number | null = null;
    let reasoning = '';
    let confidence: 'high' | 'medium' | 'low' = 'low';

    if (avgCompPrice && currentPrice > 0) {
      const gap = currentPrice - avgCompPrice;
      const gapPct = (gap / avgCompPrice) * 100;
      if (gapPct > 10) {
        recommended = Math.round(avgCompPrice * 1.02); // 2% above avg
        reasoning = `Ваша цена на ${Math.round(gapPct)}% выше среднеконкурентной (${avgCompPrice.toLocaleString('ru-RU')} ₽). Рекомендуем снизить до ${recommended.toLocaleString('ru-RU')} ₽ — это может увеличить конверсию.`;
        confidence = 'high';
      } else if (gapPct < -5 && monthlySales > 5) {
        recommended = Math.round(avgCompPrice * 0.97); // 3% below avg
        reasoning = `Продажи идут хорошо (${monthlySales} шт./мес), а ваша цена ниже конкурентов. Можно попробовать поднять до ${recommended.toLocaleString('ru-RU')} ₽ без потери позиций.`;
        confidence = 'medium';
      } else {
        recommended = currentPrice;
        reasoning = `Цена в оптимальной зоне относительно конкурентов (разница ${gapPct > 0 ? '+' : ''}${Math.round(gapPct)}%).`;
        confidence = 'medium';
      }
    } else if (currentPrice > 0) {
      recommended = currentPrice;
      reasoning = 'Недостаточно данных о ценах конкурентов для точной рекомендации.';
      confidence = 'low';
    }

    res.json({
      sku,
      currentPrice,
      recommendedPrice: recommended,
      confidence,
      reasoning,
      data: {
        avgCompPrice,
        minCompPrice,
        competitorCount: compPrices.length,
        monthlySales,
        avgSalePrice,
        cpo,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Product Card Audit ───────────────────────────────────────────────────

// POST /api/products/:sku/audit?platform=wb
productsRouter.post('/:sku/audit', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sku = decodeURIComponent(req.params.sku);
  const platform = req.query.platform as string | undefined;

  try {
    const { callLlm } = await import('../../integrations/llm/llm.client');

    const catRes = await db.query(
      `SELECT uc.*, ps.score, ps.issues
       FROM user_catalog uc
       LEFT JOIN LATERAL (
         SELECT score, issues FROM product_scores ps
         WHERE ps.sku = uc.sku AND ps.connection_id IN (
           SELECT id FROM marketplace_connections WHERE user_id = $1
         )
         LIMIT 1
       ) ps ON true
       WHERE uc.user_id = $1 AND uc.sku = $2 ${platform ? 'AND uc.platform = $3' : ''}
       LIMIT 1`,
      platform ? [userId, sku, platform] : [userId, sku],
    ).catch(() => ({ rows: [] }));

    const product = catRes.rows[0];

    const finRes = await db.query(
      `SELECT SUM(revenue)::int AS revenue_30d, SUM(quantity)::int AS qty_30d
       FROM finance_records
       WHERE user_id = $1 AND sku = $2 AND period_from >= now()::date - 30`,
      [userId, sku],
    ).catch(() => ({ rows: [{}] }));
    const fin = finRes.rows[0] ?? {};

    const revRes = await db.query(
      `SELECT text, rating FROM reviews
       WHERE user_id = $1 AND sku = $2 AND text IS NOT NULL
       ORDER BY created_at DESC LIMIT 5`,
      [userId, sku],
    ).catch(() => ({ rows: [] }));
    const reviewSnippets = revRes.rows.map((r: any) => `[${r.rating}★] ${r.text?.slice(0, 100)}`).join('\n');

    const productInfo = product
      ? `Название: ${product.title ?? sku}\nОписание: ${(product.description ?? '').slice(0, 300) || 'не указано'}\nРейтинг: ${product.avg_rating ?? '?'}\nБалл листинга: ${product.score ?? '?'}/100\nПродажи 30д: ${fin.qty_30d ?? 0} шт., Выручка: ${fin.revenue_30d ?? 0} ₽`
      : `SKU: ${sku}`;

    const prompt = `Ты — эксперт по оптимизации карточек товаров на маркетплейсах WB/Ozon.

Данные товара:
${productInfo}
${reviewSnippets ? `\nПоследние отзывы:\n${reviewSnippets}` : ''}

Верни JSON (ТОЛЬКО JSON, без markdown):
{
  "score": <число 0-100>,
  "title_issues": ["..."],
  "title_suggestion": "улучшенный заголовок",
  "description_tips": ["совет 1", "..."],
  "keyword_gaps": ["ключ 1", "..."],
  "quick_wins": [{"action":"...","impact":"высокий|средний|низкий","effort":"низкий|средний|высокий"}],
  "summary": "краткое резюме"
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], 'claude-haiku-4-5-20251001', 800);

    let audit: any;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      audit = JSON.parse(jsonMatch?.[0] ?? '{}');
    } catch {
      audit = { summary: text, quick_wins: [], keyword_gaps: [], description_tips: [], title_issues: [] };
    }

    res.json({ sku, audit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

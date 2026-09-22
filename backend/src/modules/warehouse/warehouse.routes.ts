import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { checkFeatureAccess } from '../subscriptions/subscriptions.service';
import { syncWarehouseStocks, getLatestStocks, upsertCatalogItem, getCatalog } from './warehouse.service';
import { callLlm } from '../../integrations/llm/llm.client';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const warehouseRouter = Router();
warehouseRouter.use(authenticate);

// All warehouse routes require 'start' plan or above
warehouseRouter.use(async (req: Request, res: Response, next) => {
  try {
    await checkFeatureAccess(req.user!.userId, 'warehouse');
    next();
  } catch (err: any) {
    res.status(err.status || 403).json({ error: err.message });
  }
});

// GET /api/warehouse/stocks — latest snapshot grouped by sku/warehouse
warehouseRouter.get('/stocks', async (req: Request, res: Response) => {
  try {
    const rows = await getLatestStocks(req.user!.userId);
    res.json({ stocks: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/warehouse/sync — trigger manual sync
warehouseRouter.post('/sync', async (req: Request, res: Response) => {
  try {
    const count = await syncWarehouseStocks(req.user!.userId);
    res.json({ ok: true, rows: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/warehouse/catalog — user product catalog with purchase prices
warehouseRouter.get('/catalog', async (req: Request, res: Response) => {
  try {
    const items = await getCatalog(req.user!.userId);
    res.json({ catalog: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/warehouse/catalog/:platform/:sku — set purchase price / title
const catalogSchema = z.object({
  purchase_price: z.number().positive().optional(),
  title: z.string().max(512).optional(),
  barcode: z.string().max(128).optional(),
});

warehouseRouter.put('/catalog/:platform/:sku', async (req: Request, res: Response) => {
  const parsed = catalogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }
  try {
    const item = await upsertCatalogItem(
      req.user!.userId,
      req.params.platform,
      req.params.sku,
      parsed.data,
    );
    res.json({ item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/warehouse/catalog/import-csv — bulk purchase price upload
// CSV format: platform,sku,purchase_price  (first line = header, ignored)
warehouseRouter.post('/catalog/import-csv', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const userId = req.user!.userId;
  const text = req.file.buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const updated: string[] = [];
  const errors: string[] = [];

  // skip header row
  const dataLines = lines[0]?.toLowerCase().includes('platform') ? lines.slice(1) : lines;

  for (const line of dataLines) {
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3) { errors.push(`Skipped: "${line}" (need platform,sku,purchase_price)`); continue; }
    const [platform, sku, priceStr] = parts;
    const price = parseFloat(priceStr);
    if (!platform || !sku) { errors.push(`Skipped: "${line}" (empty platform or sku)`); continue; }
    if (isNaN(price) || price <= 0) { errors.push(`Skipped: "${line}" (invalid price)`); continue; }
    try {
      await upsertCatalogItem(userId, platform, sku, { purchase_price: price });
      updated.push(`${platform}/${sku}`);
    } catch (e: any) {
      errors.push(`Error ${platform}/${sku}: ${e.message}`);
    }
  }

  res.json({ updated: updated.length, errors });
});

// GET /api/warehouse/catalog/export-csv — download catalog as CSV template
warehouseRouter.get('/catalog/export-csv', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const items = await getCatalog(userId);
    const header = 'platform,sku,title,purchase_price\n';
    const rows = items.map((i: any) =>
      `${i.platform},"${(i.sku ?? '').replace(/"/g, '""')}","${(i.title ?? '').replace(/"/g, '""')}",${i.purchase_price ?? ''}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="purchase_prices.csv"');
    res.send('﻿' + header + rows); // BOM for Excel
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/warehouse/ai-analysis — AI analysis of FBO/FBS stock distribution
warehouseRouter.post('/ai-analysis', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const stocks = await getLatestStocks(userId);

    if (!stocks.length) {
      res.json({
        summary: 'Нет данных о складских остатках. Синхронизируйте склад.',
        total_skus: 0,
        overstock: [],
        understock: [],
        fbo_fbs_imbalance: [],
        actions: ['Подключите маркетплейсы и синхронизируйте склад'],
        generated_at: new Date().toISOString(),
      });
      return;
    }

    // Group by sku+platform: aggregate fbo/fbs quantities
    const skuMap = new Map<string, { sku: string; platform: string; title: string; fbo: number; fbs: number; purchase_price: number | null }>();
    for (const s of stocks) {
      const key = `${s.platform}|${s.sku}`;
      if (!skuMap.has(key)) {
        skuMap.set(key, { sku: s.sku, platform: s.platform, title: s.catalog_title ?? s.title ?? s.sku, fbo: 0, fbs: 0, purchase_price: s.purchase_price ? Number(s.purchase_price) : null });
      }
      const entry = skuMap.get(key)!;
      const wt = (s.warehouse_type ?? '').toLowerCase();
      if (wt === 'fbo') entry.fbo += Number(s.quantity ?? 0);
      else if (wt === 'fbs') entry.fbs += Number(s.quantity ?? 0);
      else entry.fbo += Number(s.quantity ?? 0);
    }

    const items = Array.from(skuMap.values());
    const totalQty = items.reduce((s, i) => s + i.fbo + i.fbs, 0);
    const avgQty = items.length ? totalQty / items.length : 0;

    const overstock  = items.filter(i => (i.fbo + i.fbs) > avgQty * 3).sort((a, b) => (b.fbo + b.fbs) - (a.fbo + a.fbs)).slice(0, 5);
    const understock = items.filter(i => (i.fbo + i.fbs) > 0 && (i.fbo + i.fbs) < avgQty * 0.2).slice(0, 5);
    const imbalanced = items.filter(i => i.fbo > 0 && i.fbs > 0 && (Math.max(i.fbo, i.fbs) / Math.min(i.fbo, i.fbs)) > 5).slice(0, 5);
    const zeroStock  = items.filter(i => i.fbo + i.fbs === 0).length;

    const fmtItem = (i: typeof items[0]) => `SKU="${i.sku}" "${i.title}" FBO=${i.fbo} FBS=${i.fbs} итого=${i.fbo + i.fbs}`;

    const prompt = `/no_think Ты — эксперт по складской логистике e-commerce. Проанализируй остатки на складе.

Всего SKU: ${items.length}, суммарно товаров: ${totalQty}, средний остаток: ${Math.round(avgQty)} шт, нулевые остатки: ${zeroStock} SKU

${overstock.length > 0 ? `Избыточные остатки (>3× среднего):\n${overstock.map(fmtItem).join('\n')}` : ''}
${understock.length > 0 ? `\nМалые остатки (<20% среднего):\n${understock.map(fmtItem).join('\n')}` : ''}
${imbalanced.length > 0 ? `\nДисбаланс FBO/FBS (разница >5×):\n${imbalanced.map(fmtItem).join('\n')}` : ''}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения о состоянии склада>",
  "overstock_advice": [{"sku":"<SKU>","title":"<название>","issue":"<проблема>","action":"<действие — снизить закупку/распродать/акция>"}],
  "understock_advice": [{"sku":"<SKU>","title":"<название>","issue":"<проблема>","action":"<действие — срочно заказать X единиц>"}],
  "imbalance_advice": [{"sku":"<SKU>","title":"<название>","issue":"<дисбаланс FBO/FBS>","action":"<перераспределить X единиц из FBO в FBS или наоборот>"}],
  "actions": ["<системное действие 1>","<системное действие 2>","<системное действие 3>"]
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
        summary: `На складе ${items.length} SKU, суммарно ${totalQty} единиц. Обнаружено ${overstock.length} SKU с избыточными остатками и ${zeroStock} SKU с нулевыми остатками.`,
        overstock_advice: overstock.slice(0, 3).map(i => ({ sku: i.sku, title: i.title, issue: `Избыток: ${i.fbo + i.fbs} шт (${Math.round((i.fbo + i.fbs) / avgQty)}× среднего)`, action: 'Рассмотрите акцию или снижение закупок' })),
        understock_advice: understock.slice(0, 3).map(i => ({ sku: i.sku, title: i.title, issue: `Мало: ${i.fbo + i.fbs} шт`, action: 'Пополните запасы' })),
        imbalance_advice: imbalanced.slice(0, 3).map(i => ({ sku: i.sku, title: i.title, issue: `FBO=${i.fbo} FBS=${i.fbs}`, action: 'Перераспределите остатки между FBO и FBS' })),
        actions: ['Настройте автоматические уведомления о низких остатках', 'Проведите анализ оборачиваемости товаров', 'Синхронизируйте склад ежедневно'],
      };
    }

    res.json({
      ...result,
      total_skus: items.length,
      total_qty: totalQty,
      zero_stock_count: zeroStock,
      overstock_count: overstock.length,
      understock_count: understock.length,
      imbalance_count: imbalanced.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

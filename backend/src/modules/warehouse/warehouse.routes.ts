import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { syncWarehouseStocks, getLatestStocks, upsertCatalogItem, getCatalog } from './warehouse.service';

export const warehouseRouter = Router();
warehouseRouter.use(authenticate);

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

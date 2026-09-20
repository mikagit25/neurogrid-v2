import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getUserConnections, getConnectionById } from '../connections/connections.service';
import { createAdapter } from '../../integrations/marketplace/factory';
import { scoreProduct, scoreLabel, ScoredProduct } from './products.service';

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

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

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';

export const searchRouter = Router();
searchRouter.use(authenticate);

// GET /api/search?q=
searchRouter.get('/', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    res.json({ results: [] }); return;
  }
  const userId = req.user!.userId;
  const like = `%${q.toLowerCase()}%`;

  const [products, scenarios, connections, returns] = await Promise.all([
    db.query(
      `SELECT sku AS id, title AS label, platform, 'product' AS type, '/products/' || sku AS href
       FROM user_catalog
       WHERE user_id = $1 AND (LOWER(sku) LIKE $2 OR LOWER(COALESCE(title,'')) LIKE $2)
       LIMIT 5`,
      [userId, like],
    ),
    db.query(
      `SELECT slug AS id, title AS label, NULL AS platform, 'scenario' AS type, '/scenarios' AS href
       FROM scenarios
       WHERE is_active = true AND (LOWER(title) LIKE $1 OR LOWER(slug) LIKE $1)
       LIMIT 5`,
      [like],
    ),
    db.query(
      `SELECT id, display_name AS label, platform, 'connection' AS type, '/connections' AS href
       FROM marketplace_connections
       WHERE user_id = $1 AND (LOWER(COALESCE(display_name,'')) LIKE $2 OR LOWER(platform) LIKE $2)
         AND status = 'active'
       LIMIT 5`,
      [userId, like],
    ),
    db.query(
      `SELECT id::text, COALESCE(title, sku) AS label, platform, 'return' AS type, '/returns' AS href
       FROM return_items
       WHERE user_id = $1 AND (LOWER(sku) LIKE $2 OR LOWER(COALESCE(title,'')) LIKE $2)
       LIMIT 5`,
      [userId, like],
    ),
  ]);

  res.json({
    results: [
      ...products.rows,
      ...scenarios.rows,
      ...connections.rows,
      ...returns.rows,
    ],
  });
});

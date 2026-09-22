import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';

export const watchlistRouter = Router();
watchlistRouter.use(authenticate);

watchlistRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const { rows } = await db.query(`
      SELECT
        w.id, w.sku, w.platform, w.title, w.added_at,
        COALESCE(fr.revenue, 0)::float     AS revenue,
        COALESCE(fr.quantity, 0)::int      AS quantity,
        COALESCE(fr.net_payout, 0)::float  AS net_payout,
        c.purchase_price::float            AS purchase_price,
        CASE
          WHEN c.purchase_price > 0 AND fr.quantity > 0
          THEN ROUND(((fr.net_payout - fr.quantity * c.purchase_price) / NULLIF(fr.revenue,0) * 100)::numeric, 1)::float
          ELSE NULL
        END AS margin_pct,
        s.quantity AS stock_qty
      FROM user_watchlist w
      LEFT JOIN (
        SELECT sku, platform,
          SUM(revenue)::float    AS revenue,
          SUM(quantity)::int     AS quantity,
          SUM(net_payout)::float AS net_payout
        FROM finance_records
        WHERE user_id = $1
          AND period_from >= (CURRENT_DATE - INTERVAL '30 days')
        GROUP BY sku, platform
      ) fr ON fr.sku = w.sku AND fr.platform = w.platform
      LEFT JOIN user_catalog c
        ON c.user_id = $1 AND c.sku = w.sku AND c.platform = w.platform
      LEFT JOIN LATERAL (
        SELECT SUM(quantity)::int AS quantity
        FROM stock_snapshots
        WHERE user_id = $1 AND sku = w.sku AND platform = w.platform
          AND snapped_at = (
            SELECT MAX(snapped_at) FROM stock_snapshots
            WHERE user_id = $1 AND sku = w.sku AND platform = w.platform
          )
      ) s ON true
      WHERE w.user_id = $1
      ORDER BY w.added_at DESC
    `, [userId]);
    res.json({ items: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

watchlistRouter.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { sku, platform, title } = req.body;
  if (!sku || !platform) return void res.status(400).json({ error: 'sku and platform required' });
  try {
    const { rows } = await db.query(`
      INSERT INTO user_watchlist (user_id, sku, platform, title)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, sku, platform) DO UPDATE SET title = EXCLUDED.title
      RETURNING *
    `, [userId, sku, platform, title || null]);
    res.json({ item: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

watchlistRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);
  try {
    await db.query('DELETE FROM user_watchlist WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { callLlm } from '../../integrations/llm/llm.client';
import {
  computeRestockForecasts, getRestockForecasts,
  createPurchaseOrder, getPurchaseOrders, updatePurchaseOrder,
} from './supply.service';

export const supplyRouter = Router();
supplyRouter.use(authenticate);

// ---- Forecasts ----

supplyRouter.get('/forecasts', async (req, res) => {
  const userId = req.user!.userId;
  const { status, platform, sortBy } = req.query;
  res.json(await getRestockForecasts(userId, { status: status as string, platform: platform as string, sortBy: sortBy as string }));
});

supplyRouter.post('/forecasts/compute', async (req, res) => {
  const userId = req.user!.userId;
  try {
    const computed = await computeRestockForecasts(userId);
    res.json({ computed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---- Purchase Orders ----

supplyRouter.get('/orders', async (req, res) => {
  const userId = req.user!.userId;
  res.json(await getPurchaseOrders(userId, req.query.status as string));
});

supplyRouter.post('/orders', async (req, res) => {
  const userId = req.user!.userId;
  const { platform, sku, qty } = req.body;
  if (!platform || !sku || !qty) return res.status(400).json({ error: 'platform, sku, qty required' });
  try {
    const order = await createPurchaseOrder(userId, req.body);
    res.json(order);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

supplyRouter.patch('/orders/:id', async (req, res) => {
  const userId = req.user!.userId;
  await updatePurchaseOrder(userId, req.params.id, req.body);
  res.json({ ok: true });
});

// ─── Suppliers ───────────────────────────────────────────────────────────────

// GET /api/supply/suppliers
supplyRouter.get('/suppliers', async (req, res) => {
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT * FROM suppliers WHERE user_id = $1 AND is_active = true ORDER BY name`,
    [userId],
  );
  res.json({ suppliers: rows });
});

// POST /api/supply/suppliers
supplyRouter.post('/suppliers', async (req, res) => {
  const userId = req.user!.userId;
  const { name, contact_name, email, phone, lead_time_days = 14, min_order_qty, payment_terms, notes } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
  const { rows } = await db.query(
    `INSERT INTO suppliers (user_id, name, contact_name, email, phone, lead_time_days, min_order_qty, payment_terms, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [userId, name.trim().slice(0, 256), contact_name ?? null, email ?? null, phone ?? null,
     Number(lead_time_days), min_order_qty ?? null, payment_terms ?? null, notes ?? null],
  );
  res.json({ supplier: rows[0] });
});

// PUT /api/supply/suppliers/:id
supplyRouter.put('/suppliers/:id', async (req, res) => {
  const userId = req.user!.userId;
  const { name, contact_name, email, phone, lead_time_days, min_order_qty, payment_terms, notes } = req.body;
  const { rows } = await db.query(
    `UPDATE suppliers
     SET name           = COALESCE($3, name),
         contact_name   = COALESCE($4, contact_name),
         email          = COALESCE($5, email),
         phone          = COALESCE($6, phone),
         lead_time_days = COALESCE($7, lead_time_days),
         min_order_qty  = COALESCE($8, min_order_qty),
         payment_terms  = COALESCE($9, payment_terms),
         notes          = COALESCE($10, notes),
         updated_at     = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, userId,
     name ?? null, contact_name ?? null, email ?? null, phone ?? null,
     lead_time_days != null ? Number(lead_time_days) : null,
     min_order_qty != null ? Number(min_order_qty) : null,
     payment_terms ?? null, notes ?? null],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ supplier: rows[0] });
});

// DELETE /api/supply/suppliers/:id
supplyRouter.delete('/suppliers/:id', async (req, res) => {
  const userId = req.user!.userId;
  await db.query(
    `UPDATE suppliers SET is_active = false WHERE id = $1 AND user_id = $2`,
    [req.params.id, userId],
  );
  res.json({ ok: true });
});

// ─── Dead Stock ───────────────────────────────────────────────────────────────

// GET /api/supply/dead-stock?threshold=3&days=30
supplyRouter.get('/dead-stock', async (req, res) => {
  const userId = req.user!.userId;
  const threshold = Number(req.query.threshold ?? 3);  // units sold threshold
  const days = Number(req.query.days ?? 30);

  try {
    const { rows } = await db.query(
      `SELECT
         ss.sku,
         ss.platform,
         ss.warehouse_type,
         COALESCE(uc.title, ss.sku) AS title,
         SUM(ss.quantity)::int AS stock,
         COALESCE(uc.purchase_price, 0)::float AS purchase_price,
         ROUND(COALESCE(SUM(ss.quantity) * uc.purchase_price, 0))::int AS capital_tied_up,
         COALESCE(SUM(fr.quantity), 0)::int AS units_sold,
         EXTRACT(DAY FROM now() - MAX(fr.period_from))::int AS days_since_last_sale
       FROM (
         SELECT DISTINCT ON (user_id, sku, platform) sku, platform, warehouse_type, quantity, user_id
         FROM stock_snapshots
         WHERE user_id = $1
         ORDER BY user_id, sku, platform, snapped_at DESC
       ) ss
       LEFT JOIN user_catalog uc
         ON uc.user_id = $1 AND uc.platform = ss.platform AND uc.sku = ss.sku
       LEFT JOIN finance_records fr
         ON fr.user_id = $1 AND fr.platform = ss.platform AND fr.sku = ss.sku
        AND fr.period_from >= now()::date - $2
       WHERE ss.quantity > 0
       GROUP BY ss.sku, ss.platform, ss.warehouse_type, uc.title, uc.purchase_price
       HAVING COALESCE(SUM(fr.quantity), 0) <= $3
       ORDER BY capital_tied_up DESC, stock DESC`,
      [userId, days, threshold],
    );

    const items = rows.map((r: any) => {
      const stock = Number(r.stock);
      const dsl = r.days_since_last_sale;
      let recommendation: string;
      if (!dsl || dsl > 60) {
        recommendation = 'Мёртвый сток — распродать со скидкой 30-50% или вернуть поставщику';
      } else if (r.units_sold === 0) {
        recommendation = 'Нет продаж — снизить цену на 20-30% или улучшить карточку';
      } else {
        recommendation = 'Медленные продажи — участвовать в акциях или снизить цену';
      }
      return {
        sku: r.sku,
        platform: r.platform,
        warehouse_type: r.warehouse_type,
        title: r.title,
        stock,
        purchase_price: Number(r.purchase_price),
        capital_tied_up: Number(r.capital_tied_up),
        units_sold: Number(r.units_sold),
        days_since_last_sale: dsl ?? null,
        recommendation,
      };
    });

    res.json({ items, total_capital: items.reduce((s: number, i: any) => s + i.capital_tied_up, 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/supply/purchase-order — smart reorder suggestions
// Logic: for each SKU with stock, compute days_of_stock = stock / daily_velocity.
// Flag those below reorder_days threshold. Suggest order qty to cover target_days.
supplyRouter.get('/purchase-order', async (req, res) => {
  const userId = req.user!.userId;
  const reorderDays = parseInt((req.query.reorder_days as string) ?? '14');  // flag if stock < this
  const targetDays  = parseInt((req.query.target_days  as string) ?? '45');  // order to cover this many days
  const velocityDays = 30;
  const dateFrom = new Date(Date.now() - velocityDays * 86400_000).toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `WITH latest_stock AS (
         SELECT DISTINCT ON (sku, platform)
           sku, platform, SUM(quantity) AS stock
         FROM warehouse_stock_snapshots
         WHERE user_id = $1
         GROUP BY sku, platform, snapped_at
         ORDER BY sku, platform, snapped_at DESC
       ),
       velocity AS (
         SELECT sku, platform,
           SUM(quantity)::float / $4   AS daily_velocity,
           SUM(revenue)::numeric       AS revenue_30d
         FROM finance_records
         WHERE user_id = $1 AND date >= $3
         GROUP BY sku, platform
       ),
       catalog AS (
         SELECT sku, platform, title, purchase_price
         FROM user_catalog WHERE user_id = $1
       ),
       suppliers AS (
         SELECT s.id AS supplier_id, s.name AS supplier_name,
                s.lead_time_days
         FROM suppliers s
         WHERE s.user_id = $1
         LIMIT 1
       )
       SELECT
         ls.sku,
         ls.platform,
         COALESCE(c.title, ls.sku)    AS title,
         ls.stock::integer            AS current_stock,
         COALESCE(v.daily_velocity, 0)::numeric AS daily_velocity,
         CASE WHEN COALESCE(v.daily_velocity, 0) > 0
              THEN ROUND((ls.stock / v.daily_velocity)::numeric)
              ELSE NULL END           AS days_of_stock,
         c.purchase_price,
         v.revenue_30d,
         sup.supplier_name,
         sup.lead_time_days,
         CASE WHEN COALESCE(v.daily_velocity, 0) > 0
              THEN GREATEST(0, CEIL($2 * v.daily_velocity - ls.stock))::integer
              ELSE NULL END           AS suggested_qty
       FROM latest_stock ls
       LEFT JOIN velocity v USING (sku, platform)
       LEFT JOIN catalog c USING (sku, platform)
       CROSS JOIN LATERAL (SELECT * FROM suppliers LIMIT 1) sup
       WHERE COALESCE(v.daily_velocity, 0) > 0
       ORDER BY
         CASE WHEN COALESCE(v.daily_velocity, 0) > 0
              THEN ls.stock / v.daily_velocity ELSE 999 END ASC`,
      [userId, targetDays, dateFrom, velocityDays],
    );

    const items = rows.map((r: any) => ({
      sku:           r.sku,
      platform:      r.platform,
      title:         r.title,
      current_stock: Number(r.current_stock),
      daily_velocity: Math.round(Number(r.daily_velocity) * 10) / 10,
      days_of_stock:  r.days_of_stock != null ? Number(r.days_of_stock) : null,
      purchase_price: r.purchase_price != null ? Number(r.purchase_price) : null,
      revenue_30d:   Number(r.revenue_30d ?? 0),
      supplier_name: r.supplier_name ?? null,
      lead_time_days: r.lead_time_days ?? null,
      suggested_qty:  r.suggested_qty != null ? Number(r.suggested_qty) : null,
      total_cost:     r.suggested_qty && r.purchase_price
        ? Math.round(Number(r.suggested_qty) * Number(r.purchase_price))
        : null,
      urgent:  r.days_of_stock != null && Number(r.days_of_stock) <= reorderDays,
    }));

    const totalCost = items.reduce((s: number, i: any) => s + (i.total_cost ?? 0), 0);
    const urgentCount = items.filter((i: any) => i.urgent).length;

    res.json({ items, total_cost: totalCost, urgent_count: urgentCount, reorder_days: reorderDays, target_days: targetDays });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/supply/ai-plan — AI-prioritised purchase plan from restock forecasts
supplyRouter.post('/ai-plan', async (req, res) => {
  const userId = req.user!.userId;
  try {
    const { rows: forecasts } = await db.query(`
      SELECT sku, platform, title, current_stock, avg_daily_sales, days_left, reorder_qty, status
      FROM restock_forecasts
      WHERE user_id = $1
        AND status IN ('critical', 'out_of_stock', 'warning')
      ORDER BY
        CASE status WHEN 'out_of_stock' THEN 0 WHEN 'critical' THEN 1 ELSE 2 END,
        days_left ASC NULLS FIRST
      LIMIT 15
    `, [userId]);

    const { rows: prices } = await db.query(
      `SELECT sku, platform, purchase_price FROM user_catalog WHERE user_id = $1 AND purchase_price IS NOT NULL`,
      [userId],
    );
    const priceMap: Record<string, number> = {};
    prices.forEach((p: any) => { priceMap[`${p.platform}:${p.sku}`] = Number(p.purchase_price); });

    if (!forecasts.length) {
      res.json({
        summary: 'Нет товаров, требующих срочного дозаказа. Все запасы в норме.',
        total_budget_estimate: 0,
        priority_items: [],
        timing_advice: 'Запасы достаточны. Обновляйте прогнозы еженедельно.',
        risks: [],
        actions: ['Обновляйте прогнозы каждую неделю через кнопку «Пересчитать»'],
        forecast_count: 0,
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const lines = forecasts.map((f: any) => {
      const pp = priceMap[`${f.platform}:${f.sku}`];
      const estCost = pp && f.reorder_qty ? Math.round(pp * Number(f.reorder_qty)) : null;
      return `[${f.status.toUpperCase()}] ${f.platform.toUpperCase()} SKU="${f.sku}" "${f.title || ''}" остаток=${f.current_stock} прод/день=${Number(f.avg_daily_sales).toFixed(1)} дней_осталось=${f.days_left ?? '∞'} рек.заказ=${f.reorder_qty ?? '?'}шт${pp ? ` закуп.цена=${pp}₽ сумма≈${estCost ?? '?'}₽` : ''}`;
    }).join('\n');

    const prompt = `/no_think Ты — эксперт по управлению запасами e-commerce. Составь приоритизированный план закупок.

Товары, требующие внимания (${forecasts.length} шт.):
${lines}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения о ситуации с запасами>",
  "total_budget_estimate": <число — оценка общей суммы в рублях или null>,
  "priority_items": [
    {
      "sku": "<SKU>",
      "platform": "<wb|ozon>",
      "recommended_qty": <число>,
      "urgency": "<critical|high|medium>",
      "reasoning": "<1 предложение почему приоритетен>",
      "estimated_cost": <число или null>
    }
  ],
  "timing_advice": "<что заказывать сегодня, что можно подождать>",
  "risks": ["<риск 1>", "<риск 2>"],
  "actions": ["<действие 1>", "<действие 2>", "<действие 3>"]
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 1500);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      const critCount = forecasts.filter((f: any) => f.status === 'critical' || f.status === 'out_of_stock').length;
      result = {
        summary: `Требуют внимания ${forecasts.length} SKU, из них ${critCount} критичных.`,
        total_budget_estimate: null,
        priority_items: forecasts.slice(0, 5).map((f: any) => ({
          sku: f.sku, platform: f.platform,
          recommended_qty: f.reorder_qty ?? null,
          urgency: f.status === 'out_of_stock' || f.status === 'critical' ? 'critical' : 'high',
          reasoning: `Осталось ${f.days_left ?? 0} дней запасов`,
          estimated_cost: null,
        })),
        timing_advice: 'Закажите критичные товары немедленно.',
        risks: ['Потеря продаж при нулевом остатке'],
        actions: ['Оформите заказ для критичных SKU сегодня'],
      };
    }

    res.json({ ...result, forecast_count: forecasts.length, generated_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/supply/purchase-order/export-csv
supplyRouter.get('/purchase-order/export-csv', async (req, res) => {
  const userId = req.user!.userId;
  // Re-use the same logic but return CSV
  const reorderDays = parseInt((req.query.reorder_days as string) ?? '14');
  const targetDays  = parseInt((req.query.target_days  as string) ?? '45');
  const velocityDays = 30;
  const dateFrom = new Date(Date.now() - velocityDays * 86400_000).toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `WITH latest_stock AS (
         SELECT DISTINCT ON (sku, platform)
           sku, platform, SUM(quantity) AS stock
         FROM warehouse_stock_snapshots
         WHERE user_id = $1
         GROUP BY sku, platform, snapped_at
         ORDER BY sku, platform, snapped_at DESC
       ),
       velocity AS (
         SELECT sku, platform,
           SUM(quantity)::float / $4   AS daily_velocity
         FROM finance_records
         WHERE user_id = $1 AND date >= $3
         GROUP BY sku, platform
       ),
       catalog AS (
         SELECT sku, platform, title, purchase_price FROM user_catalog WHERE user_id = $1
       )
       SELECT ls.sku, ls.platform, COALESCE(c.title,ls.sku) AS title,
              ls.stock::integer AS current_stock,
              COALESCE(v.daily_velocity,0)::numeric AS daily_velocity,
              c.purchase_price,
              GREATEST(0, CEIL($2 * COALESCE(v.daily_velocity,0) - ls.stock))::integer AS suggested_qty
       FROM latest_stock ls
       LEFT JOIN velocity v USING (sku, platform)
       LEFT JOIN catalog c USING (sku, platform)
       WHERE COALESCE(v.daily_velocity,0) > 0
       ORDER BY daily_velocity DESC`,
      [userId, targetDays, dateFrom, velocityDays],
    );

    const header = 'platform,sku,title,current_stock,daily_velocity,suggested_qty,purchase_price,total_cost\n';
    const csvRows = rows.map((r: any) => {
      const qty = Number(r.suggested_qty ?? 0);
      const pp  = Number(r.purchase_price ?? 0);
      return `${r.platform},"${(r.sku ?? '').replace(/"/g,'""')}","${(r.title ?? '').replace(/"/g,'""')}",${r.current_stock},${Number(r.daily_velocity).toFixed(1)},${qty},${pp},${pp && qty ? qty * pp : ''}`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="purchase_order.csv"');
    res.send('﻿' + header + csvRows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

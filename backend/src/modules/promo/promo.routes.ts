import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { callLlm } from '../../integrations/llm/llm.client';

export const promoRouter = Router();
promoRouter.use(authenticate);

const promoSchema = z.object({
  name:         z.string().min(1).max(200),
  platform:     z.string().max(20).optional().nullable(),
  skus:         z.array(z.string()).default([]),
  starts_at:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_at:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discount_pct: z.number().min(0).max(100).optional().nullable(),
  promo_type:   z.enum(['sale', 'flash', 'wb_promo', 'ozon_promo', 'custom']).default('custom'),
  notes:        z.string().max(1000).optional().nullable(),
});

// GET /api/promo — list events for user
promoRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const { rows } = await db.query(
      `SELECT id, name, platform, skus, starts_at, ends_at, discount_pct, promo_type, notes, created_at
       FROM promo_events
       WHERE user_id = $1
       ORDER BY starts_at DESC`,
      [userId],
    );
    res.json({ events: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/promo — create event
promoRouter.post('/', async (req: Request, res: Response) => {
  const parsed = promoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }
  const { name, platform, skus, starts_at, ends_at, discount_pct, promo_type, notes } = parsed.data;
  const userId = req.user!.userId;
  try {
    const { rows } = await db.query(
      `INSERT INTO promo_events (user_id, name, platform, skus, starts_at, ends_at, discount_pct, promo_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [userId, name, platform ?? null, skus, starts_at, ends_at, discount_pct ?? null, promo_type, notes ?? null],
    );
    res.status(201).json({ event: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/promo/:id — update
promoRouter.put('/:id', async (req: Request, res: Response) => {
  const parsed = promoSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.userId;
  const id = parseInt(req.params.id);
  const d = parsed.data;
  try {
    const { rows } = await db.query(
      `UPDATE promo_events SET
         name         = COALESCE($3, name),
         platform     = COALESCE($4, platform),
         skus         = COALESCE($5, skus),
         starts_at    = COALESCE($6, starts_at),
         ends_at      = COALESCE($7, ends_at),
         discount_pct = COALESCE($8, discount_pct),
         promo_type   = COALESCE($9, promo_type),
         notes        = COALESCE($10, notes)
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, d.name ?? null, d.platform ?? null, d.skus ?? null,
       d.starts_at ?? null, d.ends_at ?? null, d.discount_pct ?? null,
       d.promo_type ?? null, d.notes ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ event: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/promo/:id
promoRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id);
  try {
    await db.query(`DELETE FROM promo_events WHERE id = $1 AND user_id = $2`, [id, userId]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/promo/:id/compare — before vs during sales comparison
promoRouter.get('/:id/compare', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id);
  try {
    const { rows: evRows } = await db.query(
      `SELECT * FROM promo_events WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!evRows[0]) { res.status(404).json({ error: 'Not found' }); return; }

    const ev = evRows[0];
    const startDate = new Date(ev.starts_at);
    const endDate   = new Date(ev.ends_at);
    const promoDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400_000) + 1);

    // "before" window = same number of days before the promo
    const beforeEnd   = new Date(startDate.getTime() - 86400_000);
    const beforeStart = new Date(beforeEnd.getTime() - (promoDays - 1) * 86400_000);

    const skuFilter = ev.skus?.length
      ? `AND fr.sku = ANY($5::text[])`
      : '';
    const platformFilter = ev.platform ? `AND fr.platform = $6` : '';

    // build param list dynamically
    const baseParams: any[] = [
      userId,
      beforeStart.toISOString().slice(0, 10),
      beforeEnd.toISOString().slice(0, 10),
      ev.starts_at,
      // $5 ends_at used below
    ];

    const { rows: beforeRows } = await db.query(
      `SELECT
         COALESCE(SUM(fr.revenue), 0)::numeric    AS revenue,
         COALESCE(SUM(fr.quantity), 0)::integer   AS quantity,
         COALESCE(AVG(fr.price), 0)::numeric      AS avg_price,
         COUNT(DISTINCT fr.sku)::integer          AS sku_count
       FROM finance_records fr
       WHERE fr.user_id = $1
         AND fr.date >= $2 AND fr.date <= $3
         ${ev.platform ? `AND fr.platform = '${ev.platform}'` : ''}
         ${ev.skus?.length ? `AND fr.sku = ANY(ARRAY[${(ev.skus as string[]).map((s: string) => `'${s.replace(/'/g,"''")}' `).join(',')}]::text[])` : ''}`,
      [userId, beforeStart.toISOString().slice(0, 10), beforeEnd.toISOString().slice(0, 10)],
    );

    const { rows: duringRows } = await db.query(
      `SELECT
         COALESCE(SUM(fr.revenue), 0)::numeric    AS revenue,
         COALESCE(SUM(fr.quantity), 0)::integer   AS quantity,
         COALESCE(AVG(fr.price), 0)::numeric      AS avg_price,
         COUNT(DISTINCT fr.sku)::integer          AS sku_count
       FROM finance_records fr
       WHERE fr.user_id = $1
         AND fr.date >= $2 AND fr.date <= $3
         ${ev.platform ? `AND fr.platform = '${ev.platform}'` : ''}
         ${ev.skus?.length ? `AND fr.sku = ANY(ARRAY[${(ev.skus as string[]).map((s: string) => `'${s.replace(/'/g,"''")}' `).join(',')}]::text[])` : ''}`,
      [userId, ev.starts_at, ev.ends_at],
    );

    // daily breakdown for chart
    const { rows: dailyRows } = await db.query(
      `SELECT date::text, SUM(revenue)::numeric AS revenue, SUM(quantity)::integer AS quantity
       FROM finance_records
       WHERE user_id = $1 AND date >= $2 AND date <= $3
         ${ev.platform ? `AND platform = '${ev.platform}'` : ''}
       GROUP BY date ORDER BY date`,
      [userId, beforeStart.toISOString().slice(0, 10), ev.ends_at],
    );

    const before = beforeRows[0];
    const during = duringRows[0];

    res.json({
      event: ev,
      window_days: promoDays,
      before: {
        from: beforeStart.toISOString().slice(0, 10),
        to:   beforeEnd.toISOString().slice(0, 10),
        revenue:   Number(before.revenue),
        quantity:  Number(before.quantity),
        avg_price: Number(before.avg_price),
        sku_count: Number(before.sku_count),
      },
      during: {
        from: ev.starts_at,
        to:   ev.ends_at,
        revenue:   Number(during.revenue),
        quantity:  Number(during.quantity),
        avg_price: Number(during.avg_price),
        sku_count: Number(during.sku_count),
      },
      revenue_lift_pct: before.revenue > 0
        ? Math.round(((during.revenue - before.revenue) / before.revenue) * 100)
        : null,
      quantity_lift_pct: before.quantity > 0
        ? Math.round(((during.quantity - before.quantity) / before.quantity) * 100)
        : null,
      daily: dailyRows,
      promo_start: ev.starts_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/promo/:id/ai-advice — AI pre-analysis before running a promo
promoRouter.post('/:id/ai-advice', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id);

  try {
    const { rows: evRows } = await db.query(
      `SELECT * FROM promo_events WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!evRows[0]) { res.status(404).json({ error: 'Not found' }); return; }
    const ev = evRows[0];

    const platformLabel =
      ev.platform === 'wb' ? 'Wildberries' :
      ev.platform === 'ozon' ? 'Ozon' :
      ev.platform === 'ym' ? 'Яндекс Маркет' : ev.platform ?? 'маркетплейс';

    // Fetch SKU-level margins and recent velocity (last 60 days)
    const skuFilter = Array.isArray(ev.skus) && ev.skus.length > 0
      ? `AND sku = ANY($3::text[])`
      : '';
    const queryParams: any[] = [userId, ev.platform ?? null];
    if (Array.isArray(ev.skus) && ev.skus.length > 0) queryParams.push(ev.skus);

    const { rows: skuRows } = await db.query(`
      SELECT
        sku,
        MIN(title) AS title,
        SUM(revenue)::float         AS revenue,
        SUM(quantity)::int          AS qty,
        AVG(net_payout / NULLIF(quantity, 0))::float AS avg_net_per_unit,
        AVG(revenue / NULLIF(quantity, 0))::float    AS avg_price
      FROM finance_records
      WHERE user_id = $1
        AND ($2::text IS NULL OR platform = $2)
        AND period_from >= (CURRENT_DATE - INTERVAL '60 days')
        ${skuFilter}
      GROUP BY sku
      ORDER BY SUM(revenue) DESC
      LIMIT 10
    `, queryParams);

    const promoDays = (() => {
      const s = new Date(ev.starts_at);
      const e = new Date(ev.ends_at);
      return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
    })();

    const skuSummary = skuRows.length
      ? skuRows.map((s: any) => {
          const netMarginPct = s.avg_price > 0 && s.avg_net_per_unit != null
            ? Math.round((s.avg_net_per_unit / s.avg_price) * 100)
            : null;
          return `SKU ${s.sku} "${s.title || ''}" — выручка ${Math.round(s.revenue)} ₽, ${s.qty} шт/60 дн, ср.цена ${Math.round(s.avg_price ?? 0)} ₽, маржа ${netMarginPct != null ? netMarginPct + '%' : 'нет данных'}`;
        }).join('\n')
      : 'Нет данных о продажах по этим SKU за последние 60 дней';

    const prompt = `/no_think Ты — аналитик e-commerce. Оцени целесообразность проведения промоакции.

Промоакция: "${ev.name}"
Платформа: ${platformLabel}
Период: ${ev.starts_at} — ${ev.ends_at} (${promoDays} дн.)
Скидка: ${ev.discount_pct != null ? ev.discount_pct + '%' : 'не указана'}
Тип: ${ev.promo_type}
${ev.notes ? `Заметки: ${ev.notes}` : ''}

Данные о товарах (последние 60 дней):
${skuSummary}

Дай оценку в JSON:
{
  "verdict": "recommend|caution|not_recommend",
  "verdict_label": "<Рекомендуем|Осторожно|Не рекомендуем>",
  "reasoning": "<2-3 предложения почему>",
  "expected_lift_pct": <число или null — ожидаемый прирост продаж в %>,
  "suggested_discount_pct": <число или null — оптимальная скидка>,
  "risks": ["<риск 1>", "<риск 2>"],
  "actions": ["<действие 1 перед промо>", "<действие 2 во время>"]
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 900);

    let advice: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      advice = match ? JSON.parse(match[0]) : null;
    } catch { advice = null; }

    if (!advice) {
      advice = {
        verdict: 'caution',
        verdict_label: 'Осторожно',
        reasoning: 'Не удалось получить AI-анализ. Проверьте данные о продажах по данным SKU.',
        expected_lift_pct: null,
        suggested_discount_pct: ev.discount_pct ?? null,
        risks: ['Недостаточно данных для точного прогноза'],
        actions: ['Убедитесь, что остатки достаточны для промо-периода'],
      };
    }

    res.json({ ...advice, event_id: id, generated_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

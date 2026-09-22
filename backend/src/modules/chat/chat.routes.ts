import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { callLlm, type LlmMessage } from '../../integrations/llm/llm.client';

export const chatRouter = Router();
chatRouter.use(authenticate);

const MAX_HISTORY = 20;

async function buildSystemPrompt(userId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  const [subRow, connRows, productRow, alertRow, financeRow, runsRow] = await Promise.all([
    db.query(`SELECT plan FROM subscriptions WHERE user_id = $1`, [userId]),
    db.query(`SELECT platform, display_name FROM marketplace_connections WHERE user_id = $1 AND status = 'active'`, [userId]),
    db.query(
      `SELECT COUNT(*)::int AS total,
              ROUND(AVG(CASE WHEN listing_score IS NOT NULL THEN listing_score ELSE 50 END))::int AS avg_score
       FROM (
         SELECT DISTINCT ON (sku, platform) sku, platform,
           (SELECT score FROM product_scores ps WHERE ps.connection_id = mc.id AND ps.sku = p.sku LIMIT 1) AS listing_score
         FROM (
           SELECT DISTINCT sku, connection_id FROM stock_snapshots WHERE user_id = $1 AND snapped_at > now() - interval '7 days'
         ) p
         JOIN marketplace_connections mc ON mc.id = p.connection_id
       ) t`,
      [userId],
    ).catch(() => ({ rows: [{ total: 0, avg_score: 0 }] })),
    db.query(
      `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId],
    ),
    db.query(
      `SELECT COALESCE(SUM(revenue),0)::int AS revenue_7d,
              COALESCE(SUM(net_payout),0)::int AS payout_7d
       FROM finance_records WHERE user_id = $1 AND period_from >= now()::date - 7`,
      [userId],
    ).catch(() => ({ rows: [{ revenue_7d: 0, payout_7d: 0 }] })),
    db.query(
      `SELECT COUNT(*)::int AS total FROM scenario_runs
       WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [userId],
    ),
  ]);

  const plan = subRow.rows[0]?.plan ?? 'free';
  const connections = connRows.rows.map((c: any) => `${c.platform.toUpperCase()} (${c.display_name})`).join(', ') || 'нет подключений';
  const products = productRow.rows[0] ?? { total: 0, avg_score: 0 };
  const unread = alertRow.rows[0]?.unread ?? 0;
  const finance = financeRow.rows[0] ?? { revenue_7d: 0, payout_7d: 0 };
  const runsThisMonth = runsRow.rows[0]?.total ?? 0;

  return `Ты — NeuroGrid AI, персональный бизнес-ассистент для продавца на маркетплейсах WB/Ozon/Яндекс Маркет.
Отвечай кратко, конкретно и на русском языке. Используй Markdown (заголовки, списки, жирный текст).

Контекст аккаунта пользователя (сегодня ${today}):
- Тариф: ${plan}
- Подключенные магазины: ${connections}
- Товаров в каталоге: ${products.total} (средний балл ${products.avg_score}/100)
- Непрочитанных уведомлений: ${unread}
- Выручка за 7 дней: ${finance.revenue_7d.toLocaleString('ru-RU')} ₽ (выплата: ${finance.payout_7d.toLocaleString('ru-RU')} ₽)
- AI-запусков в этом месяце: ${runsThisMonth}

Ты можешь давать советы по:
- ценообразованию и конкурентной стратегии
- оптимизации карточек товаров (SEO, заголовки, описания)
- анализу финансов и рентабельности
- управлению остатками и поставками
- работе с отзывами и рейтингом
- использованию функций NeuroGrid

Если не знаешь точных данных — честно скажи об этом и предложи воспользоваться конкретным разделом платформы.`;
}

// GET /api/chat/history
chatRouter.get('/history', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT id, role, content, created_at FROM chat_messages
     WHERE user_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [req.user!.userId, MAX_HISTORY * 2],
  );
  res.json({ messages: rows });
});

// POST /api/chat/message
chatRouter.post('/message', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { content } = req.body;
  if (!content?.trim()) {
    res.status(400).json({ error: 'content required' }); return;
  }
  const text = String(content).slice(0, 2000);

  // Save user message
  await db.query(
    `INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'user', $2)`,
    [userId, text],
  );

  // Build message history for context
  const { rows: history } = await db.query(
    `SELECT role, content FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, MAX_HISTORY],
  );

  const messages: LlmMessage[] = [
    { role: 'system', content: await buildSystemPrompt(userId) },
    ...history.reverse().map((r: any) => ({ role: r.role as 'user' | 'assistant', content: r.content })),
  ];

  try {
    const { text: reply } = await callLlm(messages, undefined, 1024);
    await db.query(
      `INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'assistant', $2)`,
      [userId, reply],
    );
    res.json({ reply });
  } catch (err: any) {
    // Remove the user message we just inserted so history stays clean on retry
    await db.query(
      `DELETE FROM chat_messages WHERE user_id = $1 AND role = 'user' AND content = $2 AND created_at > now() - interval '5 seconds'`,
      [userId, text],
    );
    res.status(500).json({ error: 'Ошибка AI: ' + (err.message ?? 'unknown') });
  }
});

// DELETE /api/chat/history
chatRouter.delete('/history', async (req: Request, res: Response) => {
  await db.query(`DELETE FROM chat_messages WHERE user_id = $1`, [req.user!.userId]);
  res.json({ ok: true });
});

// POST /api/chat/briefing — daily AI business briefing for empty chat state
chatRouter.post('/briefing', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const [todayRow, weekRow, topSkuRow, alertRow, criticalRow] = await Promise.all([
      db.query(`
        SELECT COALESCE(SUM(revenue),0)::int AS revenue, COALESCE(SUM(quantity),0)::int AS orders,
               COALESCE(SUM(net_payout),0)::int AS net_payout
        FROM finance_records WHERE user_id = $1 AND period_from = CURRENT_DATE - 1
      `, [userId]),
      db.query(`
        SELECT COALESCE(SUM(revenue),0)::int AS revenue, COALESCE(SUM(quantity),0)::int AS orders
        FROM finance_records WHERE user_id = $1 AND period_from >= CURRENT_DATE - 7
      `, [userId]),
      db.query(`
        SELECT sku, MIN(title) AS title, SUM(revenue)::int AS revenue
        FROM finance_records WHERE user_id = $1 AND period_from >= CURRENT_DATE - 7
        GROUP BY sku ORDER BY SUM(revenue) DESC LIMIT 1
      `, [userId]),
      db.query(`
        SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = false
      `, [userId]),
      db.query(`
        SELECT COUNT(*)::int AS cnt FROM restock_forecasts
        WHERE user_id = $1 AND status IN ('critical','out_of_stock')
      `, [userId]).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    const yesterday  = todayRow.rows[0];
    const week       = weekRow.rows[0];
    const topSku     = topSkuRow.rows[0];
    const unread     = alertRow.rows[0]?.unread ?? 0;
    const critStock  = Number(criticalRow.rows[0]?.cnt ?? 0);
    const today      = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

    const hasData = week.revenue > 0 || week.orders > 0;

    const kpis = {
      yesterday_revenue: yesterday.revenue,
      yesterday_orders:  yesterday.orders,
      week_revenue:      week.revenue,
      week_orders:       week.orders,
      unread_alerts:     unread,
      critical_stock:    critStock,
      top_sku:           topSku?.title ?? topSku?.sku ?? null,
      top_sku_revenue:   topSku?.revenue ?? null,
    };

    if (!hasData) {
      res.json({
        briefing: `**Добрый день!** Пока нет данных о продажах за последние 7 дней.\n\nСинхронизируйте магазины в разделе **Подключения**, чтобы начать отслеживать продажи.`,
        kpis,
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const prompt = `/no_think Ты — NeuroGrid AI. Составь краткий утренний брифинг для продавца на маркетплейсах.

Дата: ${today}
Вчера: выручка=${yesterday.revenue}₽, заказов=${yesterday.orders}
Неделя (7 дн.): выручка=${week.revenue}₽, заказов=${week.orders}
Лидер недели: ${topSku ? `"${topSku.title || topSku.sku}" — ${topSku.revenue}₽` : 'нет данных'}
Непрочитанных уведомлений: ${unread}
Критичные остатки: ${critStock} SKU

Напиши брифинг в 4-6 коротких строк на русском языке в формате Markdown.
Начни с приветствия и даты. Выдели ключевые цифры жирным.
Закончи 1-2 конкретными советами на сегодня. Тон — деловой и позитивный.`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 600);

    res.json({ briefing: text.trim(), kpis, generated_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

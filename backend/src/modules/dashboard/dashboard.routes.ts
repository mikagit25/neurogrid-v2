import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  href: string;
  value?: string;
}

// GET /api/dashboard/recommendations
dashboardRouter.get('/recommendations', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const [
      alertRow,
      reviewRow,
      stockRow,
      goalRow,
      adRow,
      competitorRow,
    ] = await Promise.all([
      // Unread alert events
      db.query(
        `SELECT COUNT(*)::int AS count FROM alert_events WHERE user_id = $1 AND is_read = false`,
        [userId],
      ).catch(() => ({ rows: [{ count: 0 }] })),

      // Unanswered reviews
      db.query(
        `SELECT COUNT(*)::int AS count FROM product_reviews WHERE user_id = $1 AND is_answered = false`,
        [userId],
      ).catch(() => ({ rows: [{ count: 0 }] })),

      // Critical / out-of-stock forecasts
      db.query(
        `SELECT COUNT(*)::int AS count FROM restock_forecasts
         WHERE user_id = $1 AND status IN ('critical','out_of_stock')`,
        [userId],
      ).catch(() => ({ rows: [{ count: 0 }] })),

      // Current month goal progress
      db.query(
        `SELECT fg.revenue_goal,
                COALESCE(SUM(fr.revenue), 0)::float AS actual_revenue,
                EXTRACT(DAY FROM CURRENT_DATE)::int  AS days_elapsed,
                EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'))::int AS days_in_month
         FROM finance_goals fg
         LEFT JOIN finance_records fr
           ON fr.user_id = fg.user_id
           AND TO_CHAR(fr.period_from, 'YYYY-MM') = fg.year_month
         WHERE fg.user_id = $1 AND fg.year_month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
         GROUP BY fg.revenue_goal`,
        [userId],
      ).catch(() => ({ rows: [] })),

      // Ad campaigns with high DRR (> 25%)
      db.query(
        `SELECT COUNT(*)::int AS count, SUM(spend)::float AS total_spend
         FROM ad_campaigns
         WHERE user_id = $1 AND status = 'running'
           AND drr IS NOT NULL AND drr > 25 AND spend > 0`,
        [userId],
      ).catch(() => ({ rows: [{ count: 0, total_spend: 0 }] })),

      // Competitor price changes in last 48h
      db.query(
        `SELECT COUNT(DISTINCT cs.id)::int AS count
         FROM competitor_skus cs
         JOIN competitor_price_history ph ON ph.competitor_id = cs.id
         WHERE cs.user_id = $1
           AND ph.scraped_at >= NOW() - INTERVAL '48 hours'`,
        [userId],
      ).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const items: Recommendation[] = [];

    // --- Stock alerts ---
    const criticalStock = Number(stockRow.rows[0]?.count ?? 0);
    if (criticalStock > 0) {
      items.push({
        priority: 'high',
        category: 'Склад',
        title: `${criticalStock} ${criticalStock === 1 ? 'товар' : criticalStock < 5 ? 'товара' : 'товаров'} на исходе`,
        description: 'Срочно пополни запасы — риск out-of-stock и потеря позиций',
        href: '/supply',
        value: String(criticalStock),
      });
    }

    // --- Goal pace ---
    if (goalRow.rows.length > 0) {
      const { revenue_goal, actual_revenue, days_elapsed, days_in_month } = goalRow.rows[0];
      const goal = Number(revenue_goal ?? 0);
      const actual = Number(actual_revenue ?? 0);
      const elapsed = Number(days_elapsed ?? 1);
      const total = Number(days_in_month ?? 30);
      if (goal > 0 && elapsed > 0) {
        const elapsedPct = elapsed / total;
        const revPct = actual / goal;
        if (elapsedPct >= 0.5 && revPct < elapsedPct * 0.85) {
          const projected = Math.round((actual / elapsed) * total);
          items.push({
            priority: 'high',
            category: 'Цели',
            title: 'Отстаёшь от цели месяца',
            description: `${Math.round(revPct * 100)}% выручки при ${Math.round(elapsedPct * 100)}% прошедшего месяца. Прогноз: ${projected.toLocaleString('ru-RU')} ₽`,
            href: '/pnl?tab=goals',
            value: `${Math.round(revPct * 100)}%`,
          });
        }
      }
    }

    // --- Unread alerts ---
    const unreadAlerts = Number(alertRow.rows[0]?.count ?? 0);
    if (unreadAlerts > 0) {
      items.push({
        priority: unreadAlerts >= 5 ? 'high' : 'medium',
        category: 'Алерты',
        title: `${unreadAlerts} непрочитанных алерта`,
        description: 'Просмотри уведомления — могут быть важные изменения',
        href: '/alerts',
        value: String(unreadAlerts),
      });
    }

    // --- Unanswered reviews ---
    const unanswered = Number(reviewRow.rows[0]?.count ?? 0);
    if (unanswered > 0) {
      items.push({
        priority: unanswered >= 10 ? 'high' : 'medium',
        category: 'Отзывы',
        title: `${unanswered} ${unanswered === 1 ? 'отзыв' : unanswered < 5 ? 'отзыва' : 'отзывов'} без ответа`,
        description: 'Отвечай на отзывы — это повышает рейтинг магазина',
        href: '/reviews',
        value: String(unanswered),
      });
    }

    // --- High-DRR ad campaigns ---
    const highDrrCount = Number(adRow.rows[0]?.count ?? 0);
    if (highDrrCount > 0) {
      const spend = Number(adRow.rows[0]?.total_spend ?? 0);
      items.push({
        priority: 'medium',
        category: 'Реклама',
        title: `${highDrrCount} кампании с ДРР > 25%`,
        description: `Расход ${Math.round(spend).toLocaleString('ru-RU')} ₽ — оптимизируй ставки или приостанови`,
        href: '/advertising',
        value: String(highDrrCount),
      });
    }

    // --- Competitor price changes ---
    const compChanges = Number(competitorRow.rows[0]?.count ?? 0);
    if (compChanges > 0) {
      items.push({
        priority: 'medium',
        category: 'Конкуренты',
        title: `${compChanges} конкурента изменили цены`,
        description: 'Свежие данные за последние 48 ч — проверь ценовой мониторинг',
        href: '/competitors',
        value: String(compChanges),
      });
    }

    // Sort: high first, then medium, then low
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => order[a.priority] - order[b.priority]);

    res.json({ items: items.slice(0, 5) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

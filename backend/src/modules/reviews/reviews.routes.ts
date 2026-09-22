import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { syncReviews, generateReply, approveReply, getReplySettings, saveReplySettings } from './reviews.service';
import { callLlm } from '../../integrations/llm/llm.client';

export const reviewsRouter = Router();
reviewsRouter.use(authenticate);

// ---- List reviews ----

reviewsRouter.get('/', async (req, res) => {
  const userId = req.user!.userId;
  const { platform, sku, rating, answered, limit = 50, offset = 0 } = req.query;

  let sql = `SELECT * FROM product_reviews WHERE user_id = $1`;
  const params: any[] = [userId];
  let i = 2;

  if (platform) { sql += ` AND platform = $${i++}`; params.push(platform); }
  if (sku) { sql += ` AND sku = $${i++}`; params.push(sku); }
  if (rating) { sql += ` AND rating = $${i++}`; params.push(Number(rating)); }
  if (answered === 'false') { sql += ` AND is_answered = false`; }
  if (answered === 'true') { sql += ` AND is_answered = true`; }

  sql += ` ORDER BY review_date DESC NULLS LAST, synced_at DESC LIMIT $${i++} OFFSET $${i}`;
  params.push(Number(limit), Number(offset));

  const { rows } = await db.query(sql, params);
  res.json(rows);
});

// ---- Stats ----

reviewsRouter.get('/stats', async (req, res) => {
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE is_answered = false) AS unanswered,
       COUNT(*) AS total,
       AVG(rating)::numeric(3,2) AS avg_rating,
       COUNT(*) FILTER (WHERE rating <= 2) AS negative,
       COUNT(*) FILTER (WHERE reply_approved = true) AS replied
     FROM product_reviews WHERE user_id = $1`,
    [userId],
  );
  res.json(rows[0]);
});

// ---- Sync ----

reviewsRouter.post('/sync', async (req, res) => {
  const userId = req.user!.userId;
  try {
    const count = await syncReviews(userId);
    res.json({ synced: count });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---- AI Reply ----

reviewsRouter.post('/:id/generate-reply', async (req, res) => {
  const userId = req.user!.userId;
  try {
    const reply = await generateReply(userId, req.params.id);
    res.json({ reply });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

reviewsRouter.post('/:id/approve-reply', async (req, res) => {
  const userId = req.user!.userId;
  await approveReply(userId, req.params.id, req.body.reply_text);
  res.json({ ok: true });
});

// ---- Manual reply text update ----

reviewsRouter.patch('/:id', async (req, res) => {
  const userId = req.user!.userId;
  const { ai_reply, is_answered } = req.body;
  const fields: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (ai_reply !== undefined) { fields.push(`ai_reply = $${i++}`); vals.push(ai_reply); }
  if (is_answered !== undefined) { fields.push(`is_answered = $${i++}`); vals.push(is_answered); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id, userId);
  await db.query(
    `UPDATE product_reviews SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
    vals,
  );
  res.json({ ok: true });
});

// ---- Settings ----

// POST /api/reviews/bulk-reply?limit=10 — AI bulk reply to unanswered reviews
reviewsRouter.post('/bulk-reply', async (req, res) => {
  const userId = req.user!.userId;
  const limit = Math.min(Number(req.query.limit) || 10, 30);

  const { rows: reviews } = await db.query(
    `SELECT id, platform, sku, rating, text, pros, cons
     FROM product_reviews
     WHERE user_id = $1 AND is_answered = false AND ai_reply IS NULL
       AND (text IS NOT NULL OR pros IS NOT NULL OR cons IS NOT NULL)
     ORDER BY rating ASC, review_date DESC
     LIMIT $2`,
    [userId, limit],
  );

  if (!reviews.length) {
    res.json({ processed: 0, message: 'Нет отзывов для обработки' }); return;
  }

  let processed = 0;
  const results: Array<{ id: string; reply: string | null; ok: boolean }> = [];

  for (const review of reviews) {
    try {
      const reviewText = [
        review.text && `Текст: ${review.text}`,
        review.pros && `Плюсы: ${review.pros}`,
        review.cons && `Минусы: ${review.cons}`,
      ].filter(Boolean).join('\n');

      const { text: reply } = await callLlm([
        {
          role: 'system',
          content: 'Ты менеджер маркетплейса. Пиши профессиональные, вежливые ответы на отзывы покупателей на русском языке. Ответ — 2-3 предложения. Только текст ответа.',
        },
        {
          role: 'user',
          content: `Отзыв (${review.rating ?? '?'}★) на ${review.platform.toUpperCase()}, SKU ${review.sku}:\n${reviewText}\n\nНапиши ответ продавца.`,
        },
      ], 'claude-haiku-4-5-20251001', 300);

      await db.query(
        `UPDATE product_reviews SET ai_reply = $2 WHERE id = $1 AND user_id = $3`,
        [review.id, reply.trim(), userId],
      );
      results.push({ id: review.id, reply: reply.trim(), ok: true });
      processed++;
    } catch (err: any) {
      console.error(`[reviews] bulk-reply error review ${review.id}:`, err.message);
      results.push({ id: review.id, reply: null, ok: false });
    }
  }

  res.json({ processed, total: reviews.length, results });
});

reviewsRouter.get('/settings', async (req, res) => {
  const userId = req.user!.userId;
  res.json(await getReplySettings(userId));
});

reviewsRouter.put('/settings', async (req, res) => {
  const userId = req.user!.userId;
  await saveReplySettings(userId, req.body);
  res.json({ ok: true });
});

// GET /api/reviews/analytics — rating distribution, weekly trend, response rate, top negative keywords
reviewsRouter.get('/analytics', async (req, res) => {
  const userId = req.user!.userId;
  try {
    // 1. Rating distribution
    const { rows: distRows } = await db.query(
      `SELECT rating, COUNT(*)::int AS count
       FROM product_reviews WHERE user_id = $1 AND rating IS NOT NULL
       GROUP BY rating ORDER BY rating`,
      [userId],
    );
    const distribution = [1, 2, 3, 4, 5].map(r => ({
      rating: r,
      count: distRows.find((d: any) => d.rating === r)?.count ?? 0,
    }));

    // 2. Weekly trend — last 12 weeks
    const { rows: weekRows } = await db.query(
      `SELECT
         date_trunc('week', review_date)::date AS week,
         COUNT(*)::int                          AS total,
         ROUND(AVG(rating)::numeric, 2)         AS avg_rating
       FROM product_reviews
       WHERE user_id = $1
         AND review_date >= (CURRENT_DATE - INTERVAL '84 days')
         AND review_date IS NOT NULL
       GROUP BY week
       ORDER BY week`,
      [userId],
    );

    // 3. Response rate
    const { rows: rateRows } = await db.query(
      `SELECT
         COUNT(*)::int                                   AS total,
         COUNT(*) FILTER (WHERE is_answered)::int        AS answered,
         COUNT(*) FILTER (WHERE reply_approved)::int     AS published
       FROM product_reviews WHERE user_id = $1`,
      [userId],
    );
    const rate = rateRows[0];

    // 4. Top negative keywords (1-2 star reviews, simple word frequency)
    const { rows: negRows } = await db.query(
      `SELECT LOWER(text) AS body FROM product_reviews
       WHERE user_id = $1 AND rating <= 2 AND text IS NOT NULL AND LENGTH(text) > 5
       LIMIT 200`,
      [userId],
    );
    const stopWords = new Set(['не', 'и', 'в', 'на', 'но', 'с', 'по', 'за', 'что', 'как', 'это', 'то', 'а', 'у', 'о', 'от', 'из', 'к', 'для', 'со', 'же', 'бы', 'ли', 'мне', 'да', 'нет', 'был', 'была', 'были', 'мой', 'тот', 'тем', 'так', 'при', 'его', 'ещё', 'все', 'очень', 'все', 'уже', 'если', 'или', 'чем', 'эта', 'ты', 'хотя', 'когда', 'потому', 'вы', 'вот', 'раз', 'он', 'она', 'они', 'свой', 'эти', 'нет', 'их', 'мне', 'нас', 'него', 'нее', 'ему', 'моя', 'даже', 'через', 'между']);
    const wordFreq: Record<string, number> = {};
    for (const { body } of negRows) {
      const words = (body as string).match(/[а-яё]{4,}/g) ?? [];
      for (const w of words) {
        if (!stopWords.has(w)) wordFreq[w] = (wordFreq[w] ?? 0) + 1;
      }
    }
    const topKeywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));

    res.json({
      distribution,
      weekly_trend: weekRows,
      response_rate: {
        total:     Number(rate.total),
        answered:  Number(rate.answered),
        published: Number(rate.published),
        pct:       rate.total > 0 ? Math.round(Number(rate.answered) / Number(rate.total) * 100) : 0,
      },
      top_negative_keywords: topKeywords,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import {
  checkKeywordPositions,
  computeListingScores,
  checkCompetitorPrices,
  computeListingScore,
} from './seo.service';

export const seoRouter = Router();
seoRouter.use(authenticate);

// ---- Tracked Keywords ----

seoRouter.get('/keywords', async (req, res) => {
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT tk.*,
       (SELECT row_to_json(kp.*) FROM keyword_positions kp
        WHERE kp.keyword_id = tk.id ORDER BY kp.checked_at DESC LIMIT 1) AS last_position
     FROM tracked_keywords tk WHERE tk.user_id = $1 ORDER BY tk.created_at DESC`,
    [userId],
  );
  res.json(rows);
});

seoRouter.post('/keywords', async (req, res) => {
  const userId = req.user!.userId;
  const { platform, sku, keyword } = req.body;
  if (!platform || !sku || !keyword) {
    return res.status(400).json({ error: 'platform, sku, keyword required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO tracked_keywords (user_id, platform, sku, keyword)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, platform, sku, keyword) DO UPDATE SET is_active = true
       RETURNING *`,
      [userId, platform, sku, keyword],
    );
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

seoRouter.delete('/keywords/:id', async (req, res) => {
  const userId = req.user!.userId;
  await db.query(
    `UPDATE tracked_keywords SET is_active = false WHERE id = $1 AND user_id = $2`,
    [req.params.id, userId],
  );
  res.json({ ok: true });
});

seoRouter.post('/keywords/check', async (req, res) => {
  const userId = req.user!.userId;
  try {
    const checked = await checkKeywordPositions(userId);
    res.json({ checked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Keyword Position History ----

seoRouter.get('/keywords/:id/history', async (req, res) => {
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT kp.* FROM keyword_positions kp
     JOIN tracked_keywords tk ON tk.id = kp.keyword_id
     WHERE kp.keyword_id = $1 AND tk.user_id = $2
     ORDER BY kp.checked_at DESC LIMIT 30`,
    [req.params.id, userId],
  );
  res.json(rows);
});

// ---- Listing Scores ----

seoRouter.get('/listing-scores', async (req, res) => {
  const userId = req.user!.userId;
  const { platform, label } = req.query;
  let sql = `SELECT * FROM listing_scores WHERE user_id = $1`;
  const params: any[] = [userId];
  if (platform) { sql += ` AND platform = $${params.length + 1}`; params.push(platform); }
  if (label) { sql += ` AND score_label = $${params.length + 1}`; params.push(label); }
  sql += ` ORDER BY score ASC`;
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

seoRouter.post('/listing-scores/compute', async (req, res) => {
  const userId = req.user!.userId;
  try {
    const computed = await computeListingScores(userId);
    res.json({ computed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Competitor Prices ----

seoRouter.get('/competitors', async (req, res) => {
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT tc.*,
       (SELECT row_to_json(cp.*) FROM competitor_prices cp
        WHERE cp.user_id = tc.user_id AND cp.my_sku = tc.my_sku
          AND cp.competitor_sku = tc.competitor_sku
        ORDER BY cp.checked_at DESC LIMIT 1) AS last_price
     FROM tracked_competitors tc WHERE tc.user_id = $1 AND tc.is_active = true
     ORDER BY tc.created_at DESC`,
    [userId],
  );
  res.json(rows);
});

seoRouter.post('/competitors', async (req, res) => {
  const userId = req.user!.userId;
  const { platform, my_sku, competitor_sku, competitor_name } = req.body;
  if (!platform || !my_sku || !competitor_sku) {
    return res.status(400).json({ error: 'platform, my_sku, competitor_sku required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO tracked_competitors (user_id, platform, my_sku, competitor_sku, competitor_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, platform, my_sku, competitor_sku) DO UPDATE SET is_active = true, competitor_name = $5
       RETURNING *`,
      [userId, platform, my_sku, competitor_sku, competitor_name ?? null],
    );
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

seoRouter.delete('/competitors/:id', async (req, res) => {
  const userId = req.user!.userId;
  await db.query(
    `UPDATE tracked_competitors SET is_active = false WHERE id = $1 AND user_id = $2`,
    [req.params.id, userId],
  );
  res.json({ ok: true });
});

seoRouter.post('/competitors/check', async (req, res) => {
  const userId = req.user!.userId;
  try {
    const checked = await checkCompetitorPrices(userId);
    res.json({ checked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recent competitor price history for a specific my_sku
seoRouter.get('/competitors/prices', async (req, res) => {
  const userId = req.user!.userId;
  const { my_sku, platform } = req.query;
  const { rows } = await db.query(
    `SELECT * FROM competitor_prices WHERE user_id = $1
     AND ($2::text IS NULL OR my_sku = $2)
     AND ($3::text IS NULL OR platform = $3)
     ORDER BY checked_at DESC LIMIT 200`,
    [userId, my_sku ?? null, platform ?? null],
  );
  res.json(rows);
});

// POST /api/seo/generate-listing — AI-generates optimized marketplace listing content
seoRouter.post('/generate-listing', async (req, res) => {
  const { productName, platform, category, currentTitle, keywords } = req.body;
  if (!productName || !platform) {
    res.status(400).json({ error: 'productName and platform required' }); return;
  }

  const platformLabel =
    platform === 'wb' ? 'Wildberries' :
    platform === 'ozon' ? 'Ozon' :
    platform === 'ym' ? 'Яндекс Маркет' : 'Мегамаркет';

  const kw = Array.isArray(keywords) && keywords.length ? keywords.join(', ') : null;

  const prompt = `/no_think Ты SEO-копирайтер маркетплейсов. Создай оптимизированную карточку товара для ${platformLabel}.

Товар: "${productName}"${category ? `\nКатегория: ${category}` : ''}${currentTitle ? `\nТекущее название: ${currentTitle}` : ''}${kw ? `\nЦелевые ключевые слова: ${kw}` : ''}

Ответь СТРОГО в формате JSON:
{
  "title": "<SEO-заголовок до 100 символов, главные ключевые слова в начале>",
  "description": "<продающее описание 200-300 слов, ключевые слова вписаны органично>",
  "bullets": [
    "<характеристика или преимущество 1>",
    "<характеристика или преимущество 2>",
    "<характеристика или преимущество 3>",
    "<характеристика или преимущество 4>",
    "<характеристика или преимущество 5>"
  ],
  "keywords": ["ключ1", "ключ2", "ключ3", "ключ4", "ключ5", "ключ6", "ключ7", "ключ8", "ключ9", "ключ10"],
  "seo_tips": [
    "<конкретный совет по улучшению карточки 1>",
    "<конкретный совет по улучшению карточки 2>",
    "<конкретный совет по улучшению карточки 3>"
  ]
}

Требования для ${platformLabel}: используй высокочастотные ключевые слова, пиши по-русски, сделай заголовок кликабельным.`;

  try {
    const { callLlm } = await import('../../integrations/llm/llm.client');
    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 2000);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) { res.status(500).json({ error: 'AI response parse failed', raw: text }); return; }
    res.json({ ...result, productName, platform });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/seo/keywords/export — CSV download of all keyword positions
seoRouter.get('/keywords/export', async (req, res) => {
  const userId = (req as any).user.userId;
  try {
    const { rows } = await db.query(
      `SELECT tk.keyword, tk.sku, tk.platform, tk.is_active,
              kp.position, kp.page, kp.checked_at
       FROM tracked_keywords tk
       LEFT JOIN LATERAL (
         SELECT position, page, checked_at FROM keyword_positions
         WHERE keyword_id = tk.id ORDER BY checked_at DESC LIMIT 1
       ) kp ON true
       WHERE tk.user_id = $1
       ORDER BY tk.platform, tk.keyword`,
      [userId],
    );
    const header = 'Ключевое слово,SKU,Площадка,Позиция,Страница,Дата проверки\n';
    const body = rows.map((r: any) =>
      [r.keyword, r.sku, r.platform, r.position ?? '', r.page ?? '', r.checked_at ? new Date(r.checked_at).toLocaleDateString('ru-RU') : '']
        .map((v: any) => `"${v}"`)
        .join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="keywords.csv"');
    res.send('﻿' + header + body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/seo/scores/export — CSV of listing scores
seoRouter.get('/scores/export', async (req, res) => {
  const userId = (req as any).user.userId;
  try {
    const { rows } = await db.query(
      `SELECT platform, sku, title, score, score_label, score_title, score_photos,
              score_desc, score_attrs, score_rating, computed_at
       FROM listing_scores WHERE user_id = $1 ORDER BY score DESC`,
      [userId],
    );
    const header = 'Площадка,SKU,Название,Итог,Оценка,Заголовок,Фото,Описание,Характеристики,Рейтинг,Дата\n';
    const body = rows.map((r: any) =>
      [r.platform, r.sku, r.title, r.score, r.score_label,
       r.score_title, r.score_photos, r.score_desc, r.score_attrs, r.score_rating,
       r.computed_at ? new Date(r.computed_at).toLocaleDateString('ru-RU') : '']
        .map((v: any) => `"${v ?? ''}"`)
        .join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="listing-scores.csv"');
    res.send('﻿' + header + body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

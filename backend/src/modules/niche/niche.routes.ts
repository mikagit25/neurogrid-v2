import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import axios from 'axios';
import { callLlm } from '../../integrations/llm/llm.client';

export const nicheRouter = Router();
nicheRouter.use(authenticate);

async function fetchWbSearch(query: string, limit = 50): Promise<any[]> {
  const resp = await axios.get('https://search.wb.ru/exactmatch/ru/common/v5/search', {
    params: { query, resultset: 'catalog', limit, sort: 'popular', page: 1, dest: -1257786 },
    timeout: 15_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://www.wildberries.ru/',
    },
  });
  const raw: any[] = resp.data?.products ?? resp.data?.data?.products ?? [];
  return raw.map((p: any) => {
    const size0 = (p.sizes ?? [])[0] ?? {};
    const priceU: number = size0.price?.total ?? p.priceU ?? 0;
    const salePriceU: number = size0.price?.basic ?? p.salePriceU ?? priceU;
    return {
      name: p.name ?? '',
      brand: p.brand ?? '',
      price: Math.round(priceU / 100),
      salePrice: Math.round(salePriceU / 100),
      rating: p.reviewRating ?? 0,
      reviews: p.feedbacks ?? 0,
    };
  });
}

async function fetchOzonSearch(query: string, limit = 50): Promise<any[]> {
  const resp = await axios.post('https://api.ozon.ru/v1/widget/search/result', {
    query,
    page: 1,
    pageSize: limit,
    sort: 'POPULAR_DESC',
  }, {
    timeout: 10_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Content-Type': 'application/json',
    },
  }).catch(() => ({ data: { items: [] } }));
  const items: any[] = resp.data?.items ?? resp.data?.searchResultItems ?? [];
  return items.map((p: any) => ({
    name: p.title ?? p.name ?? '',
    brand: p.brand ?? '',
    price: parseInt(p.price ?? p.originalPrice ?? '0', 10),
    salePrice: parseInt(p.finalPrice ?? p.price ?? '0', 10),
    rating: parseFloat(p.rating ?? '0'),
    reviews: parseInt(p.reviewsCount ?? '0', 10),
  }));
}

// GET /api/niche/search?q=<keyword>&platform=wb|ozon&limit=50
nicheRouter.get('/search', async (req: Request, res: Response) => {
  const { q, platform = 'wb', limit = '50' } = req.query as { q?: string; platform?: string; limit?: string };

  if (!q || q.trim().length < 2) {
    res.status(400).json({ error: 'Укажите поисковый запрос (минимум 2 символа)' });
    return;
  }

  const keyword = q.trim();
  const lim = Math.min(parseInt(limit, 10) || 50, 100);
  const platformLabel = platform === 'wb' ? 'Wildberries' : 'Ozon';

  let competitors: any[] = [];
  try {
    if (platform === 'wb') {
      competitors = await fetchWbSearch(keyword, lim);
    } else {
      competitors = await fetchOzonSearch(keyword, lim);
    }
  } catch (err: any) {
    res.status(502).json({ error: `Не удалось получить данные с ${platformLabel}: ${err.message}` });
    return;
  }

  if (competitors.length === 0) {
    res.json({
      keyword, platform, competitorsCount: 0,
      priceRange: { min: 0, max: 0, avg: 0 },
      avgRating: 0, topCompetitors: [], competitors: [],
      analysis: null,
      priceDistribution: [],
    });
    return;
  }

  const prices = competitors.map((c) => c.salePrice > 0 ? c.salePrice : c.price).filter((p) => p > 0).sort((a, b) => a - b);
  const avgPrice = prices.length > 0 ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
  const minPrice = prices[0] ?? 0;
  const maxPrice = prices[prices.length - 1] ?? 0;
  const avgRating = competitors.length > 0
    ? parseFloat((competitors.reduce((s, c) => s + c.rating, 0) / competitors.length).toFixed(1))
    : 0;
  const topByReviews = [...competitors].sort((a, b) => b.reviews - a.reviews).slice(0, 10);

  // Price distribution in 5 buckets
  const bucketSize = prices.length > 1 ? Math.ceil((maxPrice - minPrice) / 5) : 1;
  const priceDistribution: Array<{ label: string; count: number }> = [];
  if (bucketSize > 0) {
    for (let i = 0; i < 5; i++) {
      const from = minPrice + i * bucketSize;
      const to = from + bucketSize;
      const count = prices.filter((p) => p >= from && (i === 4 ? true : p < to)).length;
      priceDistribution.push({ label: `${from}–${to}₽`, count });
    }
  }

  // AI analysis (best-effort, non-blocking on error)
  let analysis: Record<string, unknown> | null = null;
  try {
    const { text } = await callLlm([{
      role: 'user',
      content: `Ты — эксперт по маркетплейсам ${platformLabel}. Проанализируй нишу.

Запрос: "${keyword}"
Найдено товаров: ${competitors.length}
Диапазон цен: ${minPrice}–${maxPrice} ₽, средняя: ${avgPrice} ₽
Средний рейтинг: ${avgRating}
Топ-5 по отзывам: ${topByReviews.slice(0, 5).map((c) => `${c.name} (${c.reviews} отзывов, ${c.salePrice || c.price}₽, рейтинг ${c.rating})`).join('; ')}

Верни ТОЛЬКО валидный JSON без markdown:
{
  "summary": "<2-3 предложения об общем состоянии ниши>",
  "competitionLevel": "<low|medium|high>",
  "competitionReason": "<почему такой уровень конкуренции>",
  "entryPrice": <рекомендуемая цена входа — число>,
  "entryPriceReason": "<обоснование>",
  "marginPotential": "<low|medium|high>",
  "topBrands": ["<бренд1>", "<бренд2>", "<бренд3>"],
  "strategy": "<стратегия входа, 2-3 предложения>",
  "opportunities": ["<возможность1>", "<возможность2>"],
  "warnings": ["<риск1>"]
}`,
    }], undefined, 700);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { analysis = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }
  } catch { /* non-critical */ }

  res.json({
    keyword,
    platform,
    competitorsCount: competitors.length,
    priceRange: { min: minPrice, max: maxPrice, avg: avgPrice },
    avgRating,
    topCompetitors: topByReviews,
    competitors: competitors.slice(0, 50),
    analysis,
    priceDistribution,
  });
});

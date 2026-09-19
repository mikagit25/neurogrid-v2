import axios from 'axios';
import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';
import { callLlm } from '../integrations/llm/llm.client';

interface WbSearchProduct {
  id: number;
  name: string;
  brand: string;
  supplier: string;
  priceU: number;       // basic price in kopecks (extracted from sizes)
  salePriceU: number;   // sale price in kopecks (extracted from sizes)
  reviewRating: number;
  feedbacks: number;
  volume: number;
}

async function fetchWbSearch(query: string, limit = 50): Promise<WbSearchProduct[]> {
  const url = `https://search.wb.ru/exactmatch/ru/common/v5/search`;
  const resp = await axios.get(url, {
    params: {
      query,
      resultset: 'catalog',
      limit,
      sort: 'popular',
      page: 1,
      dest: -1257786,  // Moscow delivery zone — required for non-empty results
    },
    timeout: 15_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'ru-RU,ru;q=0.9',
      'Referer': 'https://www.wildberries.ru/',
    },
  });
  // API v5 with dest returns products at top-level resp.data.products;
  // without dest they're at resp.data.data.products — support both.
  const raw: any[] = resp.data?.products ?? resp.data?.data?.products ?? [];
  return raw.map((p: any) => {
    const size0 = (p.sizes ?? [])[0] ?? {};
    const priceObj = size0.price ?? {};
    return {
      id: p.id,
      name: p.name ?? '',
      brand: p.brand ?? '',
      supplier: p.supplier ?? '',
      priceU: priceObj.basic ?? p.priceU ?? 0,
      salePriceU: priceObj.product ?? p.salePriceU ?? priceObj.basic ?? p.priceU ?? 0,
      reviewRating: p.reviewRating ?? p.rating ?? 0,
      feedbacks: p.feedbacks ?? 0,
      volume: p.volume ?? 0,
    };
  });
}

async function fetchOzonSearch(query: string, limit = 50): Promise<Array<{ id: number; name: string; price: number; finalPrice: number; rating: number; reviewsCount: number; brand?: string }>> {
  try {
    const resp = await axios.post(
      'https://api.ozon.ru/composer-api.bx/page/json/v2?url=/search/',
      {
        operationName: 'searchResultsV2',
        query: `query { searchResultsV2(query:"${query}",pageSize:${limit}) { items { id name price finalPrice rating reviewsCount brand } } }`,
      },
      { timeout: 10_000 }
    );
    return resp.data?.data?.searchResultsV2?.items ?? [];
  } catch {
    return [];
  }
}

export class NicheAnalysisExecutor implements ScenarioExecutor {
  readonly slug = 'niche-analysis';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const keyword = String(ctx.inputData.keyword ?? '');
    const platform = String(ctx.inputData.platform ?? 'wb') as 'wb' | 'ozon';
    const limit = Math.min(Number(ctx.inputData.limit ?? 50), 100);

    if (!keyword) throw new Error('keyword is required');

    let competitors: Array<{
      name: string; brand: string; supplier?: string;
      price: number; salePrice?: number;
      rating: number; reviews: number;
    }> = [];

    if (platform === 'wb') {
      const raw = await fetchWbSearch(keyword, limit);
      competitors = raw.map((p) => ({
        name: p.name,
        brand: p.brand,
        supplier: p.supplier,
        price: Math.round(p.priceU / 100),
        salePrice: Math.round(p.salePriceU / 100),
        rating: p.reviewRating,
        reviews: p.feedbacks,
      }));
    } else {
      const raw = await fetchOzonSearch(keyword, limit);
      competitors = raw.map((p) => ({
        name: p.name,
        brand: p.brand ?? '',
        price: p.price,
        salePrice: p.finalPrice,
        rating: p.rating,
        reviews: p.reviewsCount,
      }));
    }

    if (competitors.length === 0) throw new Error('Товары по запросу не найдены');

    const platformLabel = platform === 'wb' ? 'Wildberries' : 'Ozon';
    const prices = competitors.map((c) => c.salePrice ?? c.price).filter(Boolean).sort((a, b) => a - b);
    const avgPrice = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
    const minPrice = prices[0];
    const maxPrice = prices[prices.length - 1];
    const avgRating = (competitors.reduce((s, c) => s + c.rating, 0) / competitors.length).toFixed(1);
    const topByReviews = [...competitors].sort((a, b) => b.reviews - a.reviews).slice(0, 5);

    const { text } = await callLlm([{
      role: 'user',
      content: `Ты — эксперт по маркетплейсам ${platformLabel}. Проанализируй нишу.

Запрос: "${keyword}"
Найдено товаров: ${competitors.length}
Диапазон цен: ${minPrice}–${maxPrice} ₽, средняя цена: ${avgPrice} ₽
Средний рейтинг: ${avgRating}
Топ-5 по отзывам: ${topByReviews.map((c) => `${c.name} (${c.reviews} отзывов, ${c.price}₽, рейтинг ${c.rating})`).join('; ')}

Полный список (первые 30): ${competitors.slice(0, 30).map((c) => `${c.name} — ${c.salePrice ?? c.price}₽, рейтинг ${c.rating}, отзывов ${c.reviews}`).join('\n')}

Верни ТОЛЬКО валидный JSON без markdown:
{
  "summary": "<2-3 предложения об общем состоянии ниши: конкуренция, потенциал, особенности>",
  "competitionLevel": "<low|medium|high>",
  "competitionReason": "<почему такой уровень>",
  "entryPrice": <рекомендуемая цена входа в рублях — число>,
  "entryPriceReason": "<обоснование цены>",
  "marginPotential": "<low|medium|high>",
  "topBrands": ["<бренд1>", "<бренд2>", "<бренд3>"],
  "trends": ["<тренд1>", "<тренд2>"],
  "strategy": "<рекомендация по стратегии входа в нишу, 3-4 предложения>",
  "warnings": ["<предупреждение1 если есть>"],
  "opportunities": ["<возможность1>", "<возможность2>"]
}`,
    }], undefined, 800);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let analysis: Record<string, unknown> = {};
    if (jsonMatch) {
      try { analysis = JSON.parse(jsonMatch[0]); } catch { /* non-critical */ }
    }

    return {
      keyword,
      platform,
      competitorsCount: competitors.length,
      priceRange: { min: minPrice, max: maxPrice, avg: avgPrice },
      avgRating: parseFloat(avgRating),
      topCompetitors: topByReviews,
      competitors: competitors.slice(0, 50),
      analysis,
      note: `Анализ ${competitors.length} товаров по запросу «${keyword}» на ${platformLabel}`,
    };
  }
}

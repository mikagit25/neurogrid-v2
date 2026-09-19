import axios, { AxiosInstance } from 'axios';
import { MarketplaceAdapter, ProductInfo, CompetitorPrice, ReviewOrQuestion } from '../base.adapter';

export interface WbCredentials {
  apiKey: string;
  statisticsApiKey?: string;
  advertApiKey?: string;
}

/**
 * Wildberries Seller API adapter.
 * Docs: https://openapi.wb.ru/
 *
 * NOTE: Before adding a new API method, verify the current endpoint and rate limits
 * in the official WB documentation — they change frequently.
 */
export class WbAdapter implements MarketplaceAdapter {
  readonly platform = 'wb' as const;

  private contentClient: AxiosInstance;
  private statisticsClient: AxiosInstance;

  constructor(private credentials: WbCredentials) {
    this.contentClient = axios.create({
      baseURL: 'https://content-api.wildberries.ru',
      headers: { Authorization: credentials.apiKey },
    });
    this.statisticsClient = axios.create({
      baseURL: 'https://statistics-api.wildberries.ru',
      headers: { Authorization: credentials.statisticsApiKey || credentials.apiKey },
    });
  }

  async validateCredentials(): Promise<void> {
    // GET /api/v1/config returns 200 for valid key
    await this.contentClient.get('/api/v1/config');
  }

  async getProducts(limit = 100): Promise<ProductInfo[]> {
    const resp = await this.contentClient.post('/api/v1/cards/list', {
      settings: { cursor: { limit }, filter: { withPhoto: -1 } },
    });
    const cards = resp.data.data?.cards ?? [];
    return cards.map((c: any) => ({
      sku: String(c.nmID),
      title: c.title ?? '',
      price: c.sizes?.[0]?.price ?? 0,
      stock: 0, // stock is a separate WB API — fetched on demand
      categoryId: c.subjectID ? String(c.subjectID) : undefined,
      description: c.description,
    }));
  }

  async getProduct(sku: string): Promise<ProductInfo> {
    const resp = await this.contentClient.post('/api/v1/cards/list', {
      settings: {
        cursor: { limit: 1 },
        filter: { withPhoto: -1, nmID: parseInt(sku, 10) },
      },
    });
    const card = resp.data.data?.cards?.[0];
    if (!card) throw new Error(`Product ${sku} not found`);
    return {
      sku,
      title: card.title ?? '',
      price: card.sizes?.[0]?.price ?? 0,
      stock: 0,
    };
  }

  async getStockHistory(sku: string, days: number): Promise<{ date: string; sold: number }[]> {
    const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const resp = await this.statisticsClient.get('/api/v1/supplier/orders', {
      params: { dateFrom, flag: 0 },
    });
    const orders: any[] = resp.data ?? [];
    const daily: Record<string, number> = {};
    for (const o of orders) {
      if (String(o.nmId) !== sku) continue;
      const date = o.date?.slice(0, 10);
      if (!date) continue;
      daily[date] = (daily[date] ?? 0) + (o.quantity ?? 1);
    }
    return Object.entries(daily).map(([date, sold]) => ({ date, sold }));
  }

  async getCompetitorPrices(_sku: string): Promise<CompetitorPrice[]> {
    // WB does not expose a competitor-price endpoint in seller API.
    // Placeholder — will integrate via third-party analytics (MPStats API) or
    // a manual catalog search endpoint when available.
    throw new Error('Competitor prices not available via WB Seller API — requires MPStats integration');
  }

  async getReviewsAndQuestions(limit = 50): Promise<ReviewOrQuestion[]> {
    const resp = await this.contentClient.get('/api/v1/feedbacks', {
      params: { isAnswered: false, take: limit, skip: 0, order: 'dateDesc' },
    });
    const feedbacks: any[] = resp.data.data?.feedbacks ?? [];
    return feedbacks.map((f: any) => ({
      id: f.id,
      type: 'review' as const,
      text: f.text ?? '',
      authorName: f.userName,
      rating: f.productValuation,
      createdAt: f.createdDate,
    }));
  }

  async updatePrice(sku: string, price: number): Promise<void> {
    await this.contentClient.post('/api/v2/upload/task', {
      data: [{ nmID: parseInt(sku, 10), price }],
    });
  }

  async updateProductContent(sku: string, title: string, description: string): Promise<void> {
    await this.contentClient.post('/api/v1/cards/update', [{
      nmID: parseInt(sku, 10),
      title,
      description,
    }]);
  }

  async postReviewResponse(reviewId: string, text: string): Promise<void> {
    await this.contentClient.patch('/api/v1/feedbacks', {
      id: reviewId,
      text,
    });
  }

  async getStockLevels(): Promise<{ sku: string; stock: number }[]> {
    const resp = await this.contentClient.get('/api/v3/stocks', {
      params: { dateFrom: new Date(Date.now() - 86400_000).toISOString() },
    });
    const stocks: any[] = resp.data.stocks ?? [];
    return stocks.map((s: any) => ({ sku: String(s.nmId), stock: s.quantity ?? 0 }));
  }
}

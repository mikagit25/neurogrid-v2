import axios, { AxiosInstance } from 'axios';
import { MarketplaceAdapter, ProductInfo, CompetitorPrice, ReviewOrQuestion } from '../base.adapter';

export interface OzonCredentials {
  clientId: string;
  apiKey: string;
}

/**
 * Ozon Seller API adapter.
 * Docs: https://docs.ozon.ru/api/seller/
 *
 * NOTE: Before adding a new API method, verify the current endpoint and rate limits
 * in the official Ozon documentation — rate limits and endpoints change frequently.
 */
export class OzonAdapter implements MarketplaceAdapter {
  readonly platform = 'ozon' as const;

  private client: AxiosInstance;

  constructor(private credentials: OzonCredentials) {
    this.client = axios.create({
      baseURL: 'https://api-seller.ozon.ru',
      headers: {
        'Client-Id': credentials.clientId,
        'Api-Key': credentials.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async validateCredentials(): Promise<void> {
    // POST /v1/product/list with small limit is the lightest validation call
    await this.client.post('/v1/product/list', { limit: 1, last_id: '' });
  }

  async getProducts(limit = 100): Promise<ProductInfo[]> {
    const resp = await this.client.post('/v2/product/list', {
      filter: {},
      last_id: '',
      limit,
    });
    const items: any[] = resp.data.result?.items ?? [];
    if (items.length === 0) return [];

    // Fetch details for price+stock in one bulk call
    const productIds = items.map((i: any) => i.product_id);
    const details = await this.client.post('/v3/product/info/list', {
      product_id: productIds,
    });
    const infoMap: Record<string, any> = {};
    for (const p of details.data.result?.items ?? []) {
      infoMap[p.id] = p;
    }

    return items.map((i: any) => {
      const info = infoMap[i.product_id] ?? {};
      return {
        sku: String(i.product_id),
        title: info.name ?? '',
        price: parseFloat(info.price ?? '0'),
        stock: info.stocks?.present ?? 0,
        categoryId: info.category_id ? String(info.category_id) : undefined,
        description: info.description,
      };
    });
  }

  async getProduct(sku: string): Promise<ProductInfo> {
    const resp = await this.client.post('/v3/product/info', {
      product_id: parseInt(sku, 10),
    });
    const p = resp.data.result;
    return {
      sku,
      title: p.name,
      price: parseFloat(p.price),
      stock: p.stocks?.present ?? 0,
      description: p.description,
    };
  }

  async getStockHistory(sku: string, days: number): Promise<{ date: string; sold: number }[]> {
    const dateTo = new Date().toISOString().slice(0, 10);
    const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const resp = await this.client.post('/v1/analytics/data', {
      date_from: dateFrom,
      date_to: dateTo,
      dimension: ['day'],
      filters: [{ key: 'item_id', op: 'EQ', value: sku }],
      metrics: ['ordered_units'],
      limit: days,
      offset: 0,
    });
    return (resp.data.result?.data ?? []).map((row: any) => ({
      date: row.dimensions?.[0]?.id,
      sold: row.metrics?.[0] ?? 0,
    }));
  }

  async getCompetitorPrices(sku: string): Promise<CompetitorPrice[]> {
    const resp = await this.client.post('/v1/product/info/prices', {
      filter: { product_id: [parseInt(sku, 10)] },
      last_id: '',
      limit: 1,
    });
    const item = resp.data.result?.items?.[0];
    if (!item) return [];
    // Ozon returns min_ozon_price and price_index — wrap as competitor data
    return [{
      sku,
      competitorName: 'Ozon min price',
      price: parseFloat(item.price?.min_ozon_price ?? '0'),
    }];
  }

  async getReviewsAndQuestions(limit = 50): Promise<ReviewOrQuestion[]> {
    const resp = await this.client.post('/v1/review/list', {
      status: 'ALL',
      sort_dir: 'desc',
      limit,
      offset: 0,
    });
    return (resp.data.reviews ?? []).map((r: any) => ({
      id: r.review_id,
      type: 'review' as const,
      text: r.comment?.text ?? '',
      authorName: r.author_name,
      rating: r.rating,
      createdAt: r.created_at,
    }));
  }

  async updatePrice(sku: string, price: number): Promise<void> {
    await this.client.post('/v1/product/import/prices', {
      prices: [{ product_id: parseInt(sku, 10), price: String(price) }],
    });
  }

  async updateProductContent(sku: string, title: string, description: string): Promise<void> {
    await this.client.post('/v2/product/update', {
      item_id: parseInt(sku, 10),
      name: title,
      description,
    });
  }
}

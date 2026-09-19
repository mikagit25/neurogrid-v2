import axios, { AxiosInstance } from 'axios';
import { MarketplaceAdapter, ProductInfo, CompetitorPrice, ReviewOrQuestion, SalesDay, FinanceSummary, MarketplaceOrder } from '../base.adapter';

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
        photoUrls: (info.images ?? []).slice(0, 3),
        characteristics: Object.fromEntries(
          (info.attributes ?? []).map((a: any) => [a.attribute_id, (a.values ?? []).map((v: any) => v.value).join(', ')])
        ),
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

  async postReviewResponse(reviewId: string, text: string): Promise<void> {
    await this.client.post('/v1/review/comment/create', {
      review_id: reviewId,
      comment: text,
    });
  }

  async getStockLevels(): Promise<{ sku: string; stock: number }[]> {
    const resp = await this.client.post('/v3/product/info/stocks', {
      filter: { visibility: 'ALL' },
      last_id: '',
      limit: 1000,
    });
    return (resp.data.result?.items ?? []).map((i: any) => ({
      sku: String(i.product_id),
      stock: i.stocks?.find((s: any) => s.type === 'fbo')?.present ?? 0,
    }));
  }

  // ---- Analytics ----

  async getSalesByDay(dateFrom: string, dateTo: string): Promise<SalesDay[]> {
    try {
      const resp = await this.client.post('/v1/analytics/data', {
        date_from: dateFrom,
        date_to: dateTo,
        metrics: ['revenue', 'ordered_units', 'returns', 'cancellations'],
        dimension: ['day'],
        filters: [],
        limit: 1000,
        offset: 0,
        sort: [{ key: 'day', order: 'ASC' }],
      });
      return (resp.data?.result?.data ?? []).map((row: any) => {
        const [revenue = 0, orders = 0, returns = 0] = row.metrics ?? [];
        return {
          date: row.dimensions?.[0]?.id ?? '',
          revenue: Number(revenue),
          orders: Number(orders),
          returns: Number(returns),
          commissions: 0,
          netPayout: 0,
        };
      }).filter((d: SalesDay) => d.date);
    } catch {
      return [];
    }
  }

  async getFinanceSummary(dateFrom: string, dateTo: string): Promise<FinanceSummary> {
    try {
      const resp = await this.client.post('/v1/finance/transaction/list', {
        filter: {
          date: { from: `${dateFrom}T00:00:00.000Z`, to: `${dateTo}T23:59:59.999Z` },
          operation_type: [],
          posting_number: '',
          transaction_type: 'all',
        },
        page: 1,
        page_size: 1000,
      });
      const ops: any[] = resp.data?.result?.operations ?? [];
      let revenue = 0, commissions = 0, logistics = 0, penalties = 0;
      for (const op of ops) {
        const amount = Number(op.amount ?? 0);
        const type: string = op.operation_type ?? '';
        if (type === 'OperationAgentDeliveredToCustomer') revenue += amount;
        else if (type.includes('MarketplaceServiceItemFulfillment') || type.includes('Commission')) commissions += Math.abs(amount);
        else if (type.includes('Delivery') || type.includes('Logistic')) logistics += Math.abs(amount);
        else if (type.includes('Penalty') || amount < 0) penalties += Math.abs(amount);
      }
      const netPayout = revenue - commissions - logistics - penalties;
      return { revenue, commissions, logistics, penalties, netPayout };
    } catch {
      return { revenue: 0, commissions: 0, logistics: 0, penalties: 0, netPayout: 0 };
    }
  }

  // ---- Orders ----

  async getNewOrders(): Promise<MarketplaceOrder[]> {
    return this._getFbsOrders('awaiting_packaging');
  }

  async getAllOrders(dateFrom?: string): Promise<MarketplaceOrder[]> {
    const since = dateFrom ?? new Date(Date.now() - 7 * 86400_000).toISOString();
    return this._getFbsOrders(undefined, since);
  }

  private async _getFbsOrders(status?: string, since?: string): Promise<MarketplaceOrder[]> {
    try {
      const filter: Record<string, any> = {
        delivery_method_id: [],
        provider_id: [],
        since: since ?? new Date(Date.now() - 7 * 86400_000).toISOString(),
        to: new Date().toISOString(),
      };
      if (status) filter.status = status;

      const resp = await this.client.post('/v3/posting/fbs/list', {
        dir: 'desc',
        filter,
        limit: 100,
        offset: 0,
        with: { analytics_data: false, barcodes: true, financial_data: false, translit: false },
      });
      return (resp.data?.result?.postings ?? []).map((p: any) => ({
        id: p.posting_number,
        platform: 'ozon' as const,
        status: p.status,
        createdAt: p.created_at ?? '',
        items: (p.products ?? []).map((prod: any) => ({
          sku: String(prod.sku),
          offerId: prod.offer_id ?? '',
          title: prod.name ?? '',
          quantity: prod.quantity ?? 1,
          price: parseFloat(prod.price ?? '0'),
        })),
        postingNumber: p.posting_number,
        deliveryMethod: p.delivery_method?.name ?? '',
        shipByDate: p.shipment_date ?? '',
        upperBarcode: p.barcodes?.upper_barcode ?? '',
        lowerBarcode: p.barcodes?.lower_barcode ?? '',
      }));
    } catch {
      return [];
    }
  }

  // ---- FBS-specific (Ozon only) ----

  async shipFbsOrder(postingNumber: string, packages: Array<{ products: Array<{ sku: number; quantity: number }> }>): Promise<void> {
    await this.client.post('/v2/posting/fbs/ship', { posting_number: postingNumber, packages });
  }

  async getFbsLabel(postingNumbers: string[]): Promise<string> {
    const resp = await this.client.post(
      '/v2/posting/fbs/package-label',
      { posting_number: postingNumbers },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(resp.data as ArrayBuffer).toString('base64');
  }

  async getProductSticker(postingNumber: string, skus: number[]): Promise<string> {
    const resp = await this.client.post(
      '/v1/posting/fbs/product/sticker/pdf',
      { posting_number: postingNumber, products: skus.map(id => ({ product_id: id, quantity: 1 })) },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(resp.data as ArrayBuffer).toString('base64');
  }
}

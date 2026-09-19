import axios, { AxiosInstance } from 'axios';
import { MarketplaceAdapter, ProductInfo, CompetitorPrice, ReviewOrQuestion, SalesDay, FinanceSummary, MarketplaceOrder } from '../base.adapter';

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
  private marketplaceClient: AxiosInstance;
  private analyticsClient: AxiosInstance;

  constructor(private credentials: WbCredentials) {
    this.contentClient = axios.create({
      baseURL: 'https://content-api.wildberries.ru',
      headers: { Authorization: credentials.apiKey },
      timeout: 30_000,
    });
    this.statisticsClient = axios.create({
      baseURL: 'https://statistics-api.wildberries.ru',
      headers: { Authorization: credentials.statisticsApiKey || credentials.apiKey },
      timeout: 30_000,
    });
    this.marketplaceClient = axios.create({
      baseURL: 'https://marketplace-api.wildberries.ru',
      headers: { Authorization: credentials.apiKey },
      timeout: 30_000,
    });
    this.analyticsClient = axios.create({
      baseURL: 'https://seller-analytics-api.wildberries.ru',
      headers: { Authorization: credentials.apiKey },
      timeout: 30_000,
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
      photoUrls: (c.photos ?? []).slice(0, 3).map((p: any) => p.big ?? p.c516x688 ?? p.c246x328 ?? '').filter(Boolean),
      characteristics: Object.fromEntries(
        (c.characteristics ?? []).flatMap((g: any) =>
          (g.attributes ?? []).map((a: any) => [a.name, (a.value ?? []).map((v: any) => v.value ?? v).join(', ')])
        )
      ),
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

  // ---- Analytics ----

  async getSalesByDay(dateFrom: string, dateTo: string): Promise<SalesDay[]> {
    try {
      // WB detailed report — covers all operation types per sale_dt
      const resp = await this.statisticsClient.get('/api/v5/supplier/reportDetailByPeriod', {
        params: { dateFrom, dateTo, limit: 100000, rrdid: 0 },
      });
      const rows: any[] = resp.data ?? [];
      const daily: Record<string, SalesDay> = {};

      for (const row of rows) {
        const date = (row.sale_dt ?? row.rr_dt ?? '').slice(0, 10);
        if (!date) continue;
        if (!daily[date]) daily[date] = { date, revenue: 0, orders: 0, returns: 0, commissions: 0, netPayout: 0 };
        const type: string = row.supplier_oper_name ?? '';
        if (type === 'Продажа') {
          daily[date].revenue += row.retail_price_withdisc_rub ?? 0;
          daily[date].orders += row.quantity ?? 1;
          daily[date].commissions += Math.abs(row.ppvz_sales_commission ?? row.ppvz_kvw_prc ?? 0);
          daily[date].netPayout += row.ppvz_for_pay ?? 0;
        } else if (type === 'Возврат') {
          daily[date].returns += row.quantity ?? 1;
          daily[date].netPayout -= Math.abs(row.ppvz_for_pay ?? 0);
        } else if (type === 'Штраф' || type.includes('штраф')) {
          daily[date].netPayout -= Math.abs(row.ppvz_for_pay ?? 0);
        }
      }
      return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  async getFinanceSummary(dateFrom: string, dateTo: string): Promise<FinanceSummary> {
    try {
      const resp = await this.statisticsClient.get('/api/v5/supplier/reportDetailByPeriod', {
        params: { dateFrom, dateTo, limit: 100000, rrdid: 0 },
      });
      const rows: any[] = resp.data ?? [];
      let revenue = 0, commissions = 0, logistics = 0, penalties = 0, netPayout = 0;
      for (const row of rows) {
        const type: string = row.supplier_oper_name ?? '';
        if (type === 'Продажа') {
          revenue += row.retail_price_withdisc_rub ?? 0;
          commissions += Math.abs(row.ppvz_sales_commission ?? 0);
          netPayout += row.ppvz_for_pay ?? 0;
        } else if (type === 'Логистика') {
          logistics += Math.abs(row.delivery_rub ?? 0);
        } else if (type === 'Возврат') {
          netPayout -= Math.abs(row.ppvz_for_pay ?? 0);
        } else if (type === 'Штраф' || type.includes('штраф')) {
          penalties += Math.abs(row.ppvz_for_pay ?? 0);
          netPayout -= Math.abs(row.ppvz_for_pay ?? 0);
        }
      }
      return { revenue, commissions, logistics, penalties, netPayout };
    } catch {
      return { revenue: 0, commissions: 0, logistics: 0, penalties: 0, netPayout: 0 };
    }
  }

  // ---- Orders (FBS) ----

  async getNewOrders(): Promise<MarketplaceOrder[]> {
    try {
      const resp = await this.marketplaceClient.get('/api/v3/orders/new');
      return this._mapWbOrders(resp.data?.orders ?? [], 'new');
    } catch {
      return [];
    }
  }

  async getAllOrders(dateFrom?: string): Promise<MarketplaceOrder[]> {
    try {
      const since = dateFrom ?? new Date(Date.now() - 7 * 86400_000).toISOString();
      const resp = await this.marketplaceClient.get('/api/v3/orders', {
        params: { dateStart: since, status: 0 },
      });
      return this._mapWbOrders(resp.data?.orders ?? [], 'all');
    } catch {
      return [];
    }
  }

  private _mapWbOrders(orders: any[], status: string): MarketplaceOrder[] {
    return orders.map((o: any) => ({
      id: String(o.id),
      platform: 'wb' as const,
      status: o.wbStatus ?? status,
      createdAt: o.createdAt ?? new Date().toISOString(),
      items: [{
        sku: String(o.nmId ?? ''),
        offerId: o.article ?? '',
        title: o.article ?? String(o.nmId ?? ''),
        quantity: 1,
        price: Math.round((o.price ?? 0) / 100),
      }],
      warehouseId: o.warehouseId,
      warehouseName: (o.offices ?? [])[0] ?? '',
      nmId: o.nmId,
    }));
  }

  // ---- Supply management (WB-specific) ----

  async createSupply(name: string): Promise<string> {
    const resp = await this.marketplaceClient.post('/api/v3/supplies', { name });
    return resp.data?.id ?? '';
  }

  async addOrdersToSupply(supplyId: string, orderIds: string[]): Promise<void> {
    for (const orderId of orderIds) {
      await this.marketplaceClient.put(`/api/v3/supplies/${supplyId}/orders/${orderId}`);
    }
  }

  async closeSupply(supplyId: string): Promise<void> {
    await this.marketplaceClient.patch(`/api/v3/supplies/${supplyId}/close`);
  }

  async getSupplyBarcode(supplyId: string): Promise<string> {
    const resp = await this.marketplaceClient.get(`/api/v3/supplies/${supplyId}/barcode`, {
      headers: { Accept: 'application/png' },
      responseType: 'arraybuffer',
    });
    return Buffer.from(resp.data as ArrayBuffer).toString('base64');
  }

  async getOrderStickers(orderIds: string[]): Promise<{ orderId: string; barcodeBase64: string }[]> {
    const resp = await this.marketplaceClient.post(
      '/api/v3/orders/stickers',
      { orders: orderIds.map(Number) },
      { params: { type: 'png', width: 58, height: 40 } }
    );
    return (resp.data?.stickers ?? []).map((s: any) => ({
      orderId: String(s.orderId),
      barcodeBase64: s.barcodeBase64 ?? '',
    }));
  }
}

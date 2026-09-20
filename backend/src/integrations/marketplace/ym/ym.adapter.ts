import axios, { AxiosInstance } from 'axios';
import {
  MarketplaceAdapter, ProductInfo, CompetitorPrice, ReviewOrQuestion,
  SalesDay, FinanceSummary, FinanceRecord, WarehouseStock, MarketplaceOrder, OrderLine,
} from '../base.adapter';

export interface YmCredentials {
  apiToken: string;    // OAuth token из кабинета Яндекс Маркета
  campaignId: string;  // ID магазина (кампании)
  businessId: string;  // ID бизнес-аккаунта
}

/**
 * Yandex Market Partner API v2 adapter.
 * Docs: https://yandex.ru/dev/market/partner-api/
 * Auth: Authorization: OAuth {token}
 */
export class YmAdapter implements MarketplaceAdapter {
  readonly platform = 'ym' as const;

  private client: AxiosInstance;
  private campaignId: string;
  private businessId: string;

  constructor(private credentials: YmCredentials) {
    this.campaignId = credentials.campaignId;
    this.businessId = credentials.businessId;
    this.client = axios.create({
      baseURL: 'https://api.partner.market.yandex.ru',
      headers: { Authorization: `OAuth ${credentials.apiToken}` },
      timeout: 30_000,
    });
  }

  async validateCredentials(): Promise<void> {
    // GET /campaigns returns list of user's campaigns — 401 on invalid token
    const resp = await this.client.get(`/campaigns/${this.campaignId}`);
    if (!resp.data?.campaign) throw new Error('Invalid Yandex Market credentials');
  }

  async getProducts(limit = 100): Promise<ProductInfo[]> {
    try {
      const resp = await this.client.post(
        `/businesses/${this.businessId}/offer-mappings`,
        { limit },
      );
      const offers = resp.data?.result?.offerMappings ?? [];
      return offers.map((o: any) => {
        const offer = o.offer ?? {};
        return {
          sku: offer.offerId ?? '',
          title: offer.name ?? '',
          price: offer.basicPrice?.value ?? 0,
          stock: 0,
          categoryId: offer.category?.name,
          description: offer.description,
          photoUrls: (offer.pictures ?? []).slice(0, 3),
          characteristics: Object.fromEntries(
            (offer.parameterValues ?? []).map((p: any) => [p.name, String(p.value?.value ?? p.value ?? '')])
          ),
        };
      });
    } catch {
      return [];
    }
  }

  async getProduct(sku: string): Promise<ProductInfo> {
    const all = await this.getProducts(1000);
    const found = all.find(p => p.sku === sku);
    if (!found) throw new Error(`Product ${sku} not found`);
    return found;
  }

  async getStockHistory(sku: string, days: number): Promise<{ date: string; sold: number }[]> {
    try {
      const dateTo = new Date().toISOString().slice(0, 10);
      const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const resp = await this.client.get(`/campaigns/${this.campaignId}/stats/orders`, {
        params: { dateFrom, dateTo, offerIds: sku },
      });
      const stats: any[] = resp.data?.result?.orders ?? [];
      const daily: Record<string, number> = {};
      for (const o of stats) {
        const date = (o.creationDate ?? '').slice(0, 10);
        if (!date) continue;
        const qty = (o.items ?? []).filter((i: any) => i.offerId === sku)
          .reduce((s: number, i: any) => s + (i.count ?? 1), 0);
        daily[date] = (daily[date] ?? 0) + qty;
      }
      return Object.entries(daily).map(([date, sold]) => ({ date, sold }));
    } catch {
      return [];
    }
  }

  async getCompetitorPrices(_sku: string): Promise<CompetitorPrice[]> {
    return []; // YM doesn't expose competitor prices via API
  }

  async getReviewsAndQuestions(limit = 20): Promise<ReviewOrQuestion[]> {
    try {
      const resp = await this.client.get(`/campaigns/${this.campaignId}/feedback/updates`, {
        params: { limit },
      });
      const feedbacks: any[] = resp.data?.result?.feedbacks ?? [];
      return feedbacks.map((f: any) => ({
        id: String(f.id),
        type: 'review' as const,
        text: f.text ?? '',
        authorName: f.author?.name,
        rating: f.grades?.overall,
        createdAt: f.createdAt ?? '',
      }));
    } catch {
      return [];
    }
  }

  async updatePrice(sku: string, price: number): Promise<void> {
    await this.client.post(`/businesses/${this.businessId}/offer-prices/updates`, {
      offers: [{ offerId: sku, price: { value: price, currencyId: 'RUR' } }],
    });
  }

  async updateProductContent(sku: string, title: string, description: string): Promise<void> {
    await this.client.post(`/businesses/${this.businessId}/offer-mappings/update`, {
      offerMappings: [{ offer: { offerId: sku, name: title, description } }],
    });
  }

  async postReviewResponse(reviewId: string, text: string): Promise<void> {
    await this.client.post(`/campaigns/${this.campaignId}/feedback/updates`, {
      feedback: { id: reviewId, comment: { text } },
    });
  }

  async getStockLevels(): Promise<{ sku: string; stock: number }[]> {
    try {
      const resp = await this.client.get(`/campaigns/${this.campaignId}/offers/stocks`);
      const warehouses: any[] = resp.data?.result?.warehouses ?? [];
      const totals: Record<string, number> = {};
      for (const wh of warehouses) {
        for (const offer of wh.offers ?? []) {
          const sku = offer.offerId ?? '';
          const qty = (offer.stocksByType ?? []).reduce((s: number, t: any) => s + (t.count ?? 0), 0);
          totals[sku] = (totals[sku] ?? 0) + qty;
        }
      }
      return Object.entries(totals).map(([sku, stock]) => ({ sku, stock }));
    } catch {
      return [];
    }
  }

  async getWarehouseStocks(): Promise<WarehouseStock[]> {
    try {
      const resp = await this.client.get(`/campaigns/${this.campaignId}/offers/stocks`);
      const warehouses: any[] = resp.data?.result?.warehouses ?? [];
      const result: WarehouseStock[] = [];
      for (const wh of warehouses) {
        // warehouseType: FBY = fbo (Яндекс хранит), DBS/FBS = fbs (продавец хранит)
        const whType = wh.warehouseType === 'FBY' ? 'fbo' : 'fbs';
        const whName = wh.warehouseName ?? (whType === 'fbo' ? 'Яндекс.Маркет FBY' : 'FBS (мой склад)');
        for (const offer of wh.offers ?? []) {
          const total = (offer.stocksByType ?? []).reduce((s: number, t: any) => s + (t.count ?? 0), 0);
          if (total <= 0) continue;
          result.push({
            sku: offer.offerId ?? '',
            title: '',
            warehouseType: whType,
            warehouseName: whName,
            quantity: total,
          });
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  async getSalesByDay(dateFrom: string, dateTo: string): Promise<SalesDay[]> {
    try {
      const resp = await this.client.get(`/campaigns/${this.campaignId}/stats/orders`, {
        params: { dateFrom, dateTo },
      });
      const orders: any[] = resp.data?.result?.orders ?? [];
      const daily: Record<string, SalesDay> = {};
      for (const o of orders) {
        const date = (o.creationDate ?? '').slice(0, 10);
        if (!date) continue;
        if (!daily[date]) daily[date] = { date, revenue: 0, orders: 0, returns: 0, commissions: 0, netPayout: 0 };
        const total = o.itemsTotal ?? 0;
        daily[date].revenue += total;
        daily[date].orders += 1;
        daily[date].netPayout += total * 0.88; // ~12% avg commission estimate
      }
      return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  async getFinanceSummary(dateFrom: string, dateTo: string): Promise<FinanceSummary> {
    const days = await this.getSalesByDay(dateFrom, dateTo);
    const revenue = days.reduce((s, d) => s + d.revenue, 0);
    const netPayout = days.reduce((s, d) => s + d.netPayout, 0);
    const commissions = revenue - netPayout;
    return { revenue, commissions, logistics: 0, penalties: 0, netPayout };
  }

  async getFinanceRecords(dateFrom: string, dateTo: string): Promise<FinanceRecord[]> {
    try {
      const resp = await this.client.get(`/campaigns/${this.campaignId}/stats/orders`, {
        params: { dateFrom, dateTo },
      });
      const orders: any[] = resp.data?.result?.orders ?? [];
      const bySkuTitle: Record<string, FinanceRecord> = {};
      for (const o of orders) {
        for (const item of o.items ?? []) {
          const sku = item.offerId ?? '';
          const title = item.offerName ?? '';
          if (!bySkuTitle[sku]) bySkuTitle[sku] = { sku, title, quantity: 0, revenue: 0, commission: 0, logistics: 0, penalty: 0, netPayout: 0 };
          const r = bySkuTitle[sku];
          const lineRevenue = (item.prices?.buyerTotalBeforeDiscount ?? item.prices?.buyerTotal ?? 0) * (item.count ?? 1);
          r.revenue += lineRevenue;
          r.commission += lineRevenue * 0.12;
          r.netPayout += lineRevenue * 0.88;
          r.quantity += item.count ?? 1;
        }
      }
      return Object.values(bySkuTitle).filter(r => r.revenue > 0);
    } catch {
      return [];
    }
  }

  // ---- FBS-specific (YM only) ----

  async getOrderLabel(orderId: string): Promise<string> {
    const resp = await this.client.get(
      `/campaigns/${this.campaignId}/orders/${orderId}/delivery/labels`,
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(resp.data as ArrayBuffer).toString('base64');
  }

  async confirmOrderShipment(orderId: string): Promise<void> {
    await this.client.put(
      `/campaigns/${this.campaignId}/orders/${orderId}/status`,
      { order: { status: 'PROCESSING', substatus: 'READY_TO_SHIP' } },
    );
  }

  async getNewOrders(): Promise<MarketplaceOrder[]> {
    return this._getOrders('PROCESSING,PENDING');
  }

  async getAllOrders(dateFrom?: string): Promise<MarketplaceOrder[]> {
    return this._getOrders(undefined, dateFrom);
  }

  private async _getOrders(status?: string, dateFrom?: string): Promise<MarketplaceOrder[]> {
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (dateFrom) params.fromDate = dateFrom.slice(0, 10);
      const resp = await this.client.get(`/campaigns/${this.campaignId}/orders`, { params });
      return (resp.data?.orders ?? []).map((o: any) => ({
        id: String(o.id),
        platform: 'ym' as any,
        status: o.status ?? '',
        createdAt: o.creationDate ?? '',
        items: (o.items ?? []).map((i: any): OrderLine => ({
          sku: i.offerId ?? '',
          offerId: i.offerId ?? '',
          title: i.offerName ?? '',
          quantity: i.count ?? 1,
          price: i.prices?.buyerPriceBeforeDiscount ?? i.prices?.buyerPrice ?? 0,
        })),
      }));
    } catch {
      return [];
    }
  }
}

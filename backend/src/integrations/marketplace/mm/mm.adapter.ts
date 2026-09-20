import axios, { AxiosInstance } from 'axios';
import {
  MarketplaceAdapter, ProductInfo, CompetitorPrice, ReviewOrQuestion,
  SalesDay, FinanceSummary, FinanceRecord, WarehouseStock, MarketplaceOrder, OrderLine,
} from '../base.adapter';

export interface MmCredentials {
  token: string;       // API-токен из кабинета Мегамаркета
  merchantId: string;  // ID продавца (merchant)
}

/**
 * Megamarket (СберМегаМаркет) Partner API adapter.
 * Docs: https://partner.megamarket.ru/api/
 * Auth: Authorization: Bearer {token}
 */
export class MmAdapter implements MarketplaceAdapter {
  readonly platform = 'mm' as const;

  private client: AxiosInstance;
  private merchantId: string;

  constructor(private credentials: MmCredentials) {
    this.merchantId = credentials.merchantId;
    this.client = axios.create({
      baseURL: 'https://api.megamarket.tech/api/merchantv1',
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  async validateCredentials(): Promise<void> {
    // Attempt to get merchant info — 401 on invalid token
    const resp = await this.client.post('/cabinet/merchant/info', {
      merchantId: this.merchantId,
    });
    if (!resp.data?.data) throw new Error('Invalid Megamarket credentials');
  }

  async getProducts(limit = 100): Promise<ProductInfo[]> {
    try {
      const resp = await this.client.post('/cabinet/goods/price/list', {
        merchantId: this.merchantId,
        limit,
        offset: 0,
      });
      const items: any[] = resp.data?.data?.items ?? [];
      return items.map((item: any) => ({
        sku: String(item.goodsId ?? item.offerId ?? ''),
        title: item.title ?? item.name ?? '',
        price: item.price ?? 0,
        stock: item.stock ?? 0,
        categoryId: item.categoryId ? String(item.categoryId) : undefined,
        description: item.description,
        photoUrls: item.imageUrls ?? [],
      }));
    } catch {
      return [];
    }
  }

  async getProduct(sku: string): Promise<ProductInfo> {
    try {
      const resp = await this.client.post('/cabinet/goods/info', {
        merchantId: this.merchantId,
        goodsId: sku,
      });
      const item = resp.data?.data ?? {};
      return {
        sku,
        title: item.title ?? item.name ?? '',
        price: item.price ?? 0,
        stock: item.stock ?? 0,
        description: item.description,
        photoUrls: item.imageUrls ?? [],
      };
    } catch {
      throw new Error(`Product ${sku} not found`);
    }
  }

  async getStockHistory(sku: string, days: number): Promise<{ date: string; sold: number }[]> {
    try {
      const dateTo = new Date().toISOString().slice(0, 10);
      const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const resp = await this.client.post('/order/get', {
        merchantId: this.merchantId,
        dateFrom,
        dateTo,
        limit: 1000,
      });
      const orders: any[] = resp.data?.data?.orders ?? [];
      const daily: Record<string, number> = {};
      for (const o of orders) {
        const date = (o.createdAt ?? '').slice(0, 10);
        if (!date) continue;
        const qty = (o.items ?? []).filter((i: any) => String(i.goodsId) === sku)
          .reduce((s: number, i: any) => s + (i.quantity ?? 1), 0);
        if (qty > 0) daily[date] = (daily[date] ?? 0) + qty;
      }
      return Object.entries(daily).map(([date, sold]) => ({ date, sold }));
    } catch {
      return [];
    }
  }

  async getCompetitorPrices(_sku: string): Promise<CompetitorPrice[]> {
    return [];
  }

  async getReviewsAndQuestions(limit = 20): Promise<ReviewOrQuestion[]> {
    try {
      const resp = await this.client.post('/cabinet/feedback/list', {
        merchantId: this.merchantId,
        limit,
        offset: 0,
      });
      const feedbacks: any[] = resp.data?.data?.feedbacks ?? [];
      return feedbacks.map((f: any) => ({
        id: String(f.id),
        type: 'review' as const,
        text: f.comment ?? f.text ?? '',
        authorName: f.customerName,
        rating: f.rating,
        createdAt: f.createdAt ?? '',
      }));
    } catch {
      return [];
    }
  }

  async updatePrice(sku: string, price: number): Promise<void> {
    await this.client.post('/cabinet/goods/price/update', {
      merchantId: this.merchantId,
      items: [{ goodsId: sku, price }],
    });
  }

  async updateProductContent(_sku: string, _title: string, _description: string): Promise<void> {
    // Megamarket content updates go through manual moderation — not available via API
  }

  async postReviewResponse(reviewId: string, text: string): Promise<void> {
    await this.client.post('/cabinet/feedback/reply', {
      merchantId: this.merchantId,
      feedbackId: reviewId,
      text,
    });
  }

  async getStockLevels(): Promise<{ sku: string; stock: number }[]> {
    try {
      const resp = await this.client.post('/cabinet/stock/get', {
        merchantId: this.merchantId,
        limit: 1000,
      });
      const items: any[] = resp.data?.data?.items ?? [];
      return items.map((i: any) => ({
        sku: String(i.goodsId ?? i.offerId ?? ''),
        stock: i.quantity ?? i.stock ?? 0,
      }));
    } catch {
      return [];
    }
  }

  async getWarehouseStocks(): Promise<WarehouseStock[]> {
    try {
      const resp = await this.client.post('/cabinet/stock/get', {
        merchantId: this.merchantId,
        limit: 1000,
      });
      const items: any[] = resp.data?.data?.items ?? [];
      const result: WarehouseStock[] = [];
      for (const i of items) {
        const qty = i.quantity ?? i.stock ?? 0;
        if (qty <= 0) continue;
        result.push({
          sku: String(i.goodsId ?? i.offerId ?? ''),
          title: i.title ?? i.name ?? '',
          warehouseType: 'fbs', // Megamarket works on FBS model (seller ships)
          warehouseName: i.warehouseName ?? 'Мегамаркет FBS',
          quantity: qty,
        });
      }
      return result;
    } catch {
      return [];
    }
  }

  async getSalesByDay(dateFrom: string, dateTo: string): Promise<SalesDay[]> {
    try {
      const resp = await this.client.post('/order/get', {
        merchantId: this.merchantId,
        dateFrom,
        dateTo,
        limit: 1000,
        statuses: ['DELIVERED'],
      });
      const orders: any[] = resp.data?.data?.orders ?? [];
      const daily: Record<string, SalesDay> = {};
      for (const o of orders) {
        const date = (o.createdAt ?? '').slice(0, 10);
        if (!date) continue;
        if (!daily[date]) daily[date] = { date, revenue: 0, orders: 0, returns: 0, commissions: 0, netPayout: 0 };
        const total = o.totalPrice ?? 0;
        daily[date].revenue += total;
        daily[date].orders += 1;
        daily[date].commissions += total * 0.10; // ~10% avg commission
        daily[date].netPayout += total * 0.90;
      }
      return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  async getFinanceSummary(dateFrom: string, dateTo: string): Promise<FinanceSummary> {
    try {
      const resp = await this.client.post('/finance/report', {
        merchantId: this.merchantId,
        dateFrom,
        dateTo,
      });
      const data = resp.data?.data ?? {};
      const revenue = data.totalRevenue ?? 0;
      const commission = data.totalCommission ?? 0;
      const logistics = data.totalLogistics ?? 0;
      const penalties = data.totalPenalties ?? 0;
      const netPayout = revenue - commission - logistics - penalties;
      return { revenue, commissions: commission, logistics, penalties, netPayout };
    } catch {
      // Fallback to order-based estimate
      const days = await this.getSalesByDay(dateFrom, dateTo);
      const revenue = days.reduce((s, d) => s + d.revenue, 0);
      const commissions = days.reduce((s, d) => s + d.commissions, 0);
      return { revenue, commissions, logistics: 0, penalties: 0, netPayout: revenue - commissions };
    }
  }

  async getFinanceRecords(dateFrom: string, dateTo: string): Promise<FinanceRecord[]> {
    try {
      const resp = await this.client.post('/order/get', {
        merchantId: this.merchantId,
        dateFrom,
        dateTo,
        limit: 1000,
        statuses: ['DELIVERED'],
      });
      const orders: any[] = resp.data?.data?.orders ?? [];
      const bySku: Record<string, FinanceRecord> = {};
      for (const o of orders) {
        for (const item of o.items ?? []) {
          const sku = String(item.goodsId ?? '');
          const title = item.goodsName ?? item.title ?? '';
          if (!bySku[sku]) bySku[sku] = { sku, title, quantity: 0, revenue: 0, commission: 0, logistics: 0, penalty: 0, netPayout: 0 };
          const r = bySku[sku];
          const lineRev = (item.price ?? 0) * (item.quantity ?? 1);
          r.revenue += lineRev;
          r.commission += lineRev * 0.10;
          r.netPayout += lineRev * 0.90;
          r.quantity += item.quantity ?? 1;
        }
      }
      return Object.values(bySku).filter(r => r.revenue > 0);
    } catch {
      return [];
    }
  }

  // ---- FBS-specific (MM only) ----

  async getOrderLabel(orderId: string): Promise<string> {
    const resp = await this.client.post(
      '/order/getLabel',
      { merchantId: this.merchantId, orderId },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(resp.data as ArrayBuffer).toString('base64');
  }

  async confirmOrder(orderId: string): Promise<void> {
    await this.client.post('/order/confirm', {
      merchantId: this.merchantId,
      orderId,
    });
  }

  async getNewOrders(): Promise<MarketplaceOrder[]> {
    return this._getOrders(['CONFIRMED', 'PROCESSING']);
  }

  async getAllOrders(dateFrom?: string): Promise<MarketplaceOrder[]> {
    return this._getOrders(undefined, dateFrom);
  }

  private async _getOrders(statuses?: string[], dateFrom?: string): Promise<MarketplaceOrder[]> {
    try {
      const body: Record<string, any> = { merchantId: this.merchantId, limit: 100 };
      if (statuses) body.statuses = statuses;
      if (dateFrom) body.dateFrom = dateFrom.slice(0, 10);
      const resp = await this.client.post('/order/get', body);
      return (resp.data?.data?.orders ?? []).map((o: any) => ({
        id: String(o.orderId ?? o.id ?? ''),
        platform: 'mm' as any,
        status: o.status ?? '',
        createdAt: o.createdAt ?? '',
        items: (o.items ?? []).map((i: any): OrderLine => ({
          sku: String(i.goodsId ?? ''),
          offerId: String(i.goodsId ?? ''),
          title: i.goodsName ?? i.title ?? '',
          quantity: i.quantity ?? 1,
          price: i.price ?? 0,
        })),
      }));
    } catch {
      return [];
    }
  }
}

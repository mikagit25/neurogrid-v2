import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getUserConnections } from '../connections/connections.service';
import { createAdapter } from '../../integrations/marketplace/factory';
import type { SalesDay } from '../../integrations/marketplace/base.adapter';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

// Simple in-memory cache keyed by userId+period to avoid hammering the marketplace APIs
const cache = new Map<string, { ts: number; data: unknown }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data as T);
  return fn().then((data) => { cache.set(key, { ts: Date.now(), data }); return data; });
}

function periodDates(period: string): { dateFrom: string; dateTo: string; days: number } {
  const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  return { dateFrom, dateTo, days };
}

// GET /api/analytics/summary?period=7d|30d|90d
analyticsRouter.get('/summary', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const period = (req.query.period as string) || '30d';

  try {
    const result = await cached(`${userId}:${period}`, async () => {
      const { dateFrom, dateTo } = periodDates(period);
      const connections = await getUserConnections(userId);

      const perConnection = await Promise.allSettled(
        connections.map(async (conn) => {
          const adapter = createAdapter(conn.platform, conn.credentials_enc);
          const [salesDays, finance, stocks, products] = await Promise.allSettled([
            adapter.getSalesByDay(dateFrom, dateTo),
            adapter.getFinanceSummary(dateFrom, dateTo),
            adapter.getStockLevels(),
            adapter.getProducts(100),
          ]);
          return {
            platform: conn.platform,
            connectionId: conn.id,
            name: conn.display_name,
            salesDays: salesDays.status === 'fulfilled' ? salesDays.value : [] as SalesDay[],
            finance: finance.status === 'fulfilled' ? finance.value : { revenue: 0, commissions: 0, logistics: 0, penalties: 0, netPayout: 0 },
            stocks: stocks.status === 'fulfilled' ? stocks.value : [] as { sku: string; stock: number }[],
            products: products.status === 'fulfilled' ? products.value : [],
          };
        })
      );

      // Merge daily chart data across all connections
      const chartMap: Record<string, { date: string; wb: number; ozon: number; total: number }> = {};
      const byPlatform: Record<string, { revenue: number; orders: number; returns: number; netPayout: number }> = {
        wb: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
        ozon: { revenue: 0, orders: 0, returns: 0, netPayout: 0 },
      };

      const productRevMap: Record<string, { sku: string; title: string; platform: string; revenue: number; orders: number }> = {};
      const stockAlerts: { sku: string; title: string; stock: number; platform: string; level: 'critical' | 'low' }[] = [];

      for (const r of perConnection) {
        if (r.status !== 'fulfilled') continue;
        const { platform, salesDays, finance, stocks, products } = r.value;

        byPlatform[platform].revenue += finance.revenue;
        byPlatform[platform].netPayout += finance.netPayout;

        for (const d of salesDays) {
          if (!chartMap[d.date]) chartMap[d.date] = { date: d.date, wb: 0, ozon: 0, total: 0 };
          chartMap[d.date][platform as 'wb' | 'ozon'] += d.revenue;
          chartMap[d.date].total += d.revenue;
          byPlatform[platform].orders += d.orders;
          byPlatform[platform].returns += d.returns;
        }

        // Build product revenue map (approximation: use orders * price for each product)
        // Here we just surface top products by listing from catalog
        for (const p of products) {
          if (!productRevMap[p.sku]) {
            productRevMap[p.sku] = { sku: p.sku, title: p.title, platform, revenue: 0, orders: 0 };
          }
        }

        // Stock alerts
        const stockMap: Record<string, number> = {};
        for (const s of stocks) stockMap[s.sku] = s.stock;
        for (const p of products) {
          const stock = stockMap[p.sku] ?? p.stock;
          if (stock <= 0) {
            stockAlerts.push({ sku: p.sku, title: p.title, stock, platform, level: 'critical' });
          } else if (stock <= 5) {
            stockAlerts.push({ sku: p.sku, title: p.title, stock, platform, level: 'low' });
          }
        }
      }

      const chart = Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date));
      const totalRevenue = byPlatform.wb.revenue + byPlatform.ozon.revenue;
      const totalOrders = byPlatform.wb.orders + byPlatform.ozon.orders;
      const totalReturns = byPlatform.wb.returns + byPlatform.ozon.returns;
      const totalNetPayout = byPlatform.wb.netPayout + byPlatform.ozon.netPayout;
      const returnRate = totalOrders > 0 ? Math.round((totalReturns / (totalOrders + totalReturns)) * 100) : 0;

      return {
        period, dateFrom, dateTo,
        summary: { totalRevenue, totalOrders, totalReturns, totalNetPayout, returnRate },
        byPlatform,
        chart,
        stockAlerts: stockAlerts.sort((a, b) => a.stock - b.stock).slice(0, 20),
        connections: perConnection
          .filter(r => r.status === 'fulfilled')
          .map(r => ({ id: (r as any).value.connectionId, name: (r as any).value.name, platform: (r as any).value.platform })),
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/analytics/cache — force refresh
analyticsRouter.delete('/cache', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  for (const key of cache.keys()) {
    if (key.startsWith(userId)) cache.delete(key);
  }
  res.json({ ok: true });
});

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getUserConnections, getConnectionById } from '../connections/connections.service';
import { createAdapter } from '../../integrations/marketplace/factory';
import { WbAdapter } from '../../integrations/marketplace/wb/wb.adapter';
import { OzonAdapter } from '../../integrations/marketplace/ozon/ozon.adapter';
import { YmAdapter } from '../../integrations/marketplace/ym/ym.adapter';
import { MmAdapter } from '../../integrations/marketplace/mm/mm.adapter';
import { callLlm } from '../../integrations/llm/llm.client';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

async function safeGetConn(connectionId: string, userId: string, res: Response) {
  try {
    return await getConnectionById(connectionId, userId);
  } catch {
    res.status(400).json({ error: 'Invalid connection id' });
    return null;
  }
}

// GET /api/orders?status=new|all&connectionId=...
ordersRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const connectionId = req.query.connectionId as string | undefined;
  const status = (req.query.status as string) || 'new';

  try {
    let connections;
    if (connectionId) {
      const c = await safeGetConn(connectionId, userId, res);
      if (c === null) return;
      connections = c ? [c] : [];
    } else {
      connections = await getUserConnections(userId);
    }

    const results = await Promise.allSettled(
      connections.map(async (conn) => {
        const adapter = createAdapter(conn.platform, conn.credentials_enc);
        const orders = status === 'new'
          ? await adapter.getNewOrders()
          : await adapter.getAllOrders();
        return orders.map((o) => ({
          ...o,
          connectionId: conn.id,
          connectionName: conn.display_name,
        }));
      })
    );

    const orders = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => (r as PromiseFulfilledResult<any[]>).value);

    res.json({ orders, total: orders.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- WB Supply flow ----

// POST /api/orders/wb/supply  — create supply and add orders to it
ordersRouter.post('/wb/supply', async (req: Request, res: Response) => {
  const { connectionId, orderIds, supplyName } = req.body;
  if (!connectionId || !Array.isArray(orderIds) || orderIds.length === 0) {
    res.status(400).json({ error: 'connectionId and orderIds required' });
    return;
  }

  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'wb') {
    res.status(400).json({ error: 'WB connection required' });
    return;
  }

  try {
    const adapter = createAdapter('wb', conn.credentials_enc) as WbAdapter;
    const name = supplyName || `Поставка ${new Date().toLocaleDateString('ru-RU')}`;
    const supplyId = await adapter.createSupply(name);
    await adapter.addOrdersToSupply(supplyId, orderIds.map(String));
    res.json({ supplyId, name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/wb/supply/:supplyId/close
ordersRouter.post('/wb/supply/:supplyId/close', async (req: Request, res: Response) => {
  const { connectionId } = req.body;
  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'wb') { res.status(400).json({ error: 'WB connection required' }); return; }

  try {
    const adapter = createAdapter('wb', conn.credentials_enc) as WbAdapter;
    await adapter.closeSupply(req.params.supplyId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/wb/supply/:supplyId/barcode?connectionId=...
ordersRouter.get('/wb/supply/:supplyId/barcode', async (req: Request, res: Response) => {
  const connectionId = req.query.connectionId as string;
  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'wb') { res.status(400).json({ error: 'WB connection required' }); return; }

  try {
    const adapter = createAdapter('wb', conn.credentials_enc) as WbAdapter;
    const base64 = await adapter.getSupplyBarcode(req.params.supplyId);
    res.json({ barcode: base64, supplyId: req.params.supplyId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/wb/stickers  — get sticker PNGs for selected orders
ordersRouter.post('/wb/stickers', async (req: Request, res: Response) => {
  const { connectionId, orderIds } = req.body;
  if (!connectionId || !Array.isArray(orderIds)) {
    res.status(400).json({ error: 'connectionId and orderIds required' });
    return;
  }

  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'wb') { res.status(400).json({ error: 'WB connection required' }); return; }

  try {
    const adapter = createAdapter('wb', conn.credentials_enc) as WbAdapter;
    const stickers = await adapter.getOrderStickers(orderIds.map(String));
    res.json({ stickers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Ozon FBS flow ----

// POST /api/orders/ozon/ship  — mark FBS order as shipped
ordersRouter.post('/ozon/ship', async (req: Request, res: Response) => {
  const { connectionId, postingNumber, packages } = req.body;
  if (!connectionId || !postingNumber) {
    res.status(400).json({ error: 'connectionId and postingNumber required' });
    return;
  }

  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'ozon') { res.status(400).json({ error: 'Ozon connection required' }); return; }

  try {
    const adapter = createAdapter('ozon', conn.credentials_enc) as OzonAdapter;
    // Default package: all items in one package if not specified
    const pkgs = packages ?? [{ products: req.body.items?.map((i: any) => ({ sku: parseInt(i.sku), quantity: i.quantity })) ?? [] }];
    await adapter.shipFbsOrder(postingNumber, pkgs);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/ozon/label  — get PDF label for FBS order(s)
ordersRouter.post('/ozon/label', async (req: Request, res: Response) => {
  const { connectionId, postingNumbers } = req.body;
  if (!connectionId || !Array.isArray(postingNumbers)) {
    res.status(400).json({ error: 'connectionId and postingNumbers required' });
    return;
  }

  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'ozon') { res.status(400).json({ error: 'Ozon connection required' }); return; }

  try {
    const adapter = createAdapter('ozon', conn.credentials_enc) as OzonAdapter;
    const pdfBase64 = await adapter.getFbsLabel(postingNumbers);
    res.json({ pdf: pdfBase64 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/ozon/sticker  — product sticker PDF
ordersRouter.post('/ozon/sticker', async (req: Request, res: Response) => {
  const { connectionId, postingNumber, skus } = req.body;
  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'ozon') { res.status(400).json({ error: 'Ozon connection required' }); return; }

  try {
    const adapter = createAdapter('ozon', conn.credentials_enc) as OzonAdapter;
    const pdfBase64 = await adapter.getProductSticker(postingNumber, skus);
    res.json({ pdf: pdfBase64 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Yandex Market FBS flow ----

// POST /api/orders/ym/label  — get PDF label for YM order
ordersRouter.post('/ym/label', async (req: Request, res: Response) => {
  const { connectionId, orderId } = req.body;
  if (!connectionId || !orderId) {
    res.status(400).json({ error: 'connectionId and orderId required' }); return;
  }
  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'ym') { res.status(400).json({ error: 'YM connection required' }); return; }

  try {
    const adapter = createAdapter('ym', conn.credentials_enc) as YmAdapter;
    const pdf = await adapter.getOrderLabel(orderId);
    res.json({ pdf });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/ym/confirm  — confirm order ready to ship
ordersRouter.post('/ym/confirm', async (req: Request, res: Response) => {
  const { connectionId, orderId } = req.body;
  if (!connectionId || !orderId) {
    res.status(400).json({ error: 'connectionId and orderId required' }); return;
  }
  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'ym') { res.status(400).json({ error: 'YM connection required' }); return; }

  try {
    const adapter = createAdapter('ym', conn.credentials_enc) as YmAdapter;
    await adapter.confirmOrderShipment(orderId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Megamarket FBS flow ----

// POST /api/orders/mm/label  — get PDF label for MM order
ordersRouter.post('/mm/label', async (req: Request, res: Response) => {
  const { connectionId, orderId } = req.body;
  if (!connectionId || !orderId) {
    res.status(400).json({ error: 'connectionId and orderId required' }); return;
  }
  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'mm') { res.status(400).json({ error: 'MM connection required' }); return; }

  try {
    const adapter = createAdapter('mm', conn.credentials_enc) as MmAdapter;
    const pdf = await adapter.getOrderLabel(orderId);
    res.json({ pdf });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/mm/confirm  — confirm MM order
ordersRouter.post('/mm/confirm', async (req: Request, res: Response) => {
  const { connectionId, orderId } = req.body;
  if (!connectionId || !orderId) {
    res.status(400).json({ error: 'connectionId and orderId required' }); return;
  }
  const conn = await safeGetConn(connectionId, req.user!.userId, res);
  if (!conn) return;
  if (conn.platform !== 'mm') { res.status(400).json({ error: 'MM connection required' }); return; }

  try {
    const adapter = createAdapter('mm', conn.credentials_enc) as MmAdapter;
    await adapter.confirmOrder(orderId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/export — CSV download of recent orders
ordersRouter.get('/export', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { from, to } = req.query as { from?: string; to?: string };
  const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = to || new Date().toISOString().slice(0, 10);

  const rows: any[] = [];
  try {
    const connections = await getUserConnections(userId);
    for (const conn of connections) {
      try {
        const adapter = createAdapter(conn.platform, conn.credentials_enc);
        const orders = await adapter.getAllOrders();
        for (const o of orders) {
          for (const item of o.items) {
            rows.push({
              platform: conn.platform,
              connection: conn.display_name,
              order_id: o.id,
              sku: item.sku,
              title: item.title ?? '',
              quantity: item.quantity ?? 1,
              price: item.price ?? 0,
              status: o.status,
              date: o.createdAt ?? '',
            });
          }
        }
      } catch { /* skip */ }
    }

    const header = 'Площадка,Магазин,Номер заказа,SKU,Название,Кол-во,Сумма,Статус,Дата\n';
    const body = rows.map((r) =>
      [r.platform, r.connection, r.order_id, r.sku, r.title, r.quantity, r.price, r.status, r.date]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(','),
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${dateFrom}-${dateTo}.csv"`);
    res.send('﻿' + header + body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/ai-advisor — AI fulfillment advisor based on current pending orders
ordersRouter.post('/ai-advisor', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const connections = await getUserConnections(userId);

    if (!connections.length) {
      res.json({
        summary: 'Нет подключённых магазинов. Подключите WB или Ozon для анализа заказов.',
        urgent_count: 0,
        bottlenecks: [],
        tips: [],
        actions: ['Подключите магазин на странице «Подключения»'],
        total_orders: 0,
        by_status: {},
        generated_at: new Date().toISOString(),
      });
      return;
    }

    // Fetch new/pending orders from all connections (with timeout protection)
    const results = await Promise.allSettled(
      connections.map(async (conn) => {
        const adapter = createAdapter(conn.platform, conn.credentials_enc);
        const orders = await adapter.getAllOrders();
        return orders.map((o: any) => ({ ...o, connectionName: conn.display_name, platform: conn.platform }));
      }),
    );

    const orders = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => (r as PromiseFulfilledResult<any[]>).value);

    const pending = orders.filter(o => ['new', 'awaiting_packaging', 'awaiting_deliver'].includes(o.status));

    if (!pending.length) {
      res.json({
        summary: `Нет новых заказов для обработки. Всего заказов в системе: ${orders.length}.`,
        urgent_count: 0,
        bottlenecks: [],
        tips: ['Продолжайте отслеживать поступление заказов'],
        actions: ['Проверьте историю заказов для анализа тенденций'],
        total_orders: orders.length,
        by_status: {},
        generated_at: new Date().toISOString(),
      });
      return;
    }

    // Aggregate stats
    const byStatus: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    for (const o of pending) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      byPlatform[o.platform] = (byPlatform[o.platform] || 0) + 1;
    }

    const newCount = byStatus['new'] || 0;
    const packagingCount = byStatus['awaiting_packaging'] || 0;
    const deliverCount = byStatus['awaiting_deliver'] || 0;

    // Sample: up to 10 most actionable orders
    const sample = pending
      .filter(o => o.status === 'new' || o.status === 'awaiting_packaging')
      .slice(0, 10)
      .map((o: any) => {
        const parts = [`статус=${o.status} платф=${o.platform}`];
        if (o.sku) parts.push(`SKU=${o.sku}`);
        if (o.price) parts.push(`цена=${o.price}₽`);
        return parts.join(' ');
      });

    const prompt = `/no_think Ты — операционный менеджер e-commerce. Дай советы по выполнению заказов.

Ожидают обработки: ${pending.length} заказов
По статусам: новые=${newCount}, к сборке=${packagingCount}, к отгрузке=${deliverCount}
По платформам: ${Object.entries(byPlatform).map(([p, n]) => `${p}=${n}`).join(', ')}

Примеры заказов (до 10):
${sample.join('\n')}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения об общей картине и приоритетах>",
  "bottlenecks": ["<узкое место 1>", "<узкое место 2>"],
  "tips": [
    {"title": "<название совета>", "description": "<подробнее>", "priority": "high|medium|low"}
  ],
  "batch_advice": "<совет по группировке заказов для эффективной сборки>",
  "actions": ["<конкретное действие 1>", "<конкретное действие 2>", "<конкретное действие 3>"]
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 1200);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      result = {
        summary: `${pending.length} заказов ожидают обработки: ${newCount} новых, ${packagingCount} к сборке, ${deliverCount} к отгрузке.`,
        bottlenecks: newCount > 10 ? ['Большое число необработанных новых заказов'] : [],
        tips: [
          { title: 'Начните со сборки', description: 'Сначала обработайте заказы в статусе "К сборке"', priority: 'high' as const },
          { title: 'Подтвердите новые', description: 'Подтвердите и начните сборку новых заказов', priority: 'medium' as const },
        ],
        batch_advice: 'Группируйте заказы с одинаковыми товарами для более быстрой сборки.',
        actions: ['Начните с обработки заказов "К сборке"', 'Подтвердите новые заказы', 'Создайте поставку для WB заказов'],
      };
    }

    res.json({
      ...result,
      total_orders: orders.length,
      pending_count: pending.length,
      urgent_count: newCount + packagingCount,
      by_status: byStatus,
      by_platform: byPlatform,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

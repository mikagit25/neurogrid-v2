import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getUserConnections, getConnectionById } from '../connections/connections.service';
import { createAdapter } from '../../integrations/marketplace/factory';
import { WbAdapter } from '../../integrations/marketplace/wb/wb.adapter';
import { OzonAdapter } from '../../integrations/marketplace/ozon/ozon.adapter';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

// GET /api/orders?status=new|all&connectionId=...
ordersRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const connectionId = req.query.connectionId as string | undefined;
  const status = (req.query.status as string) || 'new';

  try {
    let connections;
    if (connectionId) {
      const c = await getConnectionById(connectionId, userId);
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

  const conn = await getConnectionById(connectionId, req.user!.userId);
  if (!conn || conn.platform !== 'wb') {
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
  const conn = await getConnectionById(connectionId, req.user!.userId);
  if (!conn || conn.platform !== 'wb') { res.status(400).json({ error: 'WB connection required' }); return; }

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
  const conn = await getConnectionById(connectionId, req.user!.userId);
  if (!conn || conn.platform !== 'wb') { res.status(400).json({ error: 'WB connection required' }); return; }

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

  const conn = await getConnectionById(connectionId, req.user!.userId);
  if (!conn || conn.platform !== 'wb') { res.status(400).json({ error: 'WB connection required' }); return; }

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

  const conn = await getConnectionById(connectionId, req.user!.userId);
  if (!conn || conn.platform !== 'ozon') { res.status(400).json({ error: 'Ozon connection required' }); return; }

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

  const conn = await getConnectionById(connectionId, req.user!.userId);
  if (!conn || conn.platform !== 'ozon') { res.status(400).json({ error: 'Ozon connection required' }); return; }

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
  const conn = await getConnectionById(connectionId, req.user!.userId);
  if (!conn || conn.platform !== 'ozon') { res.status(400).json({ error: 'Ozon connection required' }); return; }

  try {
    const adapter = createAdapter('ozon', conn.credentials_enc) as OzonAdapter;
    const pdfBase64 = await adapter.getProductSticker(postingNumber, skus);
    res.json({ pdf: pdfBase64 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

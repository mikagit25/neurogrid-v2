import { db } from '../../db';
import { createAdapter } from '../../integrations/marketplace/factory';

async function getConnectionsWithCreds(userId: string) {
  const { rows } = await db.query(
    `SELECT id, platform, credentials_enc, display_name
     FROM marketplace_connections WHERE user_id = $1 AND status = 'active'`,
    [userId],
  );
  return rows;
}

export async function syncWarehouseStocks(userId: string): Promise<number> {
  const connections = await getConnectionsWithCreds(userId);
  if (!connections.length) return 0;

  let totalRows = 0;
  for (const conn of connections) {
    try {
      const adapter = createAdapter(conn.platform, conn.credentials_enc);
      const stocks = await adapter.getWarehouseStocks();

      if (!stocks.length) continue;

      // Delete old snapshots older than 2h for this connection, keep latest
      await db.query(
        `DELETE FROM stock_snapshots
         WHERE connection_id = $1
           AND snapped_at < now() - interval '2 hours'`,
        [conn.id],
      );

      // Insert new snapshot batch
      for (const s of stocks) {
        await db.query(
          `INSERT INTO stock_snapshots
             (user_id, connection_id, platform, sku, title, warehouse_type, warehouse_name, quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [userId, conn.id, conn.platform, s.sku, s.title, s.warehouseType, s.warehouseName, s.quantity],
        );
      }
      totalRows += stocks.length;
    } catch (err) {
      console.error(`[warehouse] sync error for connection ${conn.id}:`, err);
    }
  }
  return totalRows;
}

export async function getLatestStocks(userId: string) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (connection_id, platform, sku, warehouse_type)
       s.id,
       s.platform,
       s.sku,
       s.title,
       s.warehouse_type,
       s.warehouse_name,
       s.quantity,
       s.snapped_at,
       mc.display_name AS connection_name,
       COALESCE(uc.purchase_price, null) AS purchase_price,
       COALESCE(uc.title, s.title) AS catalog_title
     FROM stock_snapshots s
     JOIN marketplace_connections mc ON mc.id = s.connection_id
     LEFT JOIN user_catalog uc ON uc.user_id = s.user_id
       AND uc.platform = s.platform AND uc.sku = s.sku
     WHERE s.user_id = $1
       AND s.snapped_at > now() - interval '25 hours'
     ORDER BY connection_id, platform, sku, warehouse_type, s.snapped_at DESC`,
    [userId],
  );
  return rows;
}

export async function upsertCatalogItem(
  userId: string,
  platform: string,
  sku: string,
  data: { purchase_price?: number; title?: string; barcode?: string },
) {
  const { rows } = await db.query(
    `INSERT INTO user_catalog (user_id, platform, sku, title, barcode, purchase_price, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id, platform, sku) DO UPDATE
       SET title = COALESCE($4, user_catalog.title),
           barcode = COALESCE($5, user_catalog.barcode),
           purchase_price = COALESCE($6, user_catalog.purchase_price),
           updated_at = now()
     RETURNING *`,
    [userId, platform, sku, data.title ?? null, data.barcode ?? null, data.purchase_price ?? null],
  );
  return rows[0];
}

export async function getCatalog(userId: string) {
  const { rows } = await db.query(
    `SELECT id, platform, sku, title, barcode, purchase_price, updated_at
     FROM user_catalog WHERE user_id = $1
     ORDER BY platform, title`,
    [userId],
  );
  return rows;
}

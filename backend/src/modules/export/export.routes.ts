import { Router, Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';

export const exportRouter = Router();
exportRouter.use(authenticate);

// GET /api/export/full?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns a multi-sheet XLS file
exportRouter.get('/full', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const to   = String(req.query.to   ?? new Date().toISOString().slice(0, 10));
  const from = String(req.query.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));

  try {
    const [financeRows, pnlRows, stockRows, supplyRows] = await Promise.all([
      // Sheet 1: Finance records
      db.query(
        `SELECT fr.period_from AS "Дата", fr.platform AS "Площадка", fr.sku AS "SKU",
                fr.quantity AS "Кол-во",
                fr.revenue AS "Выручка", fr.commission AS "Комиссия",
                fr.logistics AS "Логистика", fr.penalty AS "Штрафы",
                fr.net_payout AS "Выплата"
         FROM finance_records fr
         WHERE fr.user_id = $1 AND fr.period_from BETWEEN $2 AND $3
         ORDER BY fr.period_from DESC, fr.platform, fr.sku
         LIMIT 10000`,
        [userId, from, to],
      ),
      // Sheet 2: P&L by SKU
      db.query(
        `SELECT fr.sku AS "SKU", fr.platform AS "Площадка",
                COALESCE(uc.title, ss.title) AS "Название",
                SUM(fr.quantity)::int AS "Продано шт.",
                ROUND(SUM(fr.revenue)::numeric, 2) AS "Выручка",
                ROUND(SUM(fr.commission)::numeric, 2) AS "Комиссия",
                ROUND(SUM(fr.logistics)::numeric, 2) AS "Логистика",
                ROUND(SUM(fr.penalty)::numeric, 2) AS "Штрафы",
                ROUND(SUM(fr.net_payout)::numeric, 2) AS "Выплата",
                ROUND(COALESCE(MAX(uc.purchase_price), 0) * SUM(fr.quantity)::numeric, 2) AS "Себестоимость",
                ROUND(SUM(fr.net_payout) - COALESCE(MAX(uc.purchase_price), 0) * SUM(fr.quantity)::numeric, 2) AS "Прибыль"
         FROM finance_records fr
         LEFT JOIN user_catalog uc ON uc.user_id = fr.user_id AND uc.sku = fr.sku AND uc.platform = fr.platform
         LEFT JOIN LATERAL (
           SELECT title FROM stock_snapshots
           WHERE user_id = fr.user_id AND sku = fr.sku AND platform = fr.platform
           ORDER BY snapped_at DESC LIMIT 1
         ) ss ON true
         WHERE fr.user_id = $1 AND fr.period_from BETWEEN $2 AND $3
         GROUP BY fr.sku, fr.platform, COALESCE(uc.title, ss.title)
         ORDER BY SUM(fr.revenue) DESC
         LIMIT 5000`,
        [userId, from, to],
      ),
      // Sheet 3: Current stock (latest snapshot per SKU)
      db.query(
        `SELECT DISTINCT ON (platform, sku, warehouse_type)
                platform AS "Площадка", sku AS "SKU", title AS "Название",
                warehouse_type AS "Склад", warehouse_name AS "Название склада",
                quantity AS "Остаток",
                snapped_at AS "Обновлено"
         FROM stock_snapshots
         WHERE user_id = $1
         ORDER BY platform, sku, warehouse_type, snapped_at DESC
         LIMIT 10000`,
        [userId],
      ),
      // Sheet 4: Catalog (purchase prices)
      db.query(
        `SELECT uc.platform AS "Площадка", uc.sku AS "SKU", uc.title AS "Название",
                uc.purchase_price AS "Себестоимость", uc.barcode AS "Штрихкод",
                uc.updated_at AS "Обновлено"
         FROM user_catalog uc
         WHERE uc.user_id = $1
         ORDER BY uc.platform, uc.title
         LIMIT 5000`,
        [userId],
      ),
    ]);

    const wb = XLSX.utils.book_new();

    const addSheet = (name: string, rows: any[]) => {
      if (!rows.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Нет данных за выбранный период']]), name);
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      // Auto-width columns
      const colWidths = Object.keys(rows[0]).map(key => ({ wch: Math.max(key.length, 12) }));
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet('Финансы', financeRows.rows);
    addSheet('P&L по товарам', pnlRows.rows);
    addSheet('Остатки склада', stockRows.rows);
    addSheet('Закупочные цены', supplyRows.rows);

    // Add meta sheet
    const metaWs = XLSX.utils.aoa_to_sheet([
      ['NeuroGrid — Экспорт данных'],
      ['Период:', `${from} — ${to}`],
      ['Дата выгрузки:', new Date().toLocaleString('ru-RU')],
      [],
      ['Лист', 'Содержимое'],
      ['Финансы', 'Финансовые записи из маркетплейсов (выручка, комиссии, логистика, штрафы, выплата)'],
      ['P&L по товарам', 'Агрегированный P&L по каждому SKU с учётом себестоимости'],
      ['Остатки склада', 'Текущие остатки по всем складам FBO/FBS'],
      ['Закупочные цены', 'Каталог товаров с закупочными ценами (себестоимость)'],
    ]);
    metaWs['!cols'] = [{ wch: 20 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, metaWs, 'Информация');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `neurogrid-export-${from}-${to}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { syncFinanceRecords, getFinanceSummary, getFinanceRecords } from './finance.service';

export const financeRouter = Router();
financeRouter.use(authenticate);

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

// GET /api/finance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
financeRouter.get('/summary', async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = defaultDateRange();
  const from = (req.query.from as string) || dateFrom;
  const to = (req.query.to as string) || dateTo;
  try {
    const summary = await getFinanceSummary(req.user!.userId, from, to);
    res.json({ summary, from, to });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/records?from=&to=&sku=
financeRouter.get('/records', async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = defaultDateRange();
  const from = (req.query.from as string) || dateFrom;
  const to = (req.query.to as string) || dateTo;
  const sku = req.query.sku as string | undefined;
  try {
    const records = await getFinanceRecords(req.user!.userId, from, to, sku);
    res.json({ records, from, to });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/sync?from=&to= — pull data from marketplace APIs
financeRouter.post('/sync', async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = defaultDateRange();
  const from = (req.query.from as string) || req.body?.from || dateFrom;
  const to = (req.query.to as string) || req.body?.to || dateTo;
  try {
    const count = await syncFinanceRecords(req.user!.userId, from, to);
    res.json({ ok: true, records: count, from, to });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

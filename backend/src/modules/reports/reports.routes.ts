import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getLatestReport, listReports, generateReportForUser } from './reports.service';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get('/latest', async (req: Request, res: Response) => {
  try {
    const report = await getLatestReport(req.user!.userId);
    res.json({ report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const reports = await listReports(req.user!.userId, Number(req.query.limit) || 12);
    res.json({ reports });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - 7 * 86400000);
    const report = await generateReportForUser(req.user!.userId, start, end);
    res.json({ report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getActs, getActForUser, generateActHtml } from './acts.service';

export const actsRouter = Router();
actsRouter.use(authenticate);

// GET /api/acts — list user's monthly acts
actsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const acts = await getActs(req.user!.userId);
    res.json({ acts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/acts/:id/html — download act as print-ready HTML
actsRouter.get('/:id/html', async (req: Request, res: Response) => {
  try {
    const act = await getActForUser(req.params.id, req.user!.userId);
    if (!act) { res.status(404).json({ error: 'Act not found' }); return; }
    const html = await generateActHtml(act);
    const num = act.act_number.replace(/[^A-Za-z0-9_\-]/g, '-');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="act-${num}.html"`);
    res.send(html);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

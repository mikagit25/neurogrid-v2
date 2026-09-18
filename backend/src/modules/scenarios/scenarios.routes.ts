import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getScenarios, getScenarioBySlug } from './scenarios.service';

export const scenariosRouter = Router();
scenariosRouter.use(authenticate);

scenariosRouter.get('/', async (req: Request, res: Response) => {
  try {
    const scenarios = await getScenarios(req.query.platform as string | undefined);
    res.json({ scenarios });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

scenariosRouter.get('/:slug', async (req: Request, res: Response) => {
  try {
    const scenario = await getScenarioBySlug(req.params.slug);
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found' });
      return;
    }
    res.json({ scenario });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

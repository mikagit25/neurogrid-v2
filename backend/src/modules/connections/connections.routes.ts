import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { addConnection, getUserConnections } from './connections.service';

export const connectionsRouter = Router();
connectionsRouter.use(authenticate);

const wbSchema = z.object({
  platform: z.literal('wb'),
  apiKey: z.string().min(1),
  statisticsApiKey: z.string().optional(),
  advertApiKey: z.string().optional(),
  displayName: z.string().optional(),
});

const ozonSchema = z.object({
  platform: z.literal('ozon'),
  clientId: z.string().min(1),
  apiKey: z.string().min(1),
  displayName: z.string().optional(),
});

const connectionSchema = z.discriminatedUnion('platform', [wbSchema, ozonSchema]);

connectionsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = connectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  const { platform, displayName, ...creds } = parsed.data as any;
  try {
    const connection = await addConnection(req.user!.userId, platform, creds, displayName);
    res.status(201).json({ connection });
  } catch (err: any) {
    if (err.response?.status === 401 || err.message?.includes('credentials')) {
      res.status(422).json({ error: 'Invalid marketplace credentials — check your API key' });
    } else {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
});

connectionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const connections = await getUserConnections(req.user!.userId);
    res.json({ connections });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

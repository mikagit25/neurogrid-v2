import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { createApiKey, listApiKeys, revokeApiKey } from './apikeys.service';

export const apiKeysRouter = Router();
apiKeysRouter.use(authenticate);

apiKeysRouter.get('/', async (req, res) => {
  const userId = req.user!.userId;
  res.json(await listApiKeys(userId));
});

apiKeysRouter.post('/', async (req, res) => {
  const userId = req.user!.userId;
  const { name, scopes, expires_at } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await createApiKey(userId, { name, scopes, expires_at });
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

apiKeysRouter.delete('/:id', async (req, res) => {
  const userId = req.user!.userId;
  await revokeApiKey(userId, req.params.id);
  res.json({ ok: true });
});

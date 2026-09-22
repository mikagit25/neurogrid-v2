import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  generateConnectToken, handleBotUpdate,
  getTelegramConnection, updateTelegramSettings, disconnectTelegram, notifyUser,
} from './telegram.service';

export const telegramRouter = Router();

// Called by Telegram webhook (public — no auth)
telegramRouter.post('/webhook', async (req, res) => {
  try {
    await handleBotUpdate(req.body);
  } catch (err: any) {
    console.error('[telegram] webhook error:', err.message);
  }
  res.sendStatus(200);
});

// Authenticated endpoints
telegramRouter.use(authenticate);

telegramRouter.get('/connection', async (req, res) => {
  const userId = req.user!.userId;
  const conn = await getTelegramConnection(userId);
  res.json(conn);
});

telegramRouter.post('/connect-token', async (req, res) => {
  const userId = req.user!.userId;
  try {
    const token = await generateConnectToken(userId);
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'neurogrid_bot';
    res.json({
      token,
      command: `/connect ${token}`,
      bot_url: `https://t.me/${botUsername}`,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

telegramRouter.put('/settings', async (req, res) => {
  const userId = req.user!.userId;
  await updateTelegramSettings(userId, req.body);
  res.json({ ok: true });
});

telegramRouter.delete('/connection', async (req, res) => {
  const userId = req.user!.userId;
  await disconnectTelegram(userId);
  res.json({ ok: true });
});

telegramRouter.post('/test', async (req, res) => {
  const userId = req.user!.userId;
  try {
    await notifyUser(userId, '🟢 <b>Тестовое сообщение NeuroGrid</b>\n\nУведомления настроены и работают корректно.');
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

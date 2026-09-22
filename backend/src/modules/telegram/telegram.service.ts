import crypto from 'crypto';
import axios from 'axios';
import { db } from '../../db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const BOT_URL = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!BOT_URL) return;
  try {
    await axios.post(`${BOT_URL}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }, { timeout: 10_000 });
  } catch (err: any) {
    console.error('[telegram] sendMessage error:', err.message);
  }
}

// ---- Connection flow ----

export async function generateConnectToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString('hex');
  await db.query(
    `INSERT INTO telegram_tokens (token, user_id, expires_at) VALUES ($1,$2,now() + INTERVAL '10 minutes')`,
    [token, userId],
  );
  return token;
}

export async function handleBotUpdate(update: any): Promise<void> {
  const msg = update.message;
  if (!msg) return;

  const chatId: number = msg.chat.id;
  const text: string = msg.text ?? '';

  // /connect <token>
  if (text.startsWith('/connect ')) {
    const token = text.split(' ')[1]?.trim();
    if (!token) { await sendMessage(chatId, 'Укажите токен: /connect <ваш_токен>'); return; }

    const { rows } = await db.query(
      `SELECT user_id FROM telegram_tokens WHERE token = $1 AND expires_at > now() AND used_at IS NULL`,
      [token],
    );
    if (!rows.length) { await sendMessage(chatId, '❌ Токен недействителен или истёк. Получите новый в настройках NeuroGrid.'); return; }

    const userId = rows[0].user_id;
    await db.query(`UPDATE telegram_tokens SET used_at = now() WHERE token = $1`, [token]);
    await db.query(
      `INSERT INTO telegram_connections (user_id, chat_id, username, first_name)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE SET chat_id=$2, username=$3, first_name=$4, is_active=true, connected_at=now()`,
      [userId, chatId, msg.from?.username ?? null, msg.from?.first_name ?? null],
    );
    await sendMessage(chatId, '✅ NeuroGrid подключён! Вы будете получать уведомления об алертах и важных событиях.');
    return;
  }

  if (text === '/start') {
    await sendMessage(chatId, '👋 Привет! Я — NeuroGrid бот.\n\nЧтобы подключиться, перейдите в <b>Настройки → Telegram</b> в вашем аккаунте NeuroGrid и скопируйте команду /connect.');
    return;
  }

  if (text === '/status') {
    const { rows } = await db.query(
      `SELECT u.email FROM telegram_connections tc JOIN users u ON u.id = tc.user_id WHERE tc.chat_id = $1 AND tc.is_active = true`,
      [chatId],
    );
    if (!rows.length) { await sendMessage(chatId, 'Аккаунт не подключён. Используйте /connect <токен>'); return; }
    await sendMessage(chatId, `✅ Подключён к аккаунту: ${rows[0].email}`);
    return;
  }

  if (text === '/disconnect') {
    await db.query(`UPDATE telegram_connections SET is_active = false WHERE chat_id = $1`, [chatId]);
    await sendMessage(chatId, '🔌 Отключено. До свидания!');
    return;
  }

  // Commands requiring an authenticated connection
  const { rows: conn } = await db.query(
    `SELECT user_id FROM telegram_connections WHERE chat_id = $1 AND is_active = true`,
    [chatId],
  );
  if (!conn.length) {
    await sendMessage(chatId, '⚠️ Аккаунт не подключён. Используйте /connect <токен>');
    return;
  }
  const userId = conn[0].user_id;

  if (text === '/stats') {
    const today = new Date().toISOString().slice(0, 10);
    const d7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const { rows: todayRows } = await db.query(
      `SELECT COALESCE(SUM(revenue),0)::numeric(12,2) AS rev, COALESCE(SUM(quantity),0)::int AS qty
       FROM finance_records WHERE user_id = $1 AND period_from = $2`,
      [userId, today],
    );
    const { rows: weekRows } = await db.query(
      `SELECT COALESCE(SUM(revenue),0)::numeric(12,2) AS rev, COALESCE(SUM(quantity),0)::int AS qty
       FROM finance_records WHERE user_id = $1 AND period_from >= $2 AND period_from <= $3`,
      [userId, d7, today],
    );
    const rev = Number(todayRows[0]?.rev ?? 0);
    const wRev = Number(weekRows[0]?.rev ?? 0);
    const qty = Number(todayRows[0]?.qty ?? 0);
    await sendMessage(chatId,
      `📊 <b>Статистика NeuroGrid</b>\n\n` +
      `Сегодня: <b>${rev.toLocaleString('ru-RU')} ₽</b> (${qty} шт.)\n` +
      `За 7 дней: <b>${wRev.toLocaleString('ru-RU')} ₽</b>`,
    );
    return;
  }

  if (text === '/stock') {
    const { rows } = await db.query(
      `SELECT platform, sku, title, SUM(quantity)::int AS qty
       FROM stock_snapshots
       WHERE user_id = $1 AND snapped_at > now() - interval '24 hours'
       GROUP BY platform, sku, title
       HAVING SUM(quantity) <= 5
       ORDER BY SUM(quantity) LIMIT 10`,
      [userId],
    );
    if (!rows.length) {
      await sendMessage(chatId, '✅ Критичных остатков нет (все > 5 шт.)');
    } else {
      const lines = rows.map((r: any) =>
        `• ${r.title || r.sku} (${String(r.platform).toUpperCase()}): <b>${r.qty} шт.</b>`,
      ).join('\n');
      await sendMessage(chatId, `⚠️ <b>Критичный сток (${rows.length} SKU):</b>\n\n${lines}`);
    }
    return;
  }

  if (text === '/alerts') {
    const { rows: events } = await db.query(
      `SELECT message, triggered_at FROM alert_events
       WHERE user_id = $1 AND is_read = false
       ORDER BY triggered_at DESC LIMIT 3`,
      [userId],
    );
    const { rows: cnt } = await db.query(
      `SELECT COUNT(*)::int AS n FROM alert_events WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    const total = cnt[0]?.n ?? 0;
    if (!total) {
      await sendMessage(chatId, '✅ Непрочитанных алертов нет');
    } else {
      const lines = events.map((e: any) => `• ${e.message}`).join('\n');
      await sendMessage(chatId,
        `🔔 <b>Непрочитанные алерты: ${total}</b>\n\n${lines}${total > 3 ? `\n\n…и ещё ${total - 3}` : ''}`,
      );
    }
    return;
  }

  if (text === '/report') {
    const d30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await db.query(
      `SELECT
         COALESCE(SUM(revenue),0)::numeric(12,2) AS revenue,
         COALESCE(SUM(net_payout),0)::numeric(12,2) AS payout,
         COALESCE(SUM(quantity),0)::int AS qty,
         COUNT(DISTINCT sku) AS skus
       FROM finance_records WHERE user_id = $1 AND period_from >= $2 AND period_to <= $3`,
      [userId, d30, today],
    );
    const r = rows[0] ?? {};
    const rev = Number(r.revenue ?? 0);
    const pay = Number(r.payout ?? 0);
    const margin = rev > 0 ? ((pay / rev) * 100).toFixed(1) : '—';
    await sendMessage(chatId,
      `📋 <b>Отчёт за 30 дней</b>\n\n` +
      `Выручка: <b>${rev.toLocaleString('ru-RU')} ₽</b>\n` +
      `Выплата: <b>${pay.toLocaleString('ru-RU')} ₽</b>\n` +
      `Маржа: <b>${margin}%</b>\n` +
      `Продано: <b>${r.qty ?? 0} шт.</b> по ${r.skus ?? 0} SKU`,
    );
    return;
  }

  if (text === '/help') {
    await sendMessage(chatId,
      `🤖 <b>Команды NeuroGrid бота</b>\n\n` +
      `/stats — выручка сегодня и за 7 дней\n` +
      `/stock — критичные остатки (≤5 шт.)\n` +
      `/alerts — непрочитанные алерты\n` +
      `/report — мини P&L за 30 дней\n` +
      `/status — статус подключения\n` +
      `/disconnect — отключить бота`,
    );
    return;
  }

  await sendMessage(chatId, '❓ Неизвестная команда. Используйте /help для списка команд.');
}

// ---- Notification sender (called from alert worker) ----

export async function notifyUser(userId: string, message: string): Promise<void> {
  const { rows } = await db.query(
    `SELECT chat_id FROM telegram_connections WHERE user_id = $1 AND is_active = true AND notify_alerts = true`,
    [userId],
  );
  for (const row of rows) {
    await sendMessage(Number(row.chat_id), message);
  }
}

export async function getTelegramConnection(userId: string) {
  const { rows } = await db.query(
    `SELECT chat_id, username, first_name, notify_alerts, notify_orders, notify_pnl,
            notify_low_stock, notify_competitors, is_active, connected_at
     FROM telegram_connections WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function updateTelegramSettings(userId: string, settings: {
  notify_alerts?: boolean; notify_orders?: boolean; notify_pnl?: boolean;
  notify_low_stock?: boolean; notify_competitors?: boolean;
}) {
  await db.query(
    `UPDATE telegram_connections
     SET notify_alerts      = COALESCE($2, notify_alerts),
         notify_orders      = COALESCE($3, notify_orders),
         notify_pnl         = COALESCE($4, notify_pnl),
         notify_low_stock   = COALESCE($5, notify_low_stock),
         notify_competitors = COALESCE($6, notify_competitors)
     WHERE user_id = $1`,
    [userId,
     settings.notify_alerts      ?? null,
     settings.notify_orders      ?? null,
     settings.notify_pnl         ?? null,
     settings.notify_low_stock   ?? null,
     settings.notify_competitors ?? null,
    ],
  );
}

export async function disconnectTelegram(userId: string) {
  await db.query(`UPDATE telegram_connections SET is_active = false WHERE user_id = $1`, [userId]);
}

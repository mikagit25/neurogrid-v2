import { db } from '../../db';
import { createBepaidCheckout } from '../../integrations/bepaid/bepaid.client';
import { config } from '../../config';

const CURRENCY = process.env.BEPAID_CURRENCY || 'RUB';
const MIN_TOPUP = 100;
const MAX_TOPUP = 100_000;

export async function initiateTopup(userId: string, amount: number) {
  if (!amount || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    throw Object.assign(
      new Error(`amount must be between ${MIN_TOPUP} and ${MAX_TOPUP}`),
      { status: 400 }
    );
  }
  if (!config.bepaid.shopId || !config.bepaid.secretKey) {
    throw Object.assign(
      new Error('Payment provider not configured — contact support to top up manually'),
      { status: 503 }
    );
  }

  const { rows } = await db.query(
    `INSERT INTO topup_requests (user_id, amount, currency)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, amount, CURRENCY]
  );
  const requestId: string = rows[0].id;

  const { token, redirectUrl } = await createBepaidCheckout(
    requestId,
    amount,
    CURRENCY,
    `Пополнение баланса NeuroGrid на ${amount} ${CURRENCY}`
  );

  await db.query(
    'UPDATE topup_requests SET bepaid_token = $1 WHERE id = $2',
    [token, requestId]
  );

  return { requestId, redirectUrl };
}

/** Called by bePaid webhook. Returns true if balance was credited (idempotent). */
export async function processWebhook(payload: unknown): Promise<boolean> {
  const body = payload as Record<string, unknown>;
  const txn = body.transaction as Record<string, unknown> | undefined;

  if (!txn) return false;

  const status = txn.status as string;
  const order = txn.order as Record<string, unknown> | undefined;
  const orderId = order?.id as string | undefined;
  const amountMinor = order?.amount as number | undefined;
  const currency = order?.currency as string | undefined;

  if (!orderId) return false;

  const { rows } = await db.query(
    `SELECT id, user_id, amount, currency, status
     FROM topup_requests WHERE id = $1`,
    [orderId]
  );
  if (!rows.length) return false;

  const req = rows[0];

  if (status === 'successful') {
    if (req.status === 'paid') return true; // already processed

    // Sanity-check amount (minor units)
    const expectedMinor = Math.round(parseFloat(req.amount) * 100);
    if (amountMinor !== undefined && amountMinor !== expectedMinor) {
      return false;
    }
    if (currency !== undefined && currency !== req.currency) {
      return false;
    }

    // Credit balance and record transaction atomically
    await db.query('BEGIN');
    try {
      await db.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [req.amount, req.user_id]
      );
      await db.query(
        `INSERT INTO transactions (user_id, type, amount, provider_id)
         VALUES ($1, 'topup', $2, $3)`,
        [req.user_id, req.amount, orderId]
      );
      await db.query(
        `UPDATE topup_requests SET status = 'paid', updated_at = now() WHERE id = $1`,
        [orderId]
      );
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
    return true;
  }

  if (status === 'failed' || status === 'expired' || status === 'canceled') {
    await db.query(
      `UPDATE topup_requests SET status = $1, updated_at = now() WHERE id = $2`,
      [status === 'failed' ? 'failed' : 'expired', orderId]
    );
  }

  return false;
}

export async function getTopupRequests(userId: string) {
  const { rows } = await db.query(
    `SELECT id, amount, currency, status, created_at
     FROM topup_requests WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
}

import { db } from '../../db';
import { createWebpayForm, verifyWebpaySignature } from '../../integrations/webpay/webpay.client';
import { config } from '../../config';
import { creditReferralCommission, creditFirstTopupBonus } from '../referrals/referrals.service';

const MIN_TOPUP = 100;
const MAX_TOPUP = 100_000;

export async function initiateTopup(userId: string, amount: number) {
  if (!amount || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    throw Object.assign(
      new Error(`amount must be between ${MIN_TOPUP} and ${MAX_TOPUP}`),
      { status: 400 }
    );
  }
  if (!config.webpay.storeId || !config.webpay.secretKey) {
    throw Object.assign(
      new Error('Payment provider not configured — contact support to top up manually'),
      { status: 503 }
    );
  }

  const currency = config.webpay.currency;

  const { rows } = await db.query(
    `INSERT INTO topup_requests (user_id, amount, currency)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, amount, currency]
  );
  const orderId: string = rows[0].id;

  const formData = createWebpayForm(
    orderId,
    amount,
    currency,
    `Пополнение баланса NeuroGrid на ${amount} ${currency}`,
  );

  return { orderId, formUrl: formData.formUrl, fields: formData.fields };
}

/**
 * Called by WebPay webhook (POST to /api/wallet/webhook/webpay).
 * payment_type === '1' or '4' means successful payment.
 * Returns true if balance was credited (idempotent).
 */
export async function processWebhook(body: Record<string, string>): Promise<boolean> {
  const isValid = verifyWebpaySignature(body, config.webpay.secretKey);
  if (!isValid) {
    console.warn('[webpay webhook] invalid signature');
    return false;
  }

  const { site_order_id: orderId, payment_type, amount: amountStr, transaction_id } = body;

  if (!orderId) return false;

  const isSuccess = payment_type === '1' || payment_type === '4';
  if (!isSuccess) {
    await db.query(
      `UPDATE topup_requests SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'pending'`,
      [orderId]
    );
    return false;
  }

  const { rows } = await db.query(
    `SELECT id, user_id, amount, currency, status FROM topup_requests WHERE id = $1`,
    [orderId]
  );
  if (!rows.length) return false;

  const req = rows[0];
  if (req.status === 'paid') return true;

  const expectedAmount = parseFloat(req.amount);
  const receivedAmount = parseFloat(amountStr ?? '0');
  if (Math.abs(receivedAmount - expectedAmount) > 0.01) {
    console.warn(`[webpay webhook] amount mismatch: expected ${expectedAmount}, got ${receivedAmount}`);
    return false;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [req.amount, req.user_id],
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, provider_id)
       VALUES ($1, 'topup', $2, $3)`,
      [req.user_id, req.amount, transaction_id ?? orderId],
    );
    await client.query(
      `UPDATE topup_requests SET status = 'paid', updated_at = now() WHERE id = $1`,
      [orderId],
    );
    await creditReferralCommission(req.user_id, parseFloat(req.amount), client);
    await creditFirstTopupBonus(req.user_id, parseFloat(req.amount), client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return true;
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

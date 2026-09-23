import { db } from '../../db';

export const REFERRAL_COMMISSION_PCT = 15;

export async function getReferralStats(userId: string) {
  const [referralsRes, earningsRes, codeRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS count
       FROM users WHERE referred_by = $1`,
      [userId],
    ),
    db.query(
      `SELECT COALESCE(SUM(earned_amount),0)::numeric AS total
       FROM referral_earnings WHERE referrer_id = $1`,
      [userId],
    ),
    db.query(
      `SELECT referral_code FROM users WHERE id = $1`,
      [userId],
    ),
  ]);

  const recentEarnings = await db.query(
    `SELECT re.earned_amount, re.topup_amount, re.commission_pct, re.created_at,
            u.email AS referred_email
     FROM referral_earnings re
     JOIN users u ON u.id = re.referred_id
     WHERE re.referrer_id = $1
     ORDER BY re.created_at DESC LIMIT 20`,
    [userId],
  );

  return {
    referral_code: codeRes.rows[0]?.referral_code ?? null,
    referred_count: referralsRes.rows[0]?.count ?? 0,
    total_earned: parseFloat(earningsRes.rows[0]?.total ?? '0'),
    commission_pct: REFERRAL_COMMISSION_PCT,
    recent_earnings: recentEarnings.rows,
  };
}

/** Call this after a successful topup to credit the referrer. */
export async function creditReferralCommission(
  referredUserId: string,
  topupAmount: number,
  client: any,
) {
  const { rows } = await client.query(
    `SELECT referred_by FROM users WHERE id = $1`,
    [referredUserId],
  );
  const referrerId = rows[0]?.referred_by;
  if (!referrerId) return;

  const earnedAmount = +((topupAmount * REFERRAL_COMMISSION_PCT) / 100).toFixed(2);
  if (earnedAmount <= 0) return;

  await client.query(
    `INSERT INTO referral_earnings (referrer_id, referred_id, topup_amount, commission_pct, earned_amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [referrerId, referredUserId, topupAmount, REFERRAL_COMMISSION_PCT, earnedAmount],
  );

  await client.query(
    `UPDATE users SET balance = balance + $1 WHERE id = $2`,
    [earnedAmount, referrerId],
  );

  await client.query(
    `INSERT INTO transactions (user_id, type, amount)
     VALUES ($1, 'topup', $2)`,
    [referrerId, earnedAmount],
  );

  await client.query(
    `INSERT INTO notifications (user_id, type, text)
     VALUES ($1, 'referral', $2)`,
    [referrerId,
     `💰 Реферальный бонус: +${earnedAmount} ₽ — ваш приглашённый пополнил баланс на ${topupAmount} ₽`],
  );
}

export async function applyPromoCode(userId: string, code: string) {
  const { rows } = await db.query(
    `SELECT * FROM promo_codes
     WHERE upper(code) = upper($1)
       AND is_active = true
       AND (expires_at IS NULL OR expires_at > now())
       AND (max_uses IS NULL OR used_count < max_uses)`,
    [code],
  );
  if (!rows.length) {
    throw Object.assign(new Error('Промо-код недействителен или исчерпан'), { status: 404 });
  }
  const promo = rows[0];

  // Check not already used by this user
  const { rows: usedRows } = await db.query(
    `SELECT id FROM promo_code_uses WHERE promo_code_id = $1 AND user_id = $2`,
    [promo.id, userId],
  );
  if (usedRows.length) {
    throw Object.assign(new Error('Вы уже использовали этот промо-код'), { status: 409 });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users SET balance = balance + $1 WHERE id = $2`,
      [promo.reward_amount, userId],
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount) VALUES ($1, 'topup', $2)`,
      [userId, promo.reward_amount],
    );
    await client.query(
      `INSERT INTO promo_code_uses (promo_code_id, user_id, reward_amount)
       VALUES ($1, $2, $3)`,
      [promo.id, userId, promo.reward_amount],
    );
    await client.query(
      `UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1`,
      [promo.id],
    );
    await client.query(
      `INSERT INTO notifications (user_id, type, text) VALUES ($1, 'promo', $2)`,
      [userId, `🎁 Промо-код активирован: +${promo.reward_amount} ₽ зачислено на баланс`],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { reward_amount: promo.reward_amount, description: promo.description };
}

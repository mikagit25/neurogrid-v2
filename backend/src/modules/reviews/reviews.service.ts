import { db } from '../../db';
import { callLlm } from '../../integrations/llm/llm.client';
import { createAdapter } from '../../integrations/marketplace/factory';

// ---- Sync reviews from marketplace ----

export async function syncReviews(userId: string): Promise<number> {
  const { rows: connections } = await db.query(
    `SELECT id, platform, credentials_enc FROM marketplace_connections WHERE user_id = $1 AND status = 'active'`,
    [userId],
  );

  let synced = 0;
  for (const conn of connections) {
    try {
      const adapter = createAdapter(conn.platform, conn.credentials_enc);
      if (typeof (adapter as any).getReviewsAndQuestions !== 'function') continue;

      const items: any[] = await (adapter as any).getReviewsAndQuestions(100);

      for (const r of items) {
        if (r.type !== 'review') continue; // skip questions
        const reviewDate = r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null;
        const sku = r.sku ?? r.nmId ?? r.product_id ?? null;

        await db.query(
          `INSERT INTO product_reviews
             (user_id, connection_id, platform, sku, external_id, author, rating, text, is_answered, review_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (connection_id, external_id) DO UPDATE SET
             rating=$7, text=$8, is_answered=$9, synced_at=now()`,
          [userId, conn.id, conn.platform, sku ?? '', String(r.id), r.authorName ?? null,
           r.rating ?? null, r.text ?? null, false, reviewDate],
        );
        synced++;
      }
    } catch (err: any) {
      console.error(`[reviews] sync conn=${conn.id}:`, err.message);
    }
  }
  return synced;
}

// ---- AI Reply Generation ----

export async function generateReply(userId: string, reviewId: string): Promise<string> {
  const { rows: rv } = await db.query(
    `SELECT pr.*, rrs.tone, rrs.brand_name, rrs.custom_instructions
     FROM product_reviews pr
     LEFT JOIN review_reply_settings rrs ON rrs.user_id = pr.user_id
     WHERE pr.id = $1 AND pr.user_id = $2`,
    [reviewId, userId],
  );
  if (!rv.length) throw new Error('Review not found');
  const r = rv[0];

  const tone = r.tone ?? 'friendly';
  const brand = r.brand_name ? `Бренд: ${r.brand_name}.` : '';
  const extra = r.custom_instructions ? `Дополнительные инструкции: ${r.custom_instructions}` : '';

  const ratingText = `${r.rating ?? '?'}/5 звёзд`;
  const reviewBody = [r.text, r.pros ? `Плюсы: ${r.pros}` : '', r.cons ? `Минусы: ${r.cons}` : '']
    .filter(Boolean).join('\n');

  const toneMap: Record<string, string> = {
    friendly: 'дружелюбный и тёплый',
    formal: 'официальный и профессиональный',
    empathetic: 'эмпатичный и заботливый',
  };

  const prompt = `Ты — менеджер по работе с клиентами интернет-магазина. ${brand}
Твой тон: ${toneMap[tone] ?? 'дружелюбный'}.
${extra}

Отзыв покупателя (${ratingText}):
${reviewBody}

Напиши ответ на этот отзыв. Требования:
- 2–5 предложений, не более 300 символов
- Поблагодари за отзыв
- Если есть минусы — предложи решение или извинись
- Не упоминай конкурентов
- Только текст ответа, без вводных слов`;

  const { text } = await callLlm([{ role: 'user', content: prompt }]);

  // Save the AI draft
  await db.query(
    `UPDATE product_reviews SET ai_reply = $1 WHERE id = $2 AND user_id = $3`,
    [text.trim(), reviewId, userId],
  );

  return text.trim();
}

export async function approveReply(userId: string, reviewId: string, replyText?: string): Promise<void> {
  const finalText = replyText?.trim() || null;

  if (finalText) {
    await db.query(
      `UPDATE product_reviews SET reply_approved = true, replied_at = now(), ai_reply = $1, is_answered = true
       WHERE id = $2 AND user_id = $3`,
      [finalText, reviewId, userId],
    );
  } else {
    await db.query(
      `UPDATE product_reviews SET reply_approved = true, replied_at = now(), is_answered = true
       WHERE id = $1 AND user_id = $2`,
      [reviewId, userId],
    );
  }

  // Try to publish to marketplace
  const { rows } = await db.query(
    `SELECT pr.external_id, pr.platform, mc.credentials_enc
     FROM product_reviews pr
     JOIN marketplace_connections mc ON mc.id = pr.connection_id
     WHERE pr.id = $1 AND pr.user_id = $2`,
    [reviewId, userId],
  );
  if (!rows.length) return;
  const { external_id, platform, credentials_enc } = rows[0];
  const text = finalText || (await db.query(`SELECT ai_reply FROM product_reviews WHERE id = $1`, [reviewId])).rows[0]?.ai_reply;
  if (!text) return;

  try {
    const { createAdapter } = await import('../../integrations/marketplace/factory');
    const adapter = createAdapter(platform, credentials_enc);
    if (typeof (adapter as any).postReviewResponse === 'function') {
      await (adapter as any).postReviewResponse(external_id, text);
    }
  } catch (err: any) {
    console.error(`[reviews] postReviewResponse failed:`, err.message);
  }
}

// ---- Settings ----

export async function getReplySettings(userId: string) {
  const { rows } = await db.query(
    `SELECT * FROM review_reply_settings WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? { tone: 'friendly', brand_name: null, custom_instructions: null, auto_approve: false };
}

export async function saveReplySettings(
  userId: string,
  data: { tone?: string; brand_name?: string; custom_instructions?: string; auto_approve?: boolean },
) {
  await db.query(
    `INSERT INTO review_reply_settings (user_id, tone, brand_name, custom_instructions, auto_approve, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id) DO UPDATE SET
       tone=$2, brand_name=$3, custom_instructions=$4, auto_approve=$5, updated_at=now()`,
    [userId, data.tone ?? 'friendly', data.brand_name ?? null, data.custom_instructions ?? null, data.auto_approve ?? false],
  );
}

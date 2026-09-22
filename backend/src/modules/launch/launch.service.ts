import { db } from '../../db';

const DEFAULT_STEPS = [
  { step_order: 1, type: 'listing_update', title: 'Оптимизация листинга', description: 'Добавьте все фото, заполните описание и характеристики, включите ключевые слова в заголовок' },
  { step_order: 2, type: 'price_discount', title: 'Запустить скидку', description: 'Установите скидку 15–25% для привлечения первых покупателей' },
  { step_order: 3, type: 'ad_boost', title: 'Запустить рекламу', description: 'Создайте автокампанию с дневным бюджетом 500–1000 ₽' },
  { step_order: 4, type: 'seo_optimization', title: 'SEO-проверка позиций', description: 'Добавьте целевые ключи в трекер и отслеживайте позиции ежедневно' },
  { step_order: 5, type: 'review_request', title: 'Сбор отзывов', description: 'Настройте авто-ответы на отзывы, попросите лояльных покупателей оставить отзыв' },
];

export async function createLaunchCampaign(
  userId: string,
  data: { name: string; platform: string; sku: string; target_sales?: number; target_position?: number; budget?: number; notes?: string },
) {
  const { rows } = await db.query(
    `INSERT INTO launch_campaigns (user_id, name, platform, sku, target_sales, target_position, budget, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, data.name, data.platform, data.sku, data.target_sales ?? null, data.target_position ?? null, data.budget ?? null, data.notes ?? null],
  );
  const campaign = rows[0];

  // Seed default steps
  for (const step of DEFAULT_STEPS) {
    await db.query(
      `INSERT INTO launch_steps (campaign_id, step_order, type, title, description) VALUES ($1,$2,$3,$4,$5)`,
      [campaign.id, step.step_order, step.type, step.title, step.description],
    );
  }

  return campaign;
}

export async function getLaunchCampaigns(userId: string) {
  const { rows } = await db.query(
    `SELECT lc.*,
       json_agg(ls.* ORDER BY ls.step_order) AS steps
     FROM launch_campaigns lc
     LEFT JOIN launch_steps ls ON ls.campaign_id = lc.id
     WHERE lc.user_id = $1
     GROUP BY lc.id
     ORDER BY lc.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getLaunchCampaign(userId: string, campaignId: string) {
  const { rows } = await db.query(
    `SELECT lc.*,
       json_agg(ls.* ORDER BY ls.step_order) AS steps
     FROM launch_campaigns lc
     LEFT JOIN launch_steps ls ON ls.campaign_id = lc.id
     WHERE lc.id = $1 AND lc.user_id = $2
     GROUP BY lc.id`,
    [campaignId, userId],
  );
  return rows[0] ?? null;
}

export async function updateLaunchCampaign(
  userId: string,
  campaignId: string,
  data: Partial<{ name: string; status: string; target_sales: number; target_position: number; budget: number; notes: string }>,
) {
  const fields: string[] = [];
  const vals: any[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { fields.push(`${k} = $${i++}`); vals.push(v); }
  }
  if (!fields.length) return;

  if (data.status === 'active') { fields.push(`started_at = COALESCE(started_at, now())`); }
  if (data.status === 'completed') { fields.push(`completed_at = now()`); }

  vals.push(campaignId, userId);
  await db.query(
    `UPDATE launch_campaigns SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
    vals,
  );
}

export async function updateLaunchStep(
  userId: string,
  stepId: string,
  data: { status?: string; meta?: object },
) {
  const fields: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if (data.status !== undefined) {
    fields.push(`status = $${i++}`);
    vals.push(data.status);
    if (data.status === 'done') { fields.push(`completed_at = now()`); }
    if (data.status === 'in_progress') { fields.push(`scheduled_at = now()`); }
  }
  if (data.meta !== undefined) { fields.push(`meta = $${i++}`); vals.push(JSON.stringify(data.meta)); }
  if (!fields.length) return;

  vals.push(stepId, userId);
  await db.query(
    `UPDATE launch_steps ls SET ${fields.join(', ')}
     FROM launch_campaigns lc
     WHERE ls.id = $${i++} AND ls.campaign_id = lc.id AND lc.user_id = $${i}`,
    vals,
  );
}

export async function deleteLaunchCampaign(userId: string, campaignId: string) {
  await db.query(`DELETE FROM launch_campaigns WHERE id = $1 AND user_id = $2`, [campaignId, userId]);
}

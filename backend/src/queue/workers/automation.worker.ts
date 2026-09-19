import { Job, Worker } from 'bullmq';
import { db } from '../../db';
import { redis } from '../queue';
import { markRunResult } from '../../modules/automations/automations.service';
import { createAdapter } from '../../integrations/marketplace/factory';

export function startAutomationWorker(): Worker {
  const worker = new Worker('automation', processAutomationJob, {
    connection: redis,
    concurrency: 3,
  });
  worker.on('failed', (job, err) => {
    console.error(`[automation worker] job ${job?.id} failed:`, err.message);
  });
  return worker;
}
import { callLlm } from '../../integrations/llm/llm.client';

function llm(prompt: string) {
  return callLlm([{ role: 'user', content: prompt }]).then((r) => r.text);
}

export interface AutomationJobData {
  automationId: string;
}

export async function processAutomationJob(job: Job<AutomationJobData>): Promise<void> {
  const { automationId } = job.data;

  const { rows } = await db.query(
    `SELECT a.*, u.id AS uid, u.balance,
            mc.platform, mc.credentials_enc
     FROM user_automations a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN marketplace_connections mc ON mc.id = a.connection_id
     WHERE a.id = $1 AND a.enabled = true`,
    [automationId]
  );
  if (!rows[0]) return;

  const auto = rows[0];

  try {
    await runAutomationScenario(auto);
    await markRunResult(automationId, 'success');
  } catch (err) {
    console.error(`[automation] ${automationId} failed:`, (err as Error).message);
    await markRunResult(automationId, 'error');
    await db.query(
      `INSERT INTO notifications (user_id, type, text)
       VALUES ($1, 'automation_error', $2)`,
      [auto.user_id, `Автоматизация "${auto.scenario_slug}" завершилась с ошибкой: ${(err as Error).message}`]
    );
  }
}

async function runAutomationScenario(auto: any): Promise<void> {
  const adapter = auto.credentials_enc
    ? createAdapter(auto.platform, auto.credentials_enc)
    : null;

  switch (auto.scenario_slug) {
    case 'review-drafts':
      return runReviewDrafts(auto, adapter);
    case 'price-monitor':
      return runPriceMonitor(auto, adapter);
    case 'stock-forecast':
      return runStockForecast(auto, adapter);
    case 'seo-audit':
      return runSeoAudit(auto, adapter);
    case 'card-generator':
      return runCardGenerator(auto, adapter);
    default:
      await db.query(
        `INSERT INTO notifications (user_id, type, text)
         VALUES ($1, 'automation_skipped', $2)`,
        [auto.user_id, `Сценарий "${auto.scenario_slug}" не поддерживает автономный режим`]
      );
  }
}

/* ── Review drafts ────────────────────────────────────────────────────────── */
async function runReviewDrafts(auto: any, adapter: any): Promise<void> {
  if (!adapter) throw new Error('Marketplace connection required');

  const reviews = await adapter.getReviewsAndQuestions(20);
  if (reviews.length === 0) {
    await markRunResult(auto.id, 'skipped');
    return;
  }

  let published = 0;
  let drafted = 0;

  for (const review of reviews) {
    const prompt = `Ты — менеджер интернет-магазина на маркетплейсе.
Напиши вежливый, персонализированный ответ на отзыв покупателя.
Оценка: ${review.rating ?? 'не указана'}/5.
Текст отзыва: "${review.text}"
Требования: ответ на русском языке, 2-4 предложения, без шаблонных фраз типа "уважаемый клиент", предложи решение если есть проблема.`;

    const response = await llm(prompt);

    if (auto.auto_apply) {
      await adapter.postReviewResponse(review.id, response);
      published++;
    } else {
      // Save as notification with draft text for manual approval
      await db.query(
        `INSERT INTO notifications (user_id, type, text, meta)
         VALUES ($1, 'review_draft', $2, $3)`,
        [
          auto.user_id,
          `Готов ответ на отзыв (${review.rating ?? '?'}/5): "${review.text?.slice(0, 80)}…"`,
          JSON.stringify({ reviewId: review.id, draft: response, platform: auto.platform }),
        ]
      );
      drafted++;
    }
  }

  const summary = auto.auto_apply
    ? `Автоответы на отзывы: опубликовано ${published} ответов на ${auto.platform.toUpperCase()}`
    : `Подготовлено ${drafted} черновиков ответов на отзывы ${auto.platform.toUpperCase()}. Откройте уведомления для публикации.`;

  await db.query(
    `INSERT INTO notifications (user_id, type, text)
     VALUES ($1, 'automation_done', $2)`,
    [auto.user_id, summary]
  );
}

/* ── Price monitor ────────────────────────────────────────────────────────── */
async function runPriceMonitor(auto: any, adapter: any): Promise<void> {
  if (!adapter) throw new Error('Marketplace connection required');

  const products = await adapter.getProducts(50);
  if (products.length === 0) { await markRunResult(auto.id, 'skipped'); return; }

  const productList = products.slice(0, 20).map((p: any) =>
    `- ${p.title} (арт. ${p.sku}): ваша цена ${p.price} ₽`
  ).join('\n');

  const prompt = `Ты — аналитик продаж на маркетплейсе ${auto.platform === 'wb' ? 'WildBerries' : 'Ozon'}.
Проанализируй следующие товары продавца и дай конкретные рекомендации по ценообразованию.
Для каждого товара укажи: нужно ли менять цену, на сколько процентов и почему.
Учитывай сезонность и общие тренды.

Товары:
${productList}

Дай структурированный отчёт на русском языке.`;

  const report = await llm(prompt);

  await db.query(
    `INSERT INTO notifications (user_id, type, text)
     VALUES ($1, 'price_report', $2)`,
    [auto.user_id, `📊 Ежедневный отчёт по ценам (${auto.platform.toUpperCase()}):\n\n${report}`]
  );
}

/* ── Stock forecast ───────────────────────────────────────────────────────── */
async function runStockForecast(auto: any, adapter: any): Promise<void> {
  if (!adapter) throw new Error('Marketplace connection required');

  const stocks = await adapter.getStockLevels();
  if (stocks.length === 0) { await markRunResult(auto.id, 'skipped'); return; }

  // Fetch 30-day sales for each SKU
  const forecasts: string[] = [];
  for (const { sku, stock } of stocks.slice(0, 30)) {
    const history = await adapter.getStockHistory(sku, 30);
    const totalSold = history.reduce((s: number, d: any) => s + d.sold, 0);
    const dailyRate = totalSold / 30;
    if (dailyRate === 0) continue;
    const daysLeft = Math.floor(stock / dailyRate);
    if (daysLeft <= 14) {
      forecasts.push(`Арт. ${sku}: остаток ${stock} шт, скорость продаж ${dailyRate.toFixed(1)}/день → закончится через ~${daysLeft} дней`);
    }
  }

  if (forecasts.length === 0) {
    await db.query(
      `INSERT INTO notifications (user_id, type, text) VALUES ($1, 'stock_ok', $2)`,
      [auto.user_id, `✅ Остатки в норме — угрозы out-of-stock нет (${auto.platform.toUpperCase()})`]
    );
    return;
  }

  await db.query(
    `INSERT INTO notifications (user_id, type, text) VALUES ($1, 'stock_alert', $2)`,
    [auto.user_id, `⚠️ Угроза out-of-stock (${auto.platform.toUpperCase()}):\n${forecasts.join('\n')}\n\nПополните запасы!`]
  );
}

/* ── SEO audit ────────────────────────────────────────────────────────────── */
async function runSeoAudit(auto: any, adapter: any): Promise<void> {
  if (!adapter) throw new Error('Marketplace connection required');

  const products = await adapter.getProducts(30);
  if (products.length === 0) { await markRunResult(auto.id, 'skipped'); return; }

  const productList = products.slice(0, 15).map((p: any) =>
    `- ${p.title}${p.description ? ` | описание: "${p.description.slice(0, 100)}"` : ' | описание: ОТСУТСТВУЕТ'}`
  ).join('\n');

  const prompt = `Ты — SEO-специалист по маркетплейсам.
Проверь карточки товаров и выяви проблемы: отсутствие ключевых слов, короткие описания, слабые заголовки.
Дай список из топ-5 карточек, которые нужно улучшить в первую очередь, с конкретными правками.

Товары:
${productList}

Ответ на русском языке.`;

  const report = await llm(prompt);

  await db.query(
    `INSERT INTO notifications (user_id, type, text) VALUES ($1, 'seo_report', $2)`,
    [auto.user_id, `🔍 Еженедельный SEO-аудит (${auto.platform.toUpperCase()}):\n\n${report}`]
  );
}

/* ── Card generator (bulk) ────────────────────────────────────────────────── */
async function runCardGenerator(auto: any, adapter: any): Promise<void> {
  if (!adapter) throw new Error('Marketplace connection required');

  const products = await adapter.getProducts(10);
  if (products.length === 0) { await markRunResult(auto.id, 'skipped'); return; }

  let updated = 0;
  const errors: string[] = [];

  for (const product of products) {
    try {
      const prompt = `Напиши SEO-оптимизированное описание товара для ${auto.platform === 'wb' ? 'WildBerries' : 'Ozon'}.
Товар: ${product.title}
${product.description ? `Текущее описание: ${product.description}` : ''}
Требования: 150-300 слов, включи ключевые слова, опиши преимущества и характеристики.
Верни только текст описания, без заголовков.`;

      const newDescription = await llm(prompt);

      if (auto.auto_apply) {
        await adapter.updateProductContent(product.sku, product.title, newDescription);
        updated++;
      }
    } catch (e) {
      errors.push(`${product.sku}: ${(e as Error).message}`);
    }
  }

  const msg = auto.auto_apply
    ? `📝 Карточки обновлены автоматически: ${updated}/${products.length} товаров (${auto.platform.toUpperCase()})`
    : `📝 Сгенерированы описания для ${products.length} товаров. Включите авто-применение для автоматической загрузки.`;

  await db.query(
    `INSERT INTO notifications (user_id, type, text) VALUES ($1, 'card_update', $2)`,
    [auto.user_id, msg]
  );
}

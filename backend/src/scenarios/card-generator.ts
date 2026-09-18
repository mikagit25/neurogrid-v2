import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';
import { callLlm } from '../integrations/llm/llm.client';

/**
 * Сценарий 1: Генератор карточки товара
 * Вход: название, характеристики, категория, площадка
 * Выход: заголовок, буллеты, описание готовое для загрузки
 */
export class CardGeneratorExecutor implements ScenarioExecutor {
  readonly slug = 'card-generator';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const { inputData } = ctx;
    const productName = String(inputData.productName ?? '');
    const characteristics = String(inputData.characteristics ?? '');
    const category = String(inputData.category ?? '');
    const platform = String(inputData.platform ?? 'wb');

    if (!productName) throw new Error('productName is required');

    const platformGuide =
      platform === 'ozon'
        ? 'Ozon: заголовок до 200 символов, описание до 6000 символов, 5–15 буллетов по 250 символов каждый. Алгоритм Ozon хорошо ранжирует точные ключевые слова в заголовке.'
        : 'Wildberries: заголовок до 60 символов — это критично, описание до 1000 символов, характеристики заполняются отдельно. Главное ключевое слово — в самом начале заголовка.';

    const { text } = await callLlm([
      {
        role: 'system',
        content:
          'Ты опытный копирайтер для российских маркетплейсов. Пишешь продающие карточки товаров строго по требованиям площадки. Отвечаешь только валидным JSON без markdown.',
      },
      {
        role: 'user',
        content: `Создай карточку товара для ${platform.toUpperCase()}.

Товар: ${productName}
Категория: ${category || 'не указана'}
Характеристики: ${characteristics || 'не указаны'}

Требования площадки:
${platformGuide}

Верни JSON:
{
  "title": "...",
  "bullets": ["...", "...", "...", "...", "..."],
  "description": "...",
  "keywords": ["...", "...", "..."]
}`,
      },
    ]);

    let parsed: Record<string, unknown>;
    try {
      // Strip potential markdown code blocks from LLM response
      const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new Error(`LLM вернул невалидный JSON: ${text.slice(0, 200)}`);
    }

    return {
      title: parsed.title,
      bullets: parsed.bullets,
      description: parsed.description,
      keywords: parsed.keywords,
      platform,
      note: platform === 'ozon'
        ? 'Скопируйте заголовок, описание и буллеты в соответствующие поля карточки Ozon.'
        : 'Заголовок — строго до 60 символов. Характеристики загружайте через шаблон Excel WB.',
    };
  }
}

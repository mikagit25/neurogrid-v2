import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';
import { callLlm } from '../integrations/llm/llm.client';

/**
 * Сценарий 6: SEO-аудит карточки
 * Вход: SKU товара
 * Выход: список конкретных правок с приоритетом
 */
export class SeoAuditExecutor implements ScenarioExecutor {
  readonly slug = 'seo-audit';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const { adapter, inputData } = ctx;
    const sku = String(inputData.sku ?? '');

    if (!sku) throw new Error('sku is required');
    if (!adapter) throw new Error('Marketplace connection required');

    const product = await adapter.getProduct(sku);

    const { text } = await callLlm([
      {
        role: 'system',
        content: 'Ты SEO-специалист по маркетплейсам. Анализируешь карточки товаров и даёшь конкретные, приоритетные рекомендации по улучшению. Отвечаешь только валидным JSON без markdown.',
      },
      {
        role: 'user',
        content: `Сделай SEO-аудит карточки товара на ${adapter.platform.toUpperCase()}.

Заголовок: "${product.title}"
Описание: "${product.description ?? '(не заполнено)'}"
Цена: ${product.price} ₽

Проверь:
1. Наличие ключевых слов в заголовке
2. Длина и насыщенность описания
3. Структура заголовка под алгоритмы ${adapter.platform.toUpperCase()}
4. Общие SEO-проблемы карточки

Верни JSON:
{
  "score": число от 1 до 10,
  "issues": [
    {
      "priority": "high|medium|low",
      "field": "название поля",
      "problem": "описание проблемы",
      "fix": "конкретная правка"
    }
  ],
  "summary": "общий вывод в 1-2 предложениях"
}`,
      },
    ]);

    let audit: Record<string, unknown>;
    try {
      const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      audit = JSON.parse(clean);
    } catch {
      throw new Error(`LLM вернул невалидный JSON: ${text.slice(0, 200)}`);
    }

    return {
      sku,
      productTitle: product.title,
      score: audit.score,
      issues: audit.issues,
      summary: audit.summary,
    };
  }
}

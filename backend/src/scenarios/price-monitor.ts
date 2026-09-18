import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';
import { callLlm } from '../integrations/llm/llm.client';

/**
 * Сценарий 2: Мониторинг цен конкурентов
 * Вход: SKU товара, текущая цена, границы цены (min/max)
 * Выход: отчёт + рекомендация (без автоизменения цены)
 */
export class PriceMonitorExecutor implements ScenarioExecutor {
  readonly slug = 'price-monitor';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const { adapter, inputData } = ctx;
    const sku = String(inputData.sku ?? '');
    const minPrice = Number(inputData.minPrice ?? 0);
    const maxPrice = Number(inputData.maxPrice ?? 0);

    if (!sku) throw new Error('sku is required');
    if (!adapter) throw new Error('Marketplace connection required');

    const [product, competitors] = await Promise.all([
      adapter.getProduct(sku),
      adapter.getCompetitorPrices(sku).catch(() => []),
    ]);

    const competitorSummary = competitors.length > 0
      ? competitors.map(c => `${c.competitorName}: ${c.price} ₽`).join('\n')
      : 'Данные о конкурентах недоступны через API этой площадки';

    const { text } = await callLlm([
      {
        role: 'system',
        content: 'Ты аналитик по ценообразованию на маркетплейсах. Даёшь конкретные, обоснованные рекомендации по цене. Отвечаешь только валидным JSON без markdown.',
      },
      {
        role: 'user',
        content: `Товар: ${product.title} (SKU: ${sku})
Текущая цена продавца: ${product.price} ₽
Допустимый диапазон: ${minPrice > 0 ? `от ${minPrice} ₽` : 'не задан'} ${maxPrice > 0 ? `до ${maxPrice} ₽` : ''}
Площадка: ${adapter.platform.toUpperCase()}

Цены конкурентов:
${competitorSummary}

Верни JSON:
{
  "recommendation": "raise|lower|keep",
  "suggestedPrice": число или null,
  "reasoning": "...",
  "urgency": "high|medium|low"
}`,
      },
    ]);

    let advice: Record<string, unknown>;
    try {
      const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      advice = JSON.parse(clean);
    } catch {
      throw new Error(`LLM вернул невалидный JSON: ${text.slice(0, 200)}`);
    }

    return {
      sku,
      productTitle: product.title,
      currentPrice: product.price,
      competitors,
      recommendation: advice.recommendation,
      suggestedPrice: advice.suggestedPrice,
      reasoning: advice.reasoning,
      urgency: advice.urgency,
      applyUrl: `Чтобы изменить цену, перейдите в личный кабинет ${adapter.platform.toUpperCase()}.`,
      note: 'Цена не изменена автоматически — требуется подтверждение.',
    };
  }
}

import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';
import { callLlm } from '../integrations/llm/llm.client';
import { ReviewOrQuestion } from '../integrations/marketplace/base.adapter';

/**
 * Сценарий 3: Черновики ответов на вопросы и отзывы
 * Вход: опционально фильтр по типу (review/question), лимит
 * Выход: список неотвеченных + черновики (без автоотправки)
 */
export class ReviewDraftsExecutor implements ScenarioExecutor {
  readonly slug = 'review-drafts';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const { adapter, inputData } = ctx;
    const limit = Math.min(Number(inputData.limit ?? 10), 30);
    const storeTone = String(inputData.storeTone ?? 'вежливый и профессиональный');

    if (!adapter) throw new Error('Marketplace connection required');

    const items: ReviewOrQuestion[] = await adapter.getReviewsAndQuestions(limit);
    if (items.length === 0) {
      return { drafts: [], message: 'Нет новых неотвеченных отзывов и вопросов.' };
    }

    const drafts = await Promise.all(
      items.map(async (item) => {
        const { text: draft } = await callLlm(
          [
            {
              role: 'system',
              content: `Ты помощник продавца на маркетплейсе. Тон магазина: ${storeTone}. Составляешь корректные, живые ответы. Не используй шаблонные фразы типа "Уважаемый клиент". Отвечай только текстом черновика, без пояснений.`,
            },
            {
              role: 'user',
              content: item.type === 'review'
                ? `Составь ответ на отзыв (рейтинг ${item.rating ?? '?'}/5):\n"${item.text}"`
                : `Составь ответ на вопрос покупателя:\n"${item.text}"`,
            },
          ],
          undefined,
          512
        );

        return {
          id: item.id,
          type: item.type,
          originalText: item.text,
          rating: item.rating,
          authorName: item.authorName,
          createdAt: item.createdAt,
          draft,
        };
      })
    );

    return {
      drafts,
      total: drafts.length,
      note: 'Черновики не отправлены автоматически — проверьте и отправьте вручную в личном кабинете.',
    };
  }
}

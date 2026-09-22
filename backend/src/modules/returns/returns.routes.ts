import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getReturns, getReturnStats, updateReturn, getReturnAnalytics, createReturn } from './returns.service';
import { callLlm } from '../../integrations/llm/llm.client';

export const returnsRouter = Router();
returnsRouter.use(authenticate);

returnsRouter.get('/', async (req, res) => {
  const userId = req.user!.userId;
  const { status, platform, sku, limit } = req.query;
  res.json(await getReturns(userId, { status: status as string, platform: platform as string, sku: sku as string, limit: limit ? Number(limit) : undefined }));
});

returnsRouter.get('/stats', async (req, res) => {
  const userId = req.user!.userId;
  res.json(await getReturnStats(userId));
});

returnsRouter.get('/analytics', async (req, res) => {
  const userId = req.user!.userId;
  res.json(await getReturnAnalytics(userId));
});

returnsRouter.post('/', async (req, res) => {
  const userId = req.user!.userId;
  const { platform, sku } = req.body;
  if (!platform || !sku) return res.status(400).json({ error: 'platform, sku required' });
  try { res.json(await createReturn(userId, req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

returnsRouter.patch('/:id', async (req, res) => {
  const userId = req.user!.userId;
  await updateReturn(userId, req.params.id, req.body);
  res.json({ ok: true });
});

// POST /api/returns/analyze — AI analysis of return patterns
returnsRouter.post('/analyze', async (req, res) => {
  const userId = req.user!.userId;

  const [analytics, stats] = await Promise.all([
    getReturnAnalytics(userId),
    getReturnStats(userId),
  ]);

  if (!analytics.length) {
    res.json({ summary: 'Недостаточно данных для AI-анализа.', insights: [] }); return;
  }

  const topItems = analytics.slice(0, 15).map((r: any) =>
    `${r.platform?.toUpperCase()} SKU=${r.sku} title="${r.title || ''}" returns=${r.return_count} rate=${r.return_rate ?? '?'}% reason="${r.top_reason || 'неизвестна'}"`,
  ).join('\n');

  const systemPrompt = `Ты аналитик маркетплейсов. Анализируй данные о возвратах и давай конкретные рекомендации на русском языке. Отвечай строго в JSON.`;

  const userPrompt = `Данные о возвратах за последние 90 дней:
Всего возвратов: ${stats.total}, ожидают: ${stats.pending}, возврат выдан: ${stats.total_refunded} ₽
SKU с возвратами: ${stats.skus_affected}

Топ позиций по возвратам:
${topItems}

Дай анализ в JSON:
{
  "summary": "1-2 предложения о ситуации",
  "insights": [
    { "type": "warning|tip|success", "title": "короткий заголовок", "text": "детальное описание и рекомендация" }
  ],
  "top_problem_sku": "sku или null",
  "recommended_actions": ["действие 1", "действие 2", "действие 3"]
}`;

  try {
    const { text: raw } = await callLlm([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 'claude-haiku-4-5-20251001', 1024);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (parsed) {
      res.json(parsed);
    } else {
      throw new Error('no json');
    }
  } catch {
    res.json({
      summary: `За период обработано ${stats.total} возвратов по ${stats.skus_affected} SKU. Общая сумма возвратов: ${Number(stats.total_refunded).toLocaleString('ru')} ₽.`,
      insights: analytics.slice(0, 3).map((r: any) => ({
        type: Number(r.return_rate) > 15 ? 'warning' : 'tip',
        title: r.title || r.sku,
        text: `${r.return_count} возвратов (${Number(r.return_rate ?? 0).toFixed(1)}%). Главная причина: ${r.top_reason || 'не указана'}.`,
      })),
      top_problem_sku: analytics[0]?.sku ?? null,
      recommended_actions: [
        'Проверить описания и размерные таблицы для позиций с высоким процентом возвратов',
        'Свяжитесь с поставщиком по позициям с браком',
        'Добавьте фотографии реального товара для снижения расхождений с ожиданиями',
      ],
    });
  }
});

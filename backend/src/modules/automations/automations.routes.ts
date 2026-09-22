import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import {
  getAutomations,
  upsertAutomation,
  updateAutomation,
  deleteAutomation,
} from './automations.service';
import { Queue } from 'bullmq';
import { redis } from '../../queue/queue';
import { callLlm } from '../../integrations/llm/llm.client';
import { db } from '../../db';

export const automationsRouter = Router();
automationsRouter.use(authenticate);

automationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const automations = await getAutomations(req.user!.userId);
    res.json({ automations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

automationsRouter.post('/', async (req: Request, res: Response) => {
  const { scenarioSlug, connectionId, enabled, schedule, auto_apply, settings } = req.body;
  if (!scenarioSlug) { res.status(400).json({ error: 'scenarioSlug required' }); return; }
  try {
    const automation = await upsertAutomation(req.user!.userId, scenarioSlug, connectionId ?? null, {
      enabled, schedule, auto_apply, settings,
    });
    res.status(201).json({ automation });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

automationsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const automation = await updateAutomation(req.params.id, req.user!.userId, req.body);
    res.json({ automation });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

automationsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteAutomation(req.params.id, req.user!.userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Manual trigger
automationsRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const queue = new Queue('automation', { connection: redis });
    await queue.add('run-automation', { automationId: req.params.id }, { priority: 1 });
    await queue.close();
    res.json({ ok: true, queued: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automations/ai-health — AI health check of all automations
automationsRouter.post('/ai-health', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const [automations, runsRes] = await Promise.all([
      getAutomations(userId),
      db.query(
        `SELECT s.slug, sr.status, sr.error_message, sr.finished_at
         FROM scenario_runs sr
         JOIN scenarios s ON s.id = sr.scenario_id
         WHERE sr.user_id = $1 AND sr.created_at > now() - interval '7 days'
         ORDER BY sr.finished_at DESC
         LIMIT 100`,
        [userId],
      ),
    ]);

    const KNOWN_SLUGS = ['review-drafts', 'card-generator', 'price-monitor', 'stock-forecast', 'seo-audit', 'photo-generator', 'infographic-generator'];

    const enabledCount = automations.filter(a => a.enabled).length;
    const errorCount   = automations.filter(a => a.last_run_status === 'error').length;
    const neverRan     = automations.filter(a => a.enabled && !a.last_run_at).length;
    const disabledCount = KNOWN_SLUGS.filter(slug => !automations.find(a => a.scenario_slug === slug && a.enabled)).length;

    // Count error rates per slug from recent runs
    const runsBySlug: Record<string, { total: number; errors: number; lastError?: string }> = {};
    for (const r of runsRes.rows) {
      if (!runsBySlug[r.slug]) runsBySlug[r.slug] = { total: 0, errors: 0 };
      runsBySlug[r.slug].total++;
      if (r.status === 'error') {
        runsBySlug[r.slug].errors++;
        if (!runsBySlug[r.slug].lastError) runsBySlug[r.slug].lastError = r.error_message?.slice(0, 120) ?? 'неизвестная ошибка';
      }
    }

    if (!automations.length) {
      res.json({
        summary: 'Автоматизации не настроены. Включите нужные агенты для автоматической работы.',
        health: 'inactive',
        issues: ['Нет активных автоматизаций'],
        per_automation: [],
        actions: ['Включите агент "Ответы на отзывы" для автоматической работы с клиентами', 'Включите "Прогноз остатков" для предупреждений об out-of-stock', 'Включите "Мониторинг цен" для анализа конкурентов'],
        enabled_count: 0,
        error_count: 0,
        disabled_count: KNOWN_SLUGS.length,
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const fmtAuto = (a: any) => {
      const runs = runsBySlug[a.scenario_slug];
      const errRate = runs ? Math.round((runs.errors / runs.total) * 100) : 0;
      const parts = [`"${a.scenario_slug}" включён=${a.enabled} расписание=${a.schedule} авто-публ=${a.auto_apply}`];
      if (a.last_run_at) parts.push(`последний=${new Date(a.last_run_at).toISOString().slice(0, 16)} статус=${a.last_run_status ?? '—'}`);
      if (runs) parts.push(`запусков(7д)=${runs.total} ошибок=${runs.errors}(${errRate}%)`);
      if (runs?.lastError) parts.push(`посл.ошибка="${runs.lastError}"`);
      return parts.join(' ');
    };

    const prompt = `/no_think Ты — DevOps-аналитик автоматизаций e-commerce. Проверь состояние агентов.

Всего настроено: ${automations.length} автоматизаций, включено: ${enabledCount}, ошибок: ${errorCount}, никогда не запускались: ${neverRan}
Не настроено агентов из доступных: ${disabledCount}

Состояние каждой автоматизации:
${automations.map(fmtAuto).join('\n')}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения о состоянии автоматизаций>",
  "health": "<good|warning|poor>",
  "issues": ["<проблема 1>", "<проблема 2>"],
  "per_automation": [
    {
      "slug": "<slug>",
      "status": "<ok|warning|error|inactive>",
      "comment": "<краткий вывод об этой автоматизации>",
      "action": "<что сделать — оставить/включить/проверить настройки/etc>"
    }
  ],
  "actions": ["<системное действие 1>", "<системное действие 2>", "<системное действие 3>"]
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 1500);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      result = {
        summary: `${enabledCount} из ${automations.length} автоматизаций включено. ${errorCount > 0 ? `${errorCount} с ошибками.` : 'Ошибок нет.'}`,
        health: errorCount > 0 ? 'warning' : enabledCount === 0 ? 'poor' : 'good',
        issues: [
          ...(errorCount > 0 ? [`${errorCount} автоматизаций завершились с ошибкой`] : []),
          ...(neverRan > 0 ? [`${neverRan} включённых агентов ещё ни разу не запускались`] : []),
          ...(disabledCount > 3 ? [`${disabledCount} полезных агентов не настроены`] : []),
        ],
        per_automation: automations.map(a => ({
          slug: a.scenario_slug,
          status: a.last_run_status === 'error' ? 'error' : !a.enabled ? 'inactive' : 'ok',
          comment: a.last_run_status === 'error' ? 'Последний запуск завершился с ошибкой' : !a.enabled ? 'Отключён' : 'Работает нормально',
          action: a.last_run_status === 'error' ? 'Проверьте настройки и попробуйте запустить вручную' : !a.enabled ? 'Рассмотрите включение' : 'Оставить как есть',
        })),
        actions: ['Проверьте и исправьте ошибочные автоматизации', 'Включите агентов, которые ещё не настроены', 'Настройте авто-публикацию для доверенных агентов'],
      };
    }

    res.json({
      ...result,
      enabled_count: enabledCount,
      error_count: errorCount,
      disabled_count: disabledCount,
      never_ran: neverRan,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

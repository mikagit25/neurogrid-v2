import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { callLlm } from '../../integrations/llm/llm.client';

export const activityRouter = Router();
activityRouter.use(authenticate);

// GET /api/activity?limit=50 — merged activity feed from multiple sources
activityRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
  try {
    const { rows } = await db.query(`
      SELECT * FROM (

        SELECT
          'price_change'    AS type,
          pcl.id::text      AS id,
          pcl.applied_at    AS ts,
          pcl.platform,
          pcl.sku,
          pcl.title,
          json_build_object(
            'old_price', pcl.old_price,
            'new_price', pcl.new_price,
            'reason',    pcl.reason,
            'rule_name', pr.name
          )                 AS meta
        FROM price_change_log pcl
        LEFT JOIN pricing_rules pr ON pr.id = pcl.rule_id
        WHERE pcl.user_id = $1

        UNION ALL

        SELECT
          'scenario_run'    AS type,
          sr.id::text,
          COALESCE(sr.finished_at, sr.created_at) AS ts,
          NULL              AS platform,
          NULL              AS sku,
          s.title           AS title,
          json_build_object(
            'status', sr.status,
            'cost',   sr.cost,
            'scenario_slug', s.slug
          )                 AS meta
        FROM scenario_runs sr
        LEFT JOIN scenarios s ON s.id = sr.scenario_id
        WHERE sr.user_id = $1

        UNION ALL

        SELECT
          'alert'           AS type,
          ae.id::text,
          ae.triggered_at   AS ts,
          ae.platform,
          ae.sku,
          ae.sku_title      AS title,
          json_build_object(
            'alert_type', ae.type,
            'message',    ae.message,
            'value',      ae.value,
            'threshold',  ae.threshold
          )                 AS meta
        FROM alert_events ae
        WHERE ae.user_id = $1

      ) combined
      ORDER BY ts DESC
      LIMIT $2
    `, [userId, limit]);

    res.json({
      events: rows.map((r: any) => ({
        type:     r.type,
        id:       r.id,
        ts:       r.ts,
        platform: r.platform,
        sku:      r.sku,
        title:    r.title,
        meta:     r.meta,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activity/ai-patterns — AI pattern detection in recent activity
activityRouter.post('/ai-patterns', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const { rows } = await db.query(`
      SELECT * FROM (
        SELECT 'price_change' AS type, pcl.applied_at AS ts, pcl.platform, pcl.sku, pcl.title,
          json_build_object('old_price', pcl.old_price, 'new_price', pcl.new_price, 'reason', pcl.reason) AS meta
        FROM price_change_log pcl WHERE pcl.user_id = $1 AND pcl.applied_at > now() - interval '14 days'
        UNION ALL
        SELECT 'scenario_run' AS type, COALESCE(sr.finished_at, sr.created_at) AS ts, NULL, NULL, s.title,
          json_build_object('status', sr.status, 'cost', sr.cost, 'slug', s.slug) AS meta
        FROM scenario_runs sr LEFT JOIN scenarios s ON s.id = sr.scenario_id
        WHERE sr.user_id = $1 AND sr.created_at > now() - interval '14 days'
        UNION ALL
        SELECT 'alert' AS type, ae.triggered_at AS ts, ae.platform, ae.sku, ae.sku_title,
          json_build_object('alert_type', ae.type, 'message', ae.message, 'value', ae.value, 'threshold', ae.threshold) AS meta
        FROM alert_events ae WHERE ae.user_id = $1 AND ae.triggered_at > now() - interval '14 days'
      ) combined ORDER BY ts DESC LIMIT 100
    `, [userId]);

    if (!rows.length) {
      res.json({
        summary: 'Нет активности за последние 14 дней.',
        patterns: [],
        anomalies: [],
        insights: [],
        actions: ['Подключите маркетплейсы для отслеживания событий'],
        total_events: 0,
        generated_at: new Date().toISOString(),
      });
      return;
    }

    // Compute quick stats for context
    const typeCounts: Record<string, number> = {};
    const skuChangeCounts: Record<string, number> = {};
    const failedScenarios: string[] = [];
    let alertCount = 0;

    for (const r of rows) {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
      if (r.type === 'price_change' && r.sku) {
        const k = `${r.platform}|${r.sku}`;
        skuChangeCounts[k] = (skuChangeCounts[k] || 0) + 1;
      }
      if (r.type === 'scenario_run' && r.meta?.status === 'failed') failedScenarios.push(r.title ?? 'Unknown');
      if (r.type === 'alert') alertCount++;
    }

    const hotSkus = Object.entries(skuChangeCounts).filter(([, c]) => c >= 3).sort(([, a], [, b]) => b - a).slice(0, 5);
    const failedUniq = [...new Set(failedScenarios)].slice(0, 5);

    const sample = rows.slice(0, 30).map((r: any) => {
      const d = new Date(r.ts).toISOString().slice(0, 16);
      if (r.type === 'price_change') return `[${d}] цена "${r.title ?? r.sku}" ${r.meta?.old_price}→${r.meta?.new_price}₽ причина=${r.meta?.reason ?? '—'}`;
      if (r.type === 'scenario_run') return `[${d}] сценарий "${r.title}" статус=${r.meta?.status} стоимость=${r.meta?.cost ?? 0}₽`;
      if (r.type === 'alert') return `[${d}] алерт "${r.title ?? r.sku}" ${r.meta?.alert_type}: ${r.meta?.message ?? ''}`;
      return `[${d}] ${r.type}`;
    });

    const prompt = `/no_think Ты — аналитик e-commerce. Найди закономерности и аномалии в истории событий.

Всего событий за 14 дней: ${rows.length} (изменений цен: ${typeCounts['price_change'] ?? 0}, запусков сценариев: ${typeCounts['scenario_run'] ?? 0}, алертов: ${alertCount})
${hotSkus.length > 0 ? `Частые изменения цен: ${hotSkus.map(([k, c]) => `${k.split('|')[1]}(${c}×)`).join(', ')}` : ''}
${failedUniq.length > 0 ? `Сбои сценариев: ${failedUniq.join(', ')}` : ''}

Последние 30 событий:
${sample.join('\n')}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения о паттернах в активности>",
  "patterns": [
    {"title":"<название паттерна>","description":"<что происходит и почему это важно>","severity":"info|warning|critical"}
  ],
  "anomalies": ["<аномалия 1>","<аномалия 2>"],
  "insights": ["<инсайт 1>","<инсайт 2>","<инсайт 3>"],
  "actions": ["<рекомендуемое действие 1>","<рекомендуемое действие 2>","<рекомендуемое действие 3>"]
}`;

    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 1200);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      result = {
        summary: `За 14 дней зафиксировано ${rows.length} событий: ${typeCounts['price_change'] ?? 0} изменений цен, ${alertCount} алертов.`,
        patterns: hotSkus.slice(0, 3).map(([k, c]) => ({
          title: `Частые изменения цены SKU ${k.split('|')[1]}`,
          description: `${c} изменений за 14 дней`,
          severity: c >= 5 ? 'warning' : 'info',
        })),
        anomalies: failedUniq.map(s => `Повторные сбои сценария "${s}"`),
        insights: [`Всего ${rows.length} событий за последние 14 дней`],
        actions: ['Проверьте правила ценообразования для часто меняющихся SKU', 'Просмотрите сбойные сценарии', 'Настройте пороги алертов'],
      };
    }

    res.json({
      ...result,
      total_events: rows.length,
      type_counts: typeCounts,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

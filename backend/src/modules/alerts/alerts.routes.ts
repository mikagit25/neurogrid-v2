import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { callLlm } from '../../integrations/llm/llm.client';

export const alertsRouter = Router();
alertsRouter.use(authenticate);

const VALID_TYPES = ['low_stock', 'pnl_negative', 'sales_drop', 'high_returns', 'competitor_price', 'position_drop'];

// GET /api/alerts/rules
alertsRouter.get('/rules', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT id, type, name, platform, sku, threshold, is_active, created_at, updated_at
     FROM alert_rules WHERE user_id = $1 ORDER BY created_at ASC`,
    [req.user!.userId],
  );
  res.json({ rules: rows });
});

// POST /api/alerts/rules
alertsRouter.post('/rules', async (req: Request, res: Response) => {
  const { type, name, platform, sku, threshold } = req.body;
  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: 'Invalid type' }); return;
  }
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name required' }); return;
  }
  const { rows } = await db.query(
    `INSERT INTO alert_rules (user_id, type, name, platform, sku, threshold)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.userId, type, name.slice(0, 256), platform || null, sku || null, threshold ?? null],
  );
  res.json({ rule: rows[0] });
});

// PUT /api/alerts/rules/:id
alertsRouter.put('/rules/:id', async (req: Request, res: Response) => {
  const { name, platform, sku, threshold, is_active } = req.body;
  const { rows } = await db.query(
    `UPDATE alert_rules
     SET name = COALESCE($3, name),
         platform = COALESCE($4, platform),
         sku = COALESCE($5, sku),
         threshold = COALESCE($6, threshold),
         is_active = COALESCE($7, is_active),
         updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [req.params.id, req.user!.userId, name, platform, sku, threshold, is_active],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ rule: rows[0] });
});

// DELETE /api/alerts/rules/:id
alertsRouter.delete('/rules/:id', async (req: Request, res: Response) => {
  await db.query(
    'DELETE FROM alert_rules WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.userId],
  );
  res.json({ ok: true });
});

// GET /api/alerts/events?limit=50&unread=true
alertsRouter.get('/events', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const unreadOnly = req.query.unread === 'true';
  const { rows } = await db.query(
    `SELECT id, rule_id, type, platform, sku, sku_title, value, threshold, message, is_read, triggered_at
     FROM alert_events
     WHERE user_id = $1 ${unreadOnly ? 'AND is_read = false' : ''}
     ORDER BY triggered_at DESC LIMIT $2`,
    [req.user!.userId, limit],
  );
  const unreadCount = unreadOnly ? rows.length : (
    await db.query('SELECT COUNT(*) FROM alert_events WHERE user_id = $1 AND is_read = false', [req.user!.userId])
  ).rows[0].count;
  res.json({ events: rows, unread_count: Number(unreadCount) });
});

// POST /api/alerts/events/:id/read
alertsRouter.post('/events/:id/read', async (req: Request, res: Response) => {
  await db.query(
    'UPDATE alert_events SET is_read = true WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.userId],
  );
  res.json({ ok: true });
});

// POST /api/alerts/events/read-all
alertsRouter.post('/events/read-all', async (req: Request, res: Response) => {
  await db.query(
    'UPDATE alert_events SET is_read = true WHERE user_id = $1',
    [req.user!.userId],
  );
  res.json({ ok: true });
});

// ─── Custom Alert Rules ──────────────────────────────────────────────────────

const CUSTOM_RULE_TYPES = ['stock_low', 'price_change', 'rating_drop', 'drr_high', 'no_sales', 'review_rate_low'];
const VALID_COMPARISONS = ['lt', 'gt', 'lte', 'gte', 'change_pct'];

// GET /api/alerts/custom-rules
alertsRouter.get('/custom-rules', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT id, name, rule_type, condition, threshold, comparison, enabled, last_fired_at, fire_count, created_at
     FROM custom_alert_rules WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user!.userId],
  );
  res.json({ rules: rows });
});

// POST /api/alerts/custom-rules
alertsRouter.post('/custom-rules', async (req: Request, res: Response) => {
  const { name, rule_type, condition = {}, threshold, comparison = 'lt' } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  if (!rule_type || !CUSTOM_RULE_TYPES.includes(rule_type)) {
    res.status(400).json({ error: `rule_type must be one of: ${CUSTOM_RULE_TYPES.join(', ')}` }); return;
  }
  if (threshold == null || isNaN(Number(threshold))) {
    res.status(400).json({ error: 'threshold (number) required' }); return;
  }
  if (!VALID_COMPARISONS.includes(comparison)) {
    res.status(400).json({ error: 'invalid comparison' }); return;
  }
  const { rows } = await db.query(
    `INSERT INTO custom_alert_rules (user_id, name, rule_type, condition, threshold, comparison)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.userId, name.slice(0, 256), rule_type, JSON.stringify(condition), Number(threshold), comparison],
  );
  res.json({ rule: rows[0] });
});

// PUT /api/alerts/custom-rules/:id
alertsRouter.put('/custom-rules/:id', async (req: Request, res: Response) => {
  const { name, condition, threshold, comparison, enabled } = req.body;
  const { rows } = await db.query(
    `UPDATE custom_alert_rules
     SET name       = COALESCE($3, name),
         condition  = COALESCE($4::jsonb, condition),
         threshold  = COALESCE($5, threshold),
         comparison = COALESCE($6, comparison),
         enabled    = COALESCE($7, enabled),
         updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      req.params.id, req.user!.userId,
      name ?? null,
      condition != null ? JSON.stringify(condition) : null,
      threshold != null ? Number(threshold) : null,
      comparison ?? null,
      enabled != null ? Boolean(enabled) : null,
    ],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ rule: rows[0] });
});

// DELETE /api/alerts/custom-rules/:id
alertsRouter.delete('/custom-rules/:id', async (req: Request, res: Response) => {
  await db.query(
    'DELETE FROM custom_alert_rules WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.userId],
  );
  res.json({ ok: true });
});

// POST /api/alerts/ai-tune — AI analysis of alert rules and events
alertsRouter.post('/ai-tune', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const [rulesRes, eventsRes, customRes] = await Promise.all([
      db.query(
        `SELECT ar.id, ar.type, ar.name, ar.threshold, ar.is_active,
                COUNT(ae.id)::int AS fire_count_30d
         FROM alert_rules ar
         LEFT JOIN alert_events ae ON ae.rule_id = ar.id
           AND ae.triggered_at > now() - interval '30 days'
         WHERE ar.user_id = $1
         GROUP BY ar.id`,
        [userId],
      ),
      db.query(
        `SELECT type, COUNT(*)::int AS count, MAX(triggered_at) AS last_fired
         FROM alert_events
         WHERE user_id = $1 AND triggered_at > now() - interval '30 days'
         GROUP BY type ORDER BY count DESC`,
        [userId],
      ),
      db.query(
        `SELECT name, rule_type, threshold, comparison, enabled, fire_count, last_fired_at
         FROM custom_alert_rules WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const rules = rulesRes.rows;
    const eventsByType = eventsRes.rows;
    const customRules = customRes.rows;

    const IMPORTANT_TYPES = ['low_stock', 'pnl_negative', 'sales_drop', 'high_returns'];
    const configuredTypes = new Set(rules.map(r => r.type));
    const missingTypes = IMPORTANT_TYPES.filter(t => !configuredTypes.has(t));

    const totalEvents30d = eventsByType.reduce((s, r) => s + r.count, 0);
    const noisyRules = rules.filter(r => r.fire_count_30d > 15);
    const silentRules = rules.filter(r => r.is_active && r.fire_count_30d === 0);

    if (!rules.length && !customRules.length) {
      res.json({
        summary: 'Нет настроенных алертов. Создайте правила для мониторинга важных показателей.',
        health: 'unconfigured',
        noisy_rules: [],
        silent_rules: [],
        missing_suggestions: IMPORTANT_TYPES.map(t => ({
          type: t,
          reason: 'Не настроен — важный тип алерта',
          suggested_threshold: t === 'low_stock' ? 10 : t === 'high_returns' ? 15 : null,
        })),
        threshold_adjustments: [],
        actions: ['Создайте алерт "Низкий остаток" с порогом 10 единиц', 'Создайте алерт "SKU в минус по P&L"', 'Создайте алерт "Падение продаж"'],
        total_rules: 0,
        total_events_30d: 0,
        generated_at: new Date().toISOString(),
      });
      return;
    }

    const fmtRule = (r: any) => `"${r.name}" тип=${r.type} порог=${r.threshold ?? '—'} активен=${r.is_active} событий(30д)=${r.fire_count_30d}`;
    const fmtType = (r: any) => `${r.type}: ${r.count} событий(30д) последнее=${r.last_fired ? new Date(r.last_fired).toISOString().slice(0, 10) : '—'}`;

    const prompt = `/no_think Ты — эксперт по мониторингу e-commerce. Проанализируй систему алертов.

Правил настроено: ${rules.length}, кастомных: ${customRules.length}
Событий за 30 дней: ${totalEvents30d}
Шумных правил (>15 срабатываний): ${noisyRules.length}
Молчащих активных правил (0 срабатываний): ${silentRules.length}
Не настроено важных типов: ${missingTypes.join(', ') || 'нет'}

Правила:
${rules.slice(0, 10).map(fmtRule).join('\n')}

События по типам:
${eventsByType.slice(0, 8).map(fmtType).join('\n')}

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения о состоянии системы алертов>",
  "health": "<good|noisy|undermonitored|unconfigured>",
  "noisy_rules": [{"name":"<название>","type":"<тип>","issue":"<проблема>","suggestion":"<что сделать — повысить порог/деактивировать>"}],
  "silent_rules": [{"name":"<название>","type":"<тип>","issue":"<почему не срабатывает>","suggestion":"<что проверить>"}],
  "missing_suggestions": [{"type":"<тип алерта>","reason":"<зачем нужен>","suggested_threshold":"<число или null>"}],
  "threshold_adjustments": [{"name":"<правило>","current_threshold":"<текущее>","suggested_threshold":"<новое>","reason":"<почему>"}],
  "actions": ["<действие 1>","<действие 2>","<действие 3>"]
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
        summary: `${rules.length} правил алертов, ${totalEvents30d} событий за 30 дней. ${noisyRules.length > 0 ? `${noisyRules.length} правил срабатывают слишком часто.` : ''} ${missingTypes.length > 0 ? `Не настроены: ${missingTypes.join(', ')}.` : ''}`,
        health: noisyRules.length > 2 ? 'noisy' : missingTypes.length > 2 ? 'undermonitored' : 'good',
        noisy_rules: noisyRules.slice(0, 3).map(r => ({ name: r.name, type: r.type, issue: `${r.fire_count_30d} срабатываний за 30 дней`, suggestion: 'Увеличьте порог или деактивируйте' })),
        silent_rules: silentRules.slice(0, 3).map(r => ({ name: r.name, type: r.type, issue: 'Ни разу не сработало за 30 дней', suggestion: 'Проверьте корректность настройки' })),
        missing_suggestions: missingTypes.map(t => ({ type: t, reason: 'Важный тип не настроен', suggested_threshold: null })),
        threshold_adjustments: [],
        actions: ['Проверьте шумные правила и скорректируйте пороги', `Создайте отсутствующие правила: ${missingTypes.slice(0,2).join(', ')}`, 'Отключите молчащие правила или проверьте их корректность'],
      };
    }

    res.json({
      ...result,
      total_rules: rules.length + customRules.length,
      total_events_30d: totalEvents30d,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

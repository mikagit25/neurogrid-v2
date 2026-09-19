import { db } from '../../db';
import { callLlm } from '../../integrations/llm/llm.client';
import { createRun } from '../runs/runs.service';
import { upsertAutomation } from '../automations/automations.service';

export interface AutopilotAction {
  type: string;
  title: string;
  description: string;
  recommended: boolean;
  enabled: boolean;
  agentType?: boolean;
  schedule?: 'hourly' | 'daily' | 'weekly';
  autoApply?: boolean;
}

export interface PhotoEnhancement {
  type: string;
  label: string;
  description: string;
  recommended: boolean;
  config: Record<string, string>;
}

export interface AutopilotPlan {
  detected: {
    name: string;
    category: string;
    characteristics: string[];
  };
  actions: AutopilotAction[];
  pricing: {
    recommended: 'competitive' | 'margin' | 'fixed';
    reason: string;
  };
  photoEnhancements?: PhotoEnhancement[];
}

export interface PricingRule {
  id: string;
  user_id: string;
  connection_id: string | null;
  sku: string | null;
  name: string;
  strategy: string;
  config: Record<string, unknown>;
  enabled: boolean;
  last_applied_at: string | null;
  created_at: string;
}

export async function analyzeProduct(input: {
  productName: string;
  description: string;
  photoUrls: string[];
  platform: 'wb' | 'ozon';
}): Promise<AutopilotPlan> {
  const hasPhotos = input.photoUrls.length > 0;

  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  const content: ContentBlock[] = [];

  if (hasPhotos) {
    for (const rawUrl of input.photoUrls.slice(0, 5)) {
      const url = rawUrl.startsWith('http')
        ? rawUrl
        : `${process.env.APP_URL}${rawUrl}`;
      content.push({ type: 'image_url', image_url: { url } });
    }
  }

  const platformLabel = input.platform === 'wb' ? 'Wildberries' : 'Ozon';

  content.push({
    type: 'text',
    text: `${hasPhotos ? 'На фото выше — товар.' : ''} Название: "${input.productName}". ${input.description ? `Описание: ${input.description}` : ''}
Платформа: ${platformLabel}.

Ты — эксперт по продажам на российских маркетплейсах. Проанализируй товар и составь план автоматизации.

Верни ТОЛЬКО валидный JSON без markdown-оберток:
{
  "detected": {
    "name": "<уточнённое название на русском>",
    "category": "<категория маркетплейса>",
    "characteristics": ["<хар-ка 1>", "<хар-ка 2>", ...]
  },
  "actions": [
    {
      "type": "card-generator",
      "title": "SEO-карточка товара",
      "description": "Оптимизированный заголовок, описание и характеристики",
      "recommended": true,
      "enabled": true,
      "agentType": false
    },
    {
      "type": "multi-photo-studio",
      "title": "Studio hero shot",
      "description": "Профессиональное фото с 3D-перспективой",
      "recommended": ${hasPhotos ? 'true' : 'false'},
      "enabled": ${hasPhotos ? 'true' : 'false'},
      "agentType": false
    },
    {
      "type": "infographic-generator",
      "title": "Инфографика",
      "description": "Карточка с характеристиками для ${platformLabel}",
      "recommended": ${hasPhotos ? 'true' : 'false'},
      "enabled": ${hasPhotos ? 'true' : 'false'},
      "agentType": false
    },
    {
      "type": "review-drafts",
      "title": "Авто-ответы на отзывы",
      "description": "Агент ежедневно отвечает на новые отзывы",
      "recommended": true,
      "enabled": true,
      "agentType": true,
      "schedule": "daily",
      "autoApply": false
    },
    {
      "type": "price-monitor",
      "title": "Мониторинг цен конкурентов",
      "description": "Ежедневный отчёт об изменениях цен",
      "recommended": true,
      "enabled": true,
      "agentType": true,
      "schedule": "daily",
      "autoApply": false
    },
    {
      "type": "seo-audit",
      "title": "Еженедельный SEO-аудит",
      "description": "Проверка позиций и рекомендации по улучшению",
      "recommended": true,
      "enabled": false,
      "agentType": true,
      "schedule": "weekly",
      "autoApply": false
    },
    {
      "type": "stock-forecast",
      "title": "Прогноз запасов",
      "description": "Предупреждение о дефиците за 14 дней",
      "recommended": false,
      "enabled": false,
      "agentType": true,
      "schedule": "daily",
      "autoApply": false
    }
  ],
  "pricing": {
    "recommended": "<competitive|margin|fixed> — выбери на основе категории товара",
    "reason": "<2-3 предложения почему рекомендуется именно эта стратегия>"
  },
  "photoEnhancements": [
    {
      "type": "<lifestyle|text-overlay|seasonal|companion|custom-bg>",
      "label": "<название на русском>",
      "description": "<почему рекомендуется для этого товара>",
      "recommended": true,
      "config": {
        "setting": "<для lifestyle: где разместить — На кухне, В спальне и т.д.>",
        "text": "<для text-overlay: текст акции>",
        "style": "<для text-overlay: badge|banner|price-tag>",
        "season": "<для seasonal: new-year|valentine|march8|summer|autumn>",
        "product": "<для companion: с каким товаром>",
        "description": "<для custom-bg: описание фона>"
      }
    }
  ]
}`,
  });

  const { text } = await callLlm(
    [{ role: 'user', content: hasPhotos ? content : content.filter(b => b.type === 'text') }],
    undefined, // auto-selects visionModel when photos present, text model otherwise
    1000
  );

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI не смог сформировать план. Попробуйте ещё раз.');

  let plan: AutopilotPlan;
  try {
    plan = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Ошибка разбора плана от AI');
  }

  return plan;
}

export async function executeAutopilot(
  userId: string,
  input: {
    product: {
      name: string;
      description: string;
      photoUrls: string[];
      platform: 'wb' | 'ozon';
      characteristics: string[];
    };
    connectionId: string | null;
    actions: AutopilotAction[];
    photoEnhancements?: PhotoEnhancement[];
    pricingRule?: {
      name: string;
      strategy: string;
      config: Record<string, unknown>;
      enabled: boolean;
    } | null;
  }
): Promise<{ sessionId: string }> {
  const { product, connectionId, actions, photoEnhancements, pricingRule } = input;

  // Create session
  const { rows } = await db.query(
    `INSERT INTO autopilot_sessions
     (user_id, connection_id, product_name, product_data, plan, run_ids)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      userId,
      connectionId,
      product.name,
      JSON.stringify(product),
      JSON.stringify(actions),
      '{}',
    ]
  );
  const sessionId: string = rows[0].id;

  const runIds: Record<string, string> = {};

  // Content actions: queue scenario runs
  const contentActions = actions.filter((a) => a.enabled && !a.agentType);
  for (const action of contentActions) {
    try {
      // Get scenario ID by slug
      const { rows: scenRows } = await db.query(
        'SELECT id FROM scenarios WHERE slug = $1 AND is_active = true',
        [action.type]
      );
      if (!scenRows.length) continue;
      const scenarioId: string = scenRows[0].id;

      // Build input based on action type
      let inputData: Record<string, unknown> = {};
      const photoUrlsAbsolute = product.photoUrls.map((u) =>
        u.startsWith('http') ? u : `${process.env.APP_URL}${u}`
      );

      if (action.type === 'card-generator') {
        inputData = {
          productName: product.name,
          characteristics: product.characteristics.join(', ') || product.description,
          platform: product.platform,
        };
      } else if (action.type === 'multi-photo-studio') {
        if (product.photoUrls.length === 0) continue;
        const enhancements = (photoEnhancements ?? []).map((enh) => ({
          type: enh.type,
          ...enh.config,
        }));
        inputData = {
          productName: product.name,
          photoUrls: photoUrlsAbsolute,
          style: 'studio-3d',
          enhancements,
        };
      } else if (action.type === 'infographic-generator') {
        if (product.photoUrls.length === 0) continue;
        inputData = {
          photoUrl: photoUrlsAbsolute[0],
          features: product.characteristics.slice(0, 6),
          title: product.name,
        };
      }

      const run = await createRun(userId, scenarioId, connectionId, inputData);
      runIds[action.type] = run.id;
    } catch (_err) {
      // Non-critical: log and continue
      console.error(`Autopilot: failed to queue ${action.type}`, _err);
    }
  }

  // Agent actions: upsert automations
  const agentActions = actions.filter((a) => a.enabled && a.agentType);
  for (const action of agentActions) {
    try {
      await upsertAutomation(userId, action.type, connectionId, {
        enabled: true,
        schedule: action.schedule ?? 'daily',
        auto_apply: action.autoApply ?? false,
      });
    } catch (_err) {
      console.error(`Autopilot: failed to upsert automation ${action.type}`, _err);
    }
  }

  // Pricing rule
  if (pricingRule) {
    try {
      await db.query(
        `INSERT INTO pricing_rules
         (user_id, connection_id, name, strategy, config, enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          userId,
          connectionId,
          pricingRule.name || `Правило для ${product.name}`,
          pricingRule.strategy,
          JSON.stringify(pricingRule.config),
          pricingRule.enabled,
        ]
      );
    } catch (_err) {
      console.error('Autopilot: failed to save pricing rule', _err);
    }
  }

  // Store run IDs in session
  await db.query(
    'UPDATE autopilot_sessions SET run_ids = $1 WHERE id = $2',
    [JSON.stringify(runIds), sessionId]
  );

  return { sessionId };
}

export async function getSession(userId: string, sessionId: string) {
  const { rows } = await db.query(
    `SELECT s.*, mc.display_name AS connection_name, mc.platform AS connection_platform
     FROM autopilot_sessions s
     LEFT JOIN marketplace_connections mc ON mc.id = s.connection_id
     WHERE s.id = $1 AND s.user_id = $2`,
    [sessionId, userId]
  );
  if (!rows.length) throw Object.assign(new Error('Session not found'), { status: 404 });
  const session = rows[0];

  // Fetch run statuses
  const runIds: Record<string, string> = session.run_ids ?? {};
  const runs: Record<string, unknown> = {};

  for (const [actionType, runId] of Object.entries(runIds)) {
    if (!runId) continue;
    const { rows: runRows } = await db.query(
      'SELECT id, status, result, error_message FROM scenario_runs WHERE id = $1',
      [runId]
    );
    if (runRows.length) {
      runs[actionType] = {
        runId,
        status: runRows[0].status,
        result: runRows[0].result,
        errorMessage: runRows[0].error_message,
      };
    }
  }

  // Compute overall status
  const runStatuses = Object.values(runs).map((r: any) => r.status);
  let status = 'running';
  if (runStatuses.length > 0 && runStatuses.every((s) => s === 'success')) status = 'done';
  else if (runStatuses.length > 0 && runStatuses.every((s) => s === 'error')) status = 'error';
  else if (runStatuses.every((s) => s === 'success' || s === 'error')) status = 'done';

  // If no content runs were queued (all agent actions), mark done immediately
  if (Object.keys(runIds).length === 0) status = 'done';

  // Update session status if changed
  if (status !== session.status) {
    await db.query('UPDATE autopilot_sessions SET status = $1 WHERE id = $2', [
      status,
      sessionId,
    ]);
  }

  return { ...session, runs, status };
}

export async function getSessions(userId: string, limit = 20) {
  const { rows } = await db.query(
    `SELECT s.id, s.status, s.product_name, s.run_ids, s.created_at,
            mc.display_name AS connection_name, mc.platform AS connection_platform
     FROM autopilot_sessions s
     LEFT JOIN marketplace_connections mc ON mc.id = s.connection_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

// ---- Pricing rules ----

export async function getPricingRules(userId: string): Promise<PricingRule[]> {
  const { rows } = await db.query(
    `SELECT pr.*, mc.display_name AS connection_name, mc.platform AS connection_platform
     FROM pricing_rules pr
     LEFT JOIN marketplace_connections mc ON mc.id = pr.connection_id
     WHERE pr.user_id = $1
     ORDER BY pr.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function upsertPricingRule(
  userId: string,
  data: {
    id?: string;
    connectionId?: string | null;
    sku?: string | null;
    name: string;
    strategy: string;
    config: Record<string, unknown>;
    enabled?: boolean;
  }
): Promise<PricingRule> {
  if (data.id) {
    const { rows } = await db.query(
      `UPDATE pricing_rules
       SET name=$1, strategy=$2, config=$3, enabled=$4, connection_id=$5, sku=$6,
           updated_at=now()
       WHERE id=$7 AND user_id=$8
       RETURNING *`,
      [
        data.name,
        data.strategy,
        JSON.stringify(data.config),
        data.enabled ?? true,
        data.connectionId ?? null,
        data.sku ?? null,
        data.id,
        userId,
      ]
    );
    if (!rows.length) throw new Error('Rule not found');
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO pricing_rules
     (user_id, connection_id, sku, name, strategy, config, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      userId,
      data.connectionId ?? null,
      data.sku ?? null,
      data.name,
      data.strategy,
      JSON.stringify(data.config),
      data.enabled ?? true,
    ]
  );
  return rows[0];
}

export async function deletePricingRule(userId: string, ruleId: string): Promise<void> {
  await db.query('DELETE FROM pricing_rules WHERE id=$1 AND user_id=$2', [ruleId, userId]);
}

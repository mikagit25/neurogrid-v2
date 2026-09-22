import { db } from '../../db';
import { callLlm } from '../../integrations/llm/llm.client';
import { sendMail } from '../../utils/mailer';

export interface WeeklyReport {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  headline: string | null;
  summary: string | null;
  insights: ReportInsight[];
  kpis: ReportKpis;
  created_at: string;
}

export interface ReportInsight {
  type: 'success' | 'warning' | 'info' | 'action';
  title: string;
  body: string;
}

export interface ReportKpis {
  revenue?: number;
  net_payout?: number;
  orders?: number;
  returns?: number;
  margin_pct?: number;
  ad_spend?: number;
  drr_pct?: number;
  top_sku?: string;
  top_revenue?: number;
}

export async function getLatestReport(userId: string): Promise<WeeklyReport | null> {
  const { rows } = await db.query<WeeklyReport>(
    `SELECT * FROM weekly_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function listReports(userId: string, limit = 12): Promise<WeeklyReport[]> {
  const { rows } = await db.query<WeeklyReport>(
    `SELECT * FROM weekly_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

export async function generateReportForUser(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<WeeklyReport> {
  const ps = periodStart.toISOString().slice(0, 10);
  const pe = periodEnd.toISOString().slice(0, 10);

  // Check if report already exists for this period
  const { rows: existing } = await db.query(
    `SELECT id FROM weekly_reports WHERE user_id = $1 AND period_start = $2`,
    [userId, ps],
  );
  if (existing.length > 0) {
    const { rows } = await db.query<WeeklyReport>(
      `SELECT * FROM weekly_reports WHERE id = $1`,
      [existing[0].id],
    );
    return rows[0];
  }

  // Gather data
  const [finRow, orderRow, returnRow, adRow, topSkuRow, prevFinRow] = await Promise.all([
    db.query<{ revenue: string; net_payout: string; qty: string }>(
      `SELECT COALESCE(SUM(revenue),0)::numeric AS revenue,
              COALESCE(SUM(net_payout),0)::numeric AS net_payout,
              COALESCE(SUM(quantity),0)::int AS qty
       FROM finance_records
       WHERE user_id = $1 AND period_from >= $2 AND period_from < $3`,
      [userId, ps, pe],
    ),
    db.query<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM orders
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
      [userId, ps, pe],
    ).catch(() => ({ rows: [{ cnt: '0' }] })),
    db.query<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM returns
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
      [userId, ps, pe],
    ).catch(() => ({ rows: [{ cnt: '0' }] })),
    db.query<{ spend: string }>(
      `SELECT COALESCE(SUM(spend),0)::numeric AS spend
       FROM advertising_stats
       WHERE user_id = $1 AND stat_date >= $2 AND stat_date < $3`,
      [userId, ps, pe],
    ).catch(() => ({ rows: [{ spend: '0' }] })),
    db.query<{ sku: string; revenue: string }>(
      `SELECT sku, SUM(revenue)::numeric AS revenue
       FROM finance_records
       WHERE user_id = $1 AND period_from >= $2 AND period_from < $3
       GROUP BY sku ORDER BY revenue DESC LIMIT 1`,
      [userId, ps, pe],
    ),
    // Previous period for comparison
    db.query<{ revenue: string; net_payout: string }>(
      `SELECT COALESCE(SUM(revenue),0)::numeric AS revenue,
              COALESCE(SUM(net_payout),0)::numeric AS net_payout
       FROM finance_records
       WHERE user_id = $1 AND period_from >= $2 AND period_from < $3`,
      [userId, new Date(periodStart.getTime() - 7 * 86400000).toISOString().slice(0, 10), ps],
    ),
  ]);

  const revenue = parseFloat(finRow.rows[0]?.revenue ?? '0');
  const netPayout = parseFloat(finRow.rows[0]?.net_payout ?? '0');
  const qty = parseInt(finRow.rows[0]?.qty ?? '0', 10);
  const orders = parseInt(orderRow.rows[0]?.cnt ?? '0', 10);
  const returns = parseInt(returnRow.rows[0]?.cnt ?? '0', 10);
  const adSpend = parseFloat(adRow.rows[0]?.spend ?? '0');
  const prevRevenue = parseFloat(prevFinRow.rows[0]?.revenue ?? '0');
  const marginPct = revenue > 0 ? Math.round((netPayout / revenue) * 100) : 0;
  const drrPct = revenue > 0 ? Math.round((adSpend / revenue) * 100) : 0;
  const revDelta = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0;
  const topSku = topSkuRow.rows[0]?.sku ?? null;
  const topSkuRevenue = parseFloat(topSkuRow.rows[0]?.revenue ?? '0');

  const kpis: ReportKpis = {
    revenue,
    net_payout: netPayout,
    orders: orders || qty,
    returns,
    margin_pct: marginPct,
    ad_spend: adSpend,
    drr_pct: drrPct,
    top_sku: topSku ?? undefined,
    top_revenue: topSku ? topSkuRevenue : undefined,
  };

  // Build context for LLM
  const dataContext = `Период: ${ps} — ${pe}
Выручка: ${revenue.toLocaleString('ru-RU')} ₽ (${revDelta > 0 ? '+' : ''}${revDelta}% к прошлой неделе)
Выплата: ${netPayout.toLocaleString('ru-RU')} ₽
Маржинальность: ${marginPct}%
Заказы/отгрузки: ${orders || qty} шт.
Возвраты: ${returns} шт.
Рекламные расходы: ${adSpend.toLocaleString('ru-RU')} ₽ (ДРР ${drrPct}%)
${topSku ? `Топ-товар: ${topSku} — ${topSkuRevenue.toLocaleString('ru-RU')} ₽` : ''}`;

  let llmInsights: ReportInsight[] = [];
  let headline = `Отчёт за ${ps} — ${pe}`;
  let summary = '';

  try {
    const { text } = await callLlm([
      {
        role: 'system',
        content: `Ты — умный бизнес-аналитик для продавцов на маркетплейсах.
Анализируй данные и давай конкретные, actionable инсайты на русском языке.
Отвечай строго в JSON без markdown-блоков:
{
  "headline": "короткий заголовок (макс. 80 символов)",
  "summary": "2-3 предложения общего итога",
  "insights": [
    { "type": "success|warning|info|action", "title": "...", "body": "..." }
  ]
}
Генерируй 3-5 инсайтов. Типы: success=хорошие результаты, warning=проблемы, info=факт, action=рекомендация.`,
      },
      {
        role: 'user',
        content: `Вот данные за прошедшую неделю:\n${dataContext}\n\nСгенерируй еженедельный отчёт.`,
      },
    ], undefined, 1000);

    const parsed = JSON.parse(text.trim());
    headline = parsed.headline ?? headline;
    summary = parsed.summary ?? '';
    llmInsights = parsed.insights ?? [];
  } catch {
    // Fallback: generate rule-based insights
    if (revDelta > 10) llmInsights.push({ type: 'success', title: 'Рост выручки', body: `Выручка выросла на ${revDelta}% по сравнению с прошлой неделей.` });
    if (revDelta < -10) llmInsights.push({ type: 'warning', title: 'Падение выручки', body: `Выручка упала на ${Math.abs(revDelta)}%. Проверьте наличие товаров и рейтинг карточек.` });
    if (drrPct > 20) llmInsights.push({ type: 'warning', title: 'Высокий ДРР', body: `ДРР составляет ${drrPct}%. Рекомендуем оптимизировать ставки или отключить неэффективные кампании.` });
    if (marginPct < 15) llmInsights.push({ type: 'warning', title: 'Низкая маржа', body: `Маржинальность ${marginPct}% ниже рекомендуемого порога 15–20%.` });
    if (returns > 0 && orders > 0 && (returns / orders) > 0.1) llmInsights.push({ type: 'warning', title: 'Высокий процент возвратов', body: `${returns} возвратов из ${orders} заказов (${Math.round(returns / orders * 100)}%). Проверьте качество описаний и упаковки.` });
    if (llmInsights.length === 0) llmInsights.push({ type: 'info', title: 'Стабильная неделя', body: 'Ключевые показатели в норме.' });
    summary = `За неделю выручка составила ${revenue.toLocaleString('ru-RU')} ₽ при маржинальности ${marginPct}%.`;
  }

  const { rows } = await db.query<WeeklyReport>(
    `INSERT INTO weekly_reports (user_id, period_start, period_end, headline, summary, insights, kpis)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, period_start) DO UPDATE
       SET headline = EXCLUDED.headline, summary = EXCLUDED.summary,
           insights = EXCLUDED.insights, kpis = EXCLUDED.kpis
     RETURNING *`,
    [userId, ps, pe, headline, summary, JSON.stringify(llmInsights), JSON.stringify(kpis)],
  );

  return rows[0];
}

export async function generateAndEmailReport(userId: string, email: string, periodStart: Date, periodEnd: Date): Promise<void> {
  const report = await generateReportForUser(userId, periodStart, periodEnd);
  const insightsHtml = report.insights
    .map((i) => {
      const colors: Record<string, string> = { success: '#16a34a', warning: '#d97706', info: '#2563eb', action: '#7c3aed' };
      const color = colors[i.type] ?? '#475569';
      return `<div style="margin:12px 0;padding:12px 16px;border-left:4px solid ${color};background:#f8fafc">
        <strong style="color:${color}">${i.title}</strong><br/>
        <span style="color:#475569;font-size:14px">${i.body}</span>
      </div>`;
    })
    .join('');

  const kpis = report.kpis as ReportKpis;
  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px;border-radius:12px 12px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">📊 NeuroGrid — Еженедельный отчёт</h1>
    <p style="color:#c4b5fd;margin:8px 0 0">${report.period_start} — ${report.period_end}</p>
  </div>
  <div style="padding:24px;background:white;border:1px solid #e2e8f0;border-top:0">
    <h2 style="color:#1e293b;margin:0 0 8px">${report.headline}</h2>
    <p style="color:#64748b;margin:0 0 20px">${report.summary}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:#f1f5f9;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#7c3aed">${(kpis.revenue ?? 0).toLocaleString('ru-RU')} ₽</div>
        <div style="font-size:12px;color:#64748b">Выручка</div>
      </div>
      <div style="background:#f1f5f9;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#16a34a">${(kpis.net_payout ?? 0).toLocaleString('ru-RU')} ₽</div>
        <div style="font-size:12px;color:#64748b">Выплата</div>
      </div>
      <div style="background:#f1f5f9;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#0f172a">${kpis.margin_pct ?? 0}%</div>
        <div style="font-size:12px;color:#64748b">Маржа</div>
      </div>
    </div>
    <h3 style="color:#1e293b;margin:0 0 12px">Инсайты недели</h3>
    ${insightsHtml}
    <div style="margin-top:24px;text-align:center">
      <a href="${process.env.FRONTEND_URL ?? 'http://localhost:4000'}/reports"
         style="background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Открыть полный отчёт →
      </a>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">
    NeuroGrid · <a href="${process.env.FRONTEND_URL ?? 'http://localhost:4000'}/notifications" style="color:#94a3b8">Настройки уведомлений</a>
  </p>
</div>`;

  await sendMail({ to: email, subject: `📊 NeuroGrid: отчёт ${report.period_start} — ${report.period_end}`, html });
}

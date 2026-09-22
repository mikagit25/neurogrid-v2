'use client';

import { useEffect, useState, useCallback } from 'react';
import { listReports, generateReport, type WeeklyReport, type ReportInsight } from '@/lib/api';

const INSIGHT_STYLES: Record<string, { bg: string; border: string; icon: string; text: string }> = {
  success: { bg: 'bg-green-50', border: 'border-green-300', icon: '✅', text: 'text-green-800' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-300', icon: '⚠️', text: 'text-amber-800' },
  info:    { bg: 'bg-blue-50',  border: 'border-blue-300',  icon: 'ℹ️',  text: 'text-blue-800'  },
  action:  { bg: 'bg-purple-50', border: 'border-purple-300', icon: '💡', text: 'text-purple-800' },
};

function fmt(n?: number) {
  if (n == null) return '—';
  return Math.round(n).toLocaleString('ru-RU');
}

function KpiCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function InsightCard({ insight }: { insight: ReportInsight }) {
  const s = INSIGHT_STYLES[insight.type] ?? INSIGHT_STYLES.info;
  return (
    <div className={`flex gap-3 p-3 rounded-xl border ${s.bg} ${s.border}`}>
      <span className="text-lg flex-shrink-0 mt-0.5">{s.icon}</span>
      <div>
        <p className={`text-sm font-semibold ${s.text}`}>{insight.title}</p>
        <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">{insight.body}</p>
      </div>
    </div>
  );
}

function ReportCard({ report, expanded, onToggle }: { report: WeeklyReport; expanded: boolean; onToggle: () => void }) {
  const k = report.kpis;
  const date = new Date(report.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">📊</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 truncate">{report.headline ?? `Отчёт ${report.period_start}`}</span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
              {report.period_start} — {report.period_end}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{report.summary}</p>
          <div className="flex gap-3 mt-2 flex-wrap">
            <span className="text-xs text-slate-600"><span className="font-medium text-purple-700">{fmt(k.revenue)} ₽</span> выручка</span>
            <span className="text-xs text-slate-600"><span className="font-medium text-green-700">{k.margin_pct ?? 0}%</span> маржа</span>
            {k.orders != null && <span className="text-xs text-slate-600"><span className="font-medium">{k.orders}</span> заказов</span>}
          </div>
        </div>
        <svg className={`w-5 h-5 text-slate-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <KpiCell label="Выручка" value={`${fmt(k.revenue)} ₽`} />
            <KpiCell label="Выплата" value={`${fmt(k.net_payout)} ₽`} />
            <KpiCell label="Маржа" value={`${k.margin_pct ?? 0}%`} />
            <KpiCell label="Заказы" value={String(k.orders ?? '—')} />
            <KpiCell label="Возвраты" value={String(k.returns ?? '—')} />
            <KpiCell label="ДРР" value={`${k.drr_pct ?? 0}%`} sub={k.ad_spend ? `${fmt(k.ad_spend)} ₽` : undefined} />
          </div>
          {k.top_sku && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-xl p-3">
              <span className="text-lg">🏆</span>
              <span>Топ-товар: <strong className="text-slate-900">{k.top_sku}</strong> — {fmt(k.top_revenue)} ₽</span>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Инсайты</p>
            {report.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
          </div>
          <p className="text-xs text-slate-400 text-right">Создан {date}</p>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await listReports();
      setReports(data);
      if (data.length > 0 && !expandedId) setExpandedId(data[0].id);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [expandedId]);

  useEffect(() => { load(); }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const report = await generateReport();
      setReports((prev) => {
        const filtered = prev.filter((r) => r.id !== report.id);
        return [report, ...filtered];
      });
      setExpandedId(report.id);
    } catch (e: any) {
      setError(e.message || 'Ошибка генерации');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Еженедельные отчёты</h1>
          <p className="text-slate-500 text-sm mt-0.5">AI-анализ бизнеса за каждую неделю</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {generating ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          {generating ? 'Генерация...' : 'Создать отчёт'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🤖</span>
          <div>
            <p className="font-semibold">AI-аналитик работает каждый понедельник</p>
            <p className="text-purple-200 text-sm mt-0.5">Отчёт отправляется на email и хранится здесь. Нажмите «Создать отчёт» чтобы получить анализ прямо сейчас.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center pt-10">
          <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-3xl">📋</div>
          <div>
            <p className="font-semibold text-slate-800">Отчётов ещё нет</p>
            <p className="text-sm text-slate-500 mt-1">Нажмите «Создать отчёт» для первого анализа</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              expanded={expandedId === report.id}
              onToggle={() => setExpandedId(expandedId === report.id ? null : report.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

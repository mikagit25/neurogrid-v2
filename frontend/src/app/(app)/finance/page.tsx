'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiRequest as apiFetch, getFinanceForecast, getFinanceSummary, getFinanceWeeklyTrend, getFinancePlatformSplit, getFinanceAiForecast, FinanceForecast, type FinanceSummaryRow, type WeeklyTrendPoint, type FinancePlatformSplit, type FinanceAiForecast } from '@/lib/api';

interface FinanceSummary {
  platform: string;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  cost_of_goods: number;
  gross_profit: number;
  margin_pct: number;
  quantity: number;
}

interface FinanceRecord {
  platform: string;
  sku: string;
  title: string;
  quantity: number;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  purchase_price: number | null;
  gross_profit: number | null;
}

function fmt(n: number) { return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

const PERIODS = [
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
  { label: '90 дней', days: 90 },
];

function ForecastTab() {
  const [data, setData] = useState<FinanceForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getFinanceForecast()
      .then(setData)
      .catch(e => setError(e.message ?? 'Ошибка'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>;
  if (!data || data.message === 'insufficient_data') {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-slate-600 font-medium">Недостаточно данных для прогноза</p>
        <p className="text-slate-400 text-sm mt-1">Нужно минимум 5 дней с продажами. Синхронизируйте данные.</p>
      </div>
    );
  }

  // Build SVG chart
  const allPoints = [
    ...data.actual.map(d => ({ date: d.date, value: d.revenue, type: 'actual' as const })),
    ...data.forecast.map(d => ({ date: d.date, value: d.revenue, type: 'forecast' as const })),
  ];
  const allValues = allPoints.map(p => p.value);
  const maxVal = Math.max(...allValues, 1);
  const W = 700, H = 180, PAD_L = 50, PAD_R = 20, PAD_T = 10, PAD_B = 30;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const total = allPoints.length;
  const xPos = (i: number) => PAD_L + (i / (total - 1)) * chartW;
  const yPos = (v: number) => PAD_T + chartH - (v / maxVal) * chartH;

  const actualPts = data.actual.map((d, i) => `${xPos(i)},${yPos(d.revenue)}`).join(' ');
  const forecastOffset = data.actual.length - 1;
  const forecastPts = data.forecast.map((d, i) => `${xPos(forecastOffset + i)},${yPos(d.revenue)}`).join(' ');

  // Confidence band polygon
  const bandTop = data.forecast.map((d, i) => `${xPos(forecastOffset + i)},${yPos(d.upper)}`).join(' ');
  const bandBottom = [...data.forecast].reverse().map((d, i) => `${xPos(forecastOffset + (data.forecast.length - 1 - i))},${yPos(d.lower)}`).join(' ');
  const bandPolygon = `${bandTop} ${bandBottom}`;

  const joinX = xPos(forecastOffset);
  const joinY = yPos(data.actual[data.actual.length - 1]?.revenue ?? 0);

  const changePct = data.change_pct;
  const trendUp = changePct >= 0;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Прогноз на 30 дней</p>
          <p className="text-xl font-bold text-purple-700">{fmt(data.forecast_30d_total)} ₽</p>
          <p className="text-xs text-slate-400 mt-0.5">ожидаемая выручка</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Тренд</p>
          <p className={`text-xl font-bold flex items-center gap-1 ${trendUp ? 'text-green-700' : 'text-red-600'}`}>
            {trendUp ? '↑' : '↓'} {Math.abs(changePct)}%
          </p>
          <p className="text-xs text-slate-400 mt-0.5">vs предыдущие 30 дн.</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Ср. выручка / день (30 дн.)</p>
          <p className="text-xl font-bold text-slate-900">{fmt(Math.round(data.avg_30d / 30))} ₽</p>
          <p className="text-xs text-slate-400 mt-0.5">за последние 30 дней</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Наклон линии тренда</p>
          <p className={`text-xl font-bold ${data.trend >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {data.trend >= 0 ? '+' : ''}{data.trend} ₽/день
          </p>
          <p className="text-xs text-slate-400 mt-0.5">линейная регрессия 60 дн.</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Выручка: факт + прогноз</h3>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-purple-600 inline-block" />Факт</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-purple-400 border-dashed inline-block" />Прогноз</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-purple-100 inline-block rounded" />Доверит. интервал</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
          {/* Y-axis gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const y = PAD_T + chartH * (1 - frac);
            return (
              <g key={frac}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
                  {Math.round(maxVal * frac / 1000)}к
                </text>
              </g>
            );
          })}

          {/* Separator between actual and forecast */}
          <line x1={joinX} y1={PAD_T} x2={joinX} y2={H - PAD_B} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3,3" />

          {/* Confidence band */}
          {data.forecast.length > 0 && (
            <polygon points={bandPolygon} fill="#ede9fe" opacity="0.6" />
          )}

          {/* Forecast line */}
          {data.forecast.length > 0 && (
            <polyline
              points={`${joinX},${joinY} ${forecastPts}`}
              fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="5,3"
            />
          )}

          {/* Actual line */}
          {data.actual.length > 0 && (
            <polyline points={actualPts} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" />
          )}
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between text-xs text-slate-400 mt-1 px-1">
          <span>{data.actual[0]?.date?.slice(5) ?? ''}</span>
          <span className="text-purple-500 font-medium">Прогноз →</span>
          <span>{data.forecast[data.forecast.length - 1]?.date?.slice(5) ?? ''}</span>
        </div>
      </div>

      {/* Forecast table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Прогноз по дням (следующие 30 дней)</h3>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs text-slate-500 font-medium">Дата</th>
                <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Прогноз</th>
                <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Нижн. граница</th>
                <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Верхн. граница</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.forecast.map(d => (
                <tr key={d.date} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-purple-700">{fmt(d.revenue)} ₽</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{fmt(d.lower)} ₽</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{fmt(d.upper)} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TREND_CONFIG = {
  growing:  { label: '↑ Рост',     cls: 'bg-green-100 text-green-700' },
  stable:   { label: '→ Стабильно',cls: 'bg-blue-100 text-blue-700' },
  declining:{ label: '↓ Снижение', cls: 'bg-red-100 text-red-700' },
  volatile: { label: '~ Волатильно',cls: 'bg-amber-100 text-amber-700' },
  unknown:  { label: '?',           cls: 'bg-slate-100 text-slate-600' },
};

const CONF_COLORS = { high: 'text-green-600', medium: 'text-amber-600', low: 'text-slate-400' };

function WeeklyTrendTab() {
  const [trend, setTrend] = useState<WeeklyTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weeks, setWeeks] = useState(12);
  const [aiForecast, setAiForecast] = useState<FinanceAiForecast | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getFinanceWeeklyTrend(weeks)
      .then(setTrend)
      .catch(e => setError(e.message ?? 'Ошибка'))
      .finally(() => setLoading(false));
  }, [weeks]);

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>;
  if (!trend.length) return (
    <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-400 text-sm">
      Нет данных. Синхронизируйте финансы.
    </div>
  );

  const maxRev = Math.max(...trend.map(t => t.revenue), 1);
  const W = 700, H = 180, PAD_L = 52, PAD_R = 50, PAD_T = 10, PAD_B = 28;
  const cW = W - PAD_L - PAD_R;
  const cH = H - PAD_T - PAD_B;
  const n = trend.length;
  const barW = Math.max(4, (cW / n) * 0.7);
  const xPos = (i: number) => PAD_L + (i / (n - 1 || 1)) * cW;

  const marginValues = trend.map(t => t.margin_pct).filter((v): v is number => v != null);
  const maxM = Math.max(...marginValues, 1);
  const minM = Math.min(...marginValues, 0);
  const mRange = maxM - minM || 1;
  const myPos = (v: number) => PAD_T + cH - ((v - minM) / mRange) * cH;

  const margPoints = trend.map((t, i) => t.margin_pct != null ? `${xPos(i)},${myPos(t.margin_pct)}` : null)
    .filter(Boolean).join(' ');

  const latestRev = trend[trend.length - 1]?.revenue ?? 0;
  const prevRev   = trend[trend.length - 2]?.revenue ?? 0;
  const revDelta  = prevRev > 0 ? Math.round(((latestRev - prevRev) / prevRev) * 100) : null;
  const latestMargin = trend[trend.length - 1]?.margin_pct;

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Динамика по неделям</p>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => { setAiLoading(true); setAiForecast(null); try { setAiForecast(await getFinanceAiForecast()); } catch { /* ignore */ } finally { setAiLoading(false); } }}
            disabled={aiLoading}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {aiLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            AI прогноз
          </button>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[4, 8, 12, 26].map(w => (
              <button key={w} onClick={() => setWeeks(w)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${weeks === w ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {w}н
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Посл. неделя', value: `${fmt(latestRev)} ₽`, sub: revDelta != null ? `${revDelta >= 0 ? '+' : ''}${revDelta}% к пред.` : '', color: 'text-slate-900' },
          { label: 'Маржа посл. нед.', value: latestMargin != null ? `${latestMargin}%` : '—', sub: 'чистая маржа', color: latestMargin != null ? (latestMargin >= 20 ? 'text-green-700' : latestMargin >= 10 ? 'text-amber-600' : 'text-red-600') : 'text-slate-400' },
          { label: 'Выручка всего', value: `${fmt(trend.reduce((s, t) => s + t.revenue, 0))} ₽`, sub: `за ${weeks} недель`, color: 'text-purple-700' },
          { label: 'Прибыль всего', value: `${fmt(trend.reduce((s, t) => s + t.gross_profit, 0))} ₽`, sub: `за ${weeks} недель`, color: trend.reduce((s, t) => s + t.gross_profit, 0) >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            {k.sub && <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Выручка и маржа по неделям</h3>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-200 rounded-sm inline-block" />Выручка</span>
            {margPoints && <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-green-500 inline-block" />Маржа %</span>}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const y = PAD_T + cH * (1 - frac);
            return (
              <g key={frac}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
                  {Math.round(maxRev * frac / 1000)}к
                </text>
              </g>
            );
          })}
          {/* Revenue bars */}
          {trend.map((t, i) => {
            const barH = (t.revenue / maxRev) * cH;
            const x = xPos(i) - barW / 2;
            return (
              <rect key={i} x={x} y={PAD_T + cH - barH} width={barW} height={barH}
                rx="2" fill="#7c3aed" fillOpacity="0.25" />
            );
          })}
          {/* Margin line (right axis) */}
          {margPoints && (
            <>
              {trend.map((t, i) => {
                if (t.margin_pct == null) return null;
                return (
                  <circle key={i} cx={xPos(i)} cy={myPos(t.margin_pct)} r="2.5" fill="#22c55e" />
                );
              })}
              <polyline points={margPoints} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round" />
              {/* Right axis labels */}
              {[minM, (minM + maxM) / 2, maxM].map((v, i) => (
                <text key={i} x={W - PAD_R + 4} y={myPos(v) + 4} fontSize="9" fill="#22c55e">
                  {Math.round(v)}%
                </text>
              ))}
            </>
          )}
          {/* X labels */}
          {trend.map((t, i) => {
            if (i % Math.ceil(n / 6) !== 0 && i !== n - 1) return null;
            return (
              <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
                {t.week.slice(5)}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {['Неделя', 'Выручка', 'Комиссия', 'Логистика', 'Выплата', 'Прибыль', 'Маржа'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs text-slate-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...trend].reverse().map(t => (
                <tr key={t.week} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-xs text-slate-500">{t.week}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{fmt(t.revenue)} ₽</td>
                  <td className="px-3 py-2.5 text-red-500">{fmt(t.commission)} ₽</td>
                  <td className="px-3 py-2.5 text-orange-500">{fmt(t.logistics)} ₽</td>
                  <td className="px-3 py-2.5 text-blue-700">{fmt(t.net_payout)} ₽</td>
                  <td className={`px-3 py-2.5 font-semibold ${t.gross_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(t.gross_profit)} ₽</td>
                  <td className={`px-3 py-2.5 font-semibold ${t.margin_pct == null ? 'text-slate-300' : t.margin_pct >= 15 ? 'text-green-700' : t.margin_pct >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                    {t.margin_pct != null ? `${t.margin_pct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Forecast Panel */}
      {aiForecast && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-900 text-sm">AI прогноз</p>
                {(() => { const cfg = TREND_CONFIG[aiForecast.trend_direction] ?? TREND_CONFIG.unknown; return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>; })()}
              </div>
            </div>
            <button onClick={() => setAiForecast(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed">{aiForecast.summary}</p>

          {aiForecast.forecast.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Прогноз на 4 недели</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {aiForecast.forecast.map((w, i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
                    <p className="text-xs text-slate-400 mb-1">{w.week_label}</p>
                    <p className="text-base font-bold text-slate-900">{fmt(w.projected_revenue)} ₽</p>
                    <p className="text-xs text-slate-500">{fmt(w.projected_payout)} выпл.</p>
                    <p className={`text-xs mt-1 ${CONF_COLORS[w.confidence] ?? 'text-slate-400'}`}>
                      {w.confidence === 'high' ? 'высокая' : w.confidence === 'medium' ? 'средняя' : 'низкая'} точность
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {aiForecast.risks.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-red-700 mb-1.5">Риски</p>
                <ul className="space-y-1">
                  {aiForecast.risks.map((r, i) => <li key={i} className="text-sm text-red-800 flex gap-2"><span className="flex-shrink-0">•</span>{r}</li>)}
                </ul>
              </div>
            )}
            {aiForecast.opportunities.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-700 mb-1.5">Возможности</p>
                <ul className="space-y-1">
                  {aiForecast.opportunities.map((o, i) => <li key={i} className="text-sm text-green-800 flex gap-2"><span className="flex-shrink-0">•</span>{o}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PLATFORM_COLORS: Record<string, { bar: string; bg: string; text: string; border: string }> = {
  wb:   { bar: '#CB11AB', bg: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-pink-200' },
  ozon: { bar: '#005BFF', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  ym:   { bar: '#FFCC00', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  mm:   { bar: '#21A038', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
};
const PLATFORM_LABELS: Record<string, string> = { wb: 'Wildberries', ozon: 'Ozon', ym: 'Я.Маркет', mm: 'Мегамаркет' };

function PlatformBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium text-slate-700">{fmt(value)} ₽</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ComparisonTab() {
  const [viewMode, setViewMode] = useState<'period' | 'platform'>('period');
  const [cur, setCur] = useState<FinanceSummaryRow[]>([]);
  const [prev, setPrev] = useState<FinanceSummaryRow[]>([]);
  const [platformData, setPlatformData] = useState<FinancePlatformSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const now = new Date();
    const d = (dt: Date) => dt.toISOString().slice(0, 10);
    const curTo   = d(now);
    const curFrom = d(new Date(now.getTime() - 30 * 86400_000));
    const prevTo  = d(new Date(now.getTime() - 30 * 86400_000 - 86400_000));
    const prevFrom = d(new Date(now.getTime() - 60 * 86400_000 - 86400_000));
    Promise.all([
      getFinanceSummary(curFrom, curTo),
      getFinanceSummary(prevFrom, prevTo),
      getFinancePlatformSplit(curFrom, curTo),
    ])
      .then(([c, p, ps]) => { setCur(c); setPrev(p); setPlatformData(ps.platforms); })
      .catch(e => setError(e.message ?? 'Ошибка'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>;

  const sum = (rows: FinanceSummaryRow[], key: keyof FinanceSummaryRow) =>
    rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const METRICS: { label: string; key: keyof FinanceSummaryRow; color?: string }[] = [
    { label: 'Выручка',            key: 'revenue' },
    { label: 'Комиссия МП',        key: 'commission',    color: 'text-red-600' },
    { label: 'Логистика',          key: 'logistics',     color: 'text-orange-600' },
    { label: 'Штрафы',             key: 'penalty',       color: 'text-amber-600' },
    { label: 'Выплата МП',         key: 'net_payout',    color: 'text-blue-700' },
    { label: 'Себестоимость',      key: 'cost_of_goods', color: 'text-red-600' },
    { label: 'Чистая прибыль',     key: 'gross_profit' },
    { label: 'Кол-во заказов',     key: 'quantity' },
  ];

  function delta(cv: number, pv: number) {
    if (pv === 0) return null;
    return Math.round(((cv - pv) / pv) * 100);
  }

  const maxRevenue = Math.max(...platformData.map(p => p.revenue), 1);
  const totalRevenue = platformData.reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="space-y-5">
      {/* View mode toggle */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button onClick={() => setViewMode('period')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'period' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          ↔ По периодам
        </button>
        <button onClick={() => setViewMode('platform')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'platform' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          🏪 По площадкам
        </button>
      </div>

      {viewMode === 'period' && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            Сравнение: текущие 30 дней vs предыдущие 30 дней
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Показатель</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Пред. 30 дн.</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Текущ. 30 дн.</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Изменение</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {METRICS.map(({ label, key, color }) => {
                    const cv = sum(cur, key);
                    const pv = sum(prev, key);
                    const d = delta(cv, pv);
                    const isProfit = key === 'gross_profit';
                    const valueColor = isProfit
                      ? cv >= 0 ? 'text-green-700' : 'text-red-600'
                      : color ?? 'text-slate-800';
                    return (
                      <tr key={String(key)} className={`hover:bg-slate-50 ${isProfit ? 'font-semibold border-t-2 border-purple-100' : ''}`}>
                        <td className="px-4 py-3 text-slate-700">{label}</td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {key === 'quantity' ? pv.toLocaleString('ru-RU') : `${fmt(pv)} ₽`}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${valueColor}`}>
                          {key === 'quantity' ? cv.toLocaleString('ru-RU') : `${fmt(cv)} ₽`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {d == null ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : (
                            <span className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${
                              d > 0 ? (key === 'commission' || key === 'logistics' || key === 'penalty' || key === 'cost_of_goods' ? 'text-red-600' : 'text-green-600')
                                   : (key === 'commission' || key === 'logistics' || key === 'penalty' || key === 'cost_of_goods' ? 'text-green-600' : 'text-red-600')
                            }`}>
                              {d > 0 ? '↑' : '↓'} {Math.abs(d)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {cur.length === 0 && prev.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">Нет данных. Синхронизируйте финансы.</div>
          )}
        </>
      )}

      {viewMode === 'platform' && (
        <>
          {platformData.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Нет данных. Синхронизируйте финансы.</div>
          ) : (
            <>
              {/* Revenue share bar */}
              {totalRevenue > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-semibold text-slate-700 text-sm mb-4">Доля выручки по площадкам</h3>
                  <div className="flex h-6 rounded-full overflow-hidden gap-0.5">
                    {platformData.map(p => {
                      const pct = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
                      const color = PLATFORM_COLORS[p.platform]?.bar ?? '#94a3b8';
                      return (
                        <div key={p.platform} className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} title={`${PLATFORM_LABELS[p.platform] ?? p.platform}: ${pct.toFixed(1)}%`} />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3">
                    {platformData.map(p => {
                      const pct = totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 100) : 0;
                      const color = PLATFORM_COLORS[p.platform]?.bar ?? '#94a3b8';
                      return (
                        <div key={p.platform} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                          <span>{PLATFORM_LABELS[p.platform] ?? p.platform}</span>
                          <span className="font-semibold">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-platform metric bars */}
              <div className="space-y-3">
                {[
                  { label: 'Выручка',       key: 'revenue' as keyof FinancePlatformSplit },
                  { label: 'Выплата МП',    key: 'net_payout' as keyof FinancePlatformSplit },
                  { label: 'Чистая прибыль', key: 'gross_profit' as keyof FinancePlatformSplit },
                ].map(({ label, key }) => {
                  const maxVal = Math.max(...platformData.map(p => Number(p[key]) || 0), 1);
                  return (
                    <div key={key} className="bg-white rounded-xl border border-slate-200 p-5">
                      <h3 className="font-semibold text-slate-700 text-sm mb-4">{label} по площадкам</h3>
                      <div className="space-y-3">
                        {platformData.map(p => (
                          <PlatformBar
                            key={p.platform}
                            label={PLATFORM_LABELS[p.platform] ?? p.platform}
                            value={Number(p[key]) || 0}
                            max={maxVal}
                            color={PLATFORM_COLORS[p.platform]?.bar ?? '#94a3b8'}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detail table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-700 text-sm">Детальная таблица</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {['Площадка', 'Выручка', 'Выплата', 'Реклама', 'ДРР', 'Прибыль', 'Маржа'].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {platformData.map(p => {
                        const colors = PLATFORM_COLORS[p.platform];
                        return (
                          <tr key={p.platform} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${colors?.bg ?? 'bg-slate-50'} ${colors?.text ?? 'text-slate-600'} ${colors?.border ?? 'border-slate-200'}`}>
                                {PLATFORM_LABELS[p.platform] ?? p.platform}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">{fmt(p.revenue)} ₽</td>
                            <td className="px-4 py-3 text-blue-700">{fmt(p.net_payout)} ₽</td>
                            <td className="px-4 py-3 text-orange-600">{fmt(p.ad_spend)} ₽</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold ${p.drr_pct > 20 ? 'text-red-600' : p.drr_pct > 10 ? 'text-amber-600' : 'text-green-600'}`}>
                                {p.drr_pct.toFixed(1)}%
                              </span>
                            </td>
                            <td className={`px-4 py-3 font-semibold ${p.gross_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {fmt(p.gross_profit)} ₽
                            </td>
                            <td className={`px-4 py-3 font-semibold ${p.margin_pct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {p.margin_pct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function WaterfallTab({ totals }: { totals: {
  revenue: number; commission: number; logistics: number; penalty: number;
  net_payout: number; cost_of_goods: number; gross_profit: number; quantity: number;
} }) {
  if (totals.revenue === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-400">
        <p className="text-sm">Нет данных за выбранный период.</p>
      </div>
    );
  }

  const steps = [
    { label: 'Выручка',      value: totals.revenue,       color: '#7c3aed', positive: true },
    { label: '−Комиссия МП', value: -totals.commission,   color: '#ef4444', positive: false },
    { label: '−Логистика',   value: -totals.logistics,    color: '#f97316', positive: false },
    { label: '−Штрафы',      value: -totals.penalty,      color: '#f59e0b', positive: false },
    { label: '=Выплата МП',  value: totals.net_payout,    color: '#3b82f6', positive: true, isResult: true },
    ...(totals.cost_of_goods > 0 ? [
      { label: '−Себест.',   value: -totals.cost_of_goods, color: '#ec4899', positive: false },
      { label: '=Прибыль',   value: totals.gross_profit,  color: totals.gross_profit >= 0 ? '#22c55e' : '#ef4444', positive: totals.gross_profit >= 0, isResult: true },
    ] : []),
  ];

  const maxVal = Math.max(...steps.map(s => Math.abs(s.value)));
  const W = 700, BAR_H = 36, GAP = 8, PAD_L = 110, PAD_R = 80, PAD_T = 10;
  const totalH = steps.length * (BAR_H + GAP) + PAD_T;
  const barMaxW = W - PAD_L - PAD_R;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Выручка', value: totals.revenue, color: 'text-slate-900' },
          { label: 'Выплата МП', value: totals.net_payout, color: 'text-blue-700' },
          ...(totals.cost_of_goods > 0 ? [{ label: 'Чистая прибыль', value: totals.gross_profit, color: totals.gross_profit >= 0 ? 'text-green-700' : 'text-red-600' }] : []),
          { label: 'Всего вычетов', value: -(totals.commission + totals.logistics + totals.penalty + totals.cost_of_goods), color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{fmt(value)} ₽</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Воронка выручки</h3>
        <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full" style={{ height: totalH }}>
          {steps.map((step, i) => {
            const barW = (Math.abs(step.value) / maxVal) * barMaxW;
            const y = PAD_T + i * (BAR_H + GAP);
            const pct = totals.revenue > 0 ? ((Math.abs(step.value) / totals.revenue) * 100).toFixed(1) : '0';
            return (
              <g key={step.label}>
                <text x={PAD_L - 6} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize="11"
                  fill={step.isResult ? '#1e293b' : '#64748b'} fontWeight={step.isResult ? '600' : '400'}>
                  {step.label}
                </text>
                <rect x={PAD_L} y={y} width={barW} height={BAR_H} rx="4" fill={step.color} opacity={step.isResult ? 1 : 0.8} />
                <text x={PAD_L + barW + 6} y={y + BAR_H / 2 + 4} fontSize="11" fill="#334155" fontWeight="600">
                  {fmt(Math.abs(step.value))} ₽
                </text>
                <text x={W - 4} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {pct}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function FinancePage() {
  const [summary, setSummary] = useState<FinanceSummary[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [noAccess, setNoAccess] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [periodDays, setPeriodDays] = useState(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [tab, setTab] = useState<'summary' | 'records' | 'forecast' | 'waterfall' | 'compare' | 'trend'>('summary');

  function getRange(days = periodDays): { from: string; to: string } {
    if (showCustom && customFrom && customTo) return { from: customFrom, to: customTo };
    const to = today;
    const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    return { from, to };
  }

  const load = useCallback(async (days = periodDays) => {
    const { from, to } = showCustom && customFrom && customTo
      ? { from: customFrom, to: customTo }
      : { from: new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10), to: today };
    setLoading(true);
    setError('');
    try {
      const [sumData, recData] = await Promise.all([
        apiFetch(`/api/finance/summary?from=${from}&to=${to}`),
        apiFetch(`/api/finance/records?from=${from}&to=${to}`),
      ]);
      setSummary(sumData.summary ?? []);
      setRecords(recData.records ?? []);
    } catch (e: any) {
      if (e.message?.includes('403') || e.status === 403) setNoAccess(true);
      else setError(e.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays, showCustom, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError('');
    const { from, to } = getRange();
    try {
      await apiFetch(`/api/finance/sync?from=${from}&to=${to}`, { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }

  if (noAccess) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-4">
        <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800">Нужен тариф «Бизнес»</h2>
        <p className="text-slate-500 text-sm">Финансовая аналитика и P&L доступны с тарифа Бизнес (990 ₽/мес)</p>
        <Link href="/pricing" className="inline-block px-5 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors">
          Посмотреть тарифы
        </Link>
      </div>
    );
  }

  const totals = summary.reduce(
    (acc, s) => ({
      revenue: acc.revenue + s.revenue,
      commission: acc.commission + s.commission,
      logistics: acc.logistics + s.logistics,
      penalty: acc.penalty + s.penalty,
      net_payout: acc.net_payout + s.net_payout,
      cost_of_goods: acc.cost_of_goods + s.cost_of_goods,
      gross_profit: acc.gross_profit + s.gross_profit,
      quantity: acc.quantity + s.quantity,
    }),
    { revenue: 0, commission: 0, logistics: 0, penalty: 0, net_payout: 0, cost_of_goods: 0, gross_profit: 0, quantity: 0 }
  );
  const marginPct = totals.revenue > 0 ? Math.round((totals.gross_profit / totals.revenue) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Финансы</h1>
          <p className="text-slate-500 text-sm mt-0.5">P&L по маркетплейсам с учётом всех комиссий</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'forecast' && tab !== 'waterfall' && tab !== 'compare' && tab !== 'trend' && (
            <>
              {/* Period picker */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {PERIODS.map(p => (
                  <button
                    key={p.days}
                    onClick={() => { setShowCustom(false); setPeriodDays(p.days); load(p.days); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      !showCustom && periodDays === p.days ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowCustom(v => !v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    showCustom ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Период…
                </button>
              </div>

              {/* Custom date range inputs */}
              {showCustom && (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={customFrom} max={customTo || today}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
                  <span className="text-slate-400 text-xs">—</span>
                  <input type="date" value={customTo} min={customFrom} max={today}
                    onChange={e => setCustomTo(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
                  <button
                    onClick={() => { if (customFrom && customTo) load(); }}
                    disabled={!customFrom || !customTo}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Применить
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <a
                  href={`/api/finance/export?from=${getRange().from}&to=${getRange().to}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  CSV
                </a>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {syncing ? 'Загрузка...' : 'Обновить данные'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([['summary', 'Сводка'], ['records', 'По товарам'], ['waterfall', '📊 Воронка'], ['compare', '↔ Сравнение'], ['trend', '📈 Динамика'], ['forecast', 'Прогноз']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'forecast' && <ForecastTab />}
      {tab === 'waterfall' && <WaterfallTab totals={totals} />}
      {tab === 'compare' && <ComparisonTab />}
      {tab === 'trend' && <WeeklyTrendTab />}

      {tab !== 'forecast' && tab !== 'waterfall' && tab !== 'compare' && tab !== 'trend' && error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {tab !== 'forecast' && tab !== 'waterfall' && tab !== 'compare' && tab !== 'trend' && (loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === 'summary' && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Выручка', value: fmt(totals.revenue), sub: '₽ продаж', color: 'text-slate-900' },
                  { label: 'Выплата МП', value: fmt(totals.net_payout), sub: '₽ от маркетплейса', color: 'text-blue-700' },
                  { label: 'Чистая прибыль', value: fmt(totals.gross_profit), sub: '₽ после себест.', color: totals.gross_profit >= 0 ? 'text-green-700' : 'text-red-600' },
                  { label: 'Маржа', value: `${marginPct}%`, sub: 'от выручки', color: marginPct >= 20 ? 'text-green-700' : marginPct >= 10 ? 'text-amber-600' : 'text-red-600' },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Commission breakdown */}
              {totals.revenue > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">Структура расходов</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    {[
                      { label: 'Комиссия МП', value: totals.commission, pct: (totals.commission / totals.revenue * 100).toFixed(1) },
                      { label: 'Логистика', value: totals.logistics, pct: (totals.logistics / totals.revenue * 100).toFixed(1) },
                      { label: 'Штрафы', value: totals.penalty, pct: (totals.penalty / totals.revenue * 100).toFixed(1) },
                    ].map(({ label, value, pct }) => (
                      <div key={label}>
                        <p className="text-xs text-slate-500 mb-1">{label}</p>
                        <p className="text-lg font-semibold text-slate-800">{fmt(value)} ₽</p>
                        <p className="text-xs text-slate-400">{pct}% от выручки</p>
                      </div>
                    ))}
                  </div>
                  {totals.cost_of_goods > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                      <p className="text-xs text-slate-500 mb-1">Себестоимость товаров</p>
                      <p className="text-lg font-semibold text-slate-800">{fmt(totals.cost_of_goods)} ₽</p>
                      <p className="text-xs text-slate-400">{(totals.cost_of_goods / totals.revenue * 100).toFixed(1)}% от выручки</p>
                    </div>
                  )}
                  {totals.cost_of_goods === 0 && (
                    <p className="text-xs text-slate-400 text-center mt-3">
                      Чтобы видеть чистую прибыль —{' '}
                      <Link href="/warehouse" className="text-purple-600 hover:underline">укажите цены закупки</Link> на странице Склад
                    </p>
                  )}
                </div>
              )}

              {/* Per-platform breakdown */}
              {summary.length > 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {summary.map(s => (
                    <div key={s.platform} className="bg-white rounded-xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-700 mb-3">{PLATFORM_LABELS[s.platform] ?? s.platform}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-slate-500 text-xs">Выручка</span><p className="font-semibold">{fmt(s.revenue)} ₽</p></div>
                        <div><span className="text-slate-500 text-xs">Выплата</span><p className="font-semibold text-blue-700">{fmt(s.net_payout)} ₽</p></div>
                        <div><span className="text-slate-500 text-xs">Комиссия</span><p className="text-slate-700">{fmt(s.commission)} ₽</p></div>
                        <div><span className="text-slate-500 text-xs">Логистика</span><p className="text-slate-700">{fmt(s.logistics)} ₽</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'records' && (
            <>
              {records.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700">По товарам</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-2.5 text-left text-xs text-slate-500 font-medium">Товар</th>
                          <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Кол-во</th>
                          <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Выручка</th>
                          <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Комиссия</th>
                          <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Выплата</th>
                          <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Прибыль</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {records.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-800 truncate max-w-[200px]">{r.title || r.sku}</p>
                              <p className="text-xs text-slate-400">{PLATFORM_LABELS[r.platform] ?? r.platform} · {r.sku}</p>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">{r.quantity}</td>
                            <td className="px-4 py-3 text-right text-slate-700">{fmt(r.revenue)} ₽</td>
                            <td className="px-4 py-3 text-right text-slate-500">{fmt(r.commission)} ₽</td>
                            <td className="px-4 py-3 text-right font-medium text-blue-700">{fmt(r.net_payout)} ₽</td>
                            <td className="px-4 py-3 text-right font-medium">
                              {r.gross_profit != null
                                ? <span className={r.gross_profit >= 0 ? 'text-green-700' : 'text-red-600'}>{fmt(r.gross_profit)} ₽</span>
                                : <span className="text-slate-300 text-xs">нет закупки</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-400">
                  <p className="text-sm">Нет данных за выбранный период. Нажмите «Обновить данные».</p>
                </div>
              )}
            </>
          )}
        </>
      ))}
    </div>
  );
}

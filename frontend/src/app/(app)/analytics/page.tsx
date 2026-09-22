'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAnalyticsSummary, invalidateAnalyticsCache, getRevenueCalendar, getAnalyticsDow, getAnalyticsDigest } from '@/lib/api';
import type { AnalyticsSummary, SalesDayChart, CalendarData, CalendarDay, DowPoint, AnalyticsDigest } from '@/lib/api';

type Period = '7d' | '30d' | '90d';

const PERIOD_LABELS: Record<Period, string> = { '7d': '7 дней', '30d': '30 дней', '90d': '90 дней' };

function fmt(n: number) { return Math.round(n).toLocaleString('ru-RU'); }

function KpiCard({ label, value, sub, color = 'slate' }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    purple: 'from-purple-600 to-purple-800 text-white',
    green: 'bg-green-50 border-green-200 text-green-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
  };
  const cls = colors[color] ?? colors.slate;
  const isGradient = color === 'purple';
  return (
    <div className={`rounded-xl border p-4 ${isGradient ? 'bg-gradient-to-br ' + cls : cls}`}>
      <p className={`text-xs font-medium mb-1 ${isGradient ? 'text-purple-200' : 'opacity-70'}`}>{label}</p>
      <p className={`text-2xl font-bold leading-none ${isGradient ? '' : ''}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${isGradient ? 'text-purple-200' : 'opacity-60'}`}>{sub}</p>}
    </div>
  );
}

function RevenueChart({ data, height = 140 }: { data: SalesDayChart[]; height?: number }) {
  if (!data.length) return <div className="h-36 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-sm text-slate-400">Нет данных</div>;

  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const W = 800; const PAD_L = 0; const PAD_R = 0; const PAD_T = 10; const PAD_B = 24;
  const chartH = height - PAD_T - PAD_B;
  const chartW = W - PAD_L - PAD_R;
  const n = data.length;

  const px = (i: number) => PAD_L + (i / Math.max(n - 1, 1)) * chartW;
  const py = (v: number) => PAD_T + chartH - (v / maxVal) * chartH;

  const wbPoints = data.map((d, i) => `${px(i)},${py(d.wb)}`).join(' ');
  const ozPoints = data.map((d, i) => `${px(i)},${py(d.ozon)}`).join(' ');
  const ymPoints = data.map((d, i) => `${px(i)},${py(d.ym ?? 0)}`).join(' ');
  const mmPoints = data.map((d, i) => `${px(i)},${py(d.mm ?? 0)}`).join(' ');
  const totalPoints = data.map((d, i) => `${px(i)},${py(d.total)}`).join(' ');

  const areaPath = (points: { x: number; y: number }[], color: string) => {
    if (!points.length) return null;
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const closeD = `${d} L${points[points.length - 1].x},${height - PAD_B} L${points[0].x},${height - PAD_B} Z`;
    return <path d={closeD} fill={color} fillOpacity={0.08} />;
  };

  const wbPts = data.map((d, i) => ({ x: px(i), y: py(d.wb) }));
  const ozPts = data.map((d, i) => ({ x: px(i), y: py(d.ozon) }));
  const ymPts = data.map((d, i) => ({ x: px(i), y: py(d.ym ?? 0) }));
  const mmPts = data.map((d, i) => ({ x: px(i), y: py(d.mm ?? 0) }));

  const labelIdxs = n <= 7 ? data.map((_, i) => i) : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }}>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={PAD_L} y1={PAD_T + chartH * (1 - t)} x2={W - PAD_R} y2={PAD_T + chartH * (1 - t)}
          stroke="#e2e8f0" strokeWidth="1" />
      ))}
      {areaPath(wbPts, '#818cf8')}
      {areaPath(ozPts, '#34d399')}
      {areaPath(ymPts, '#fbbf24')}
      {areaPath(mmPts, '#4ade80')}
      <polyline points={wbPoints} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={ozPoints} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={ymPoints} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={mmPoints} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={totalPoints} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" strokeLinejoin="round" />
      {labelIdxs.map((i) => (
        <text key={i} x={px(i)} y={height - 2} textAnchor="middle" fontSize="11" fill="#94a3b8">
          {data[i].date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

function PlatformBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{fmt(value)} ₽ · {pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Revenue Calendar ─────────────────────────────────────────────────────

const INTENSITY_COLORS = [
  'bg-slate-100',
  'bg-purple-100',
  'bg-purple-300',
  'bg-purple-500',
  'bg-purple-700',
];

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function CalendarTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<CalendarDay | null>(null);

  useEffect(() => {
    setLoading(true);
    getRevenueCalendar(year, month).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  // Build calendar grid
  const daysInMonth = new Date(year, month, 0).getDate();
  // 0=Sun→Mon-indexed: Monday first
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7; // 0=Mon
  const dayMap: Record<string, CalendarDay> = {};
  data?.days.forEach(d => { dayMap[d.date] = d; });

  const cells: (null | { date: string; day: number })[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { date: dateStr, day: d };
    }),
  ];

  const totalRevenue = data?.days.reduce((s, d) => s + d.revenue, 0) ?? 0;
  const activeDays = data?.days.filter(d => d.revenue > 0).length ?? 0;
  const bestDay = data?.days.reduce((best, d) => d.revenue > (best?.revenue ?? 0) ? d : best, null as CalendarDay | null);

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-base font-semibold text-slate-800">{MONTH_NAMES[month - 1]} {year}</h2>
        <button onClick={nextMonth} disabled={year === now.getFullYear() && month === now.getMonth() + 1}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold text-slate-900">{Math.round(totalRevenue).toLocaleString('ru-RU')} ₽</p>
          <p className="text-xs text-slate-500">Выручка за месяц</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold text-purple-700">{activeDays}</p>
          <p className="text-xs text-slate-500">Активных дней</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold text-green-700">
            {bestDay ? `${Math.round(bestDay.revenue).toLocaleString('ru-RU')} ₽` : '—'}
          </p>
          <p className="text-xs text-slate-500">Лучший день</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          {/* Day labels */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-xs text-slate-400 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} />;
              const info = dayMap[cell.date];
              const intensity = info?.intensity ?? 0;
              const isToday = cell.date === now.toISOString().slice(0, 10);
              return (
                <div
                  key={cell.date}
                  className={`relative aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all
                    ${INTENSITY_COLORS[intensity]}
                    ${isToday ? 'ring-2 ring-purple-500' : ''}
                    ${info ? 'hover:scale-105' : ''}
                  `}
                  onMouseEnter={() => info && setTooltip(info)}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <span className={`text-xs font-medium ${intensity >= 3 ? 'text-white' : 'text-slate-700'}`}>
                    {cell.day}
                  </span>
                  {info && (
                    <span className={`text-[9px] leading-none mt-0.5 ${intensity >= 3 ? 'text-purple-200' : 'text-purple-600'}`}>
                      {info.revenue >= 1000 ? `${(info.revenue / 1000).toFixed(0)}к` : info.revenue}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 justify-end">
            <span className="text-xs text-slate-400">Меньше</span>
            {INTENSITY_COLORS.map((c, i) => (
              <div key={i} className={`w-4 h-4 rounded-sm ${c} border border-slate-200`} />
            ))}
            <span className="text-xs text-slate-400">Больше</span>
          </div>
        </div>
      )}

      {/* Tooltip card */}
      {tooltip && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm">
          <p className="font-semibold text-slate-800 mb-2">{new Date(tooltip.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <div className="grid grid-cols-3 gap-3">
            <div><p className="text-xs text-slate-500">Выручка</p><p className="font-bold text-slate-800">{Math.round(tooltip.revenue).toLocaleString('ru-RU')} ₽</p></div>
            <div><p className="text-xs text-slate-500">Выплата</p><p className="font-bold text-green-700">{Math.round(tooltip.net_payout).toLocaleString('ru-RU')} ₽</p></div>
            <div><p className="text-xs text-slate-500">Кол-во</p><p className="font-bold text-slate-800">{tooltip.qty} шт.</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

const DOW_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function DowTab() {
  const [data, setData] = useState<DowPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'30d' | '90d' | '180d'>('90d');

  useEffect(() => {
    setLoading(true);
    getAnalyticsDow(period).then(d => setData(d)).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data.length) return <div className="text-center py-16 text-slate-400">Нет данных</div>;

  const maxRev = Math.max(...data.map(d => d.avg_revenue), 1);
  const best = data.reduce((b, d) => d.avg_revenue > b.avg_revenue ? d : b, data[0]);
  const worst = data.reduce((w, d) => d.avg_revenue < w.avg_revenue ? d : w, data[0]);

  const BAR_H = 160;
  const BAR_W = 48;
  const GAP = 16;
  const PAD_L = 44;
  const PAD_B = 28;
  const PAD_T = 12;
  const svgW = PAD_L + data.length * (BAR_W + GAP) + 12;
  const svgH = BAR_H + PAD_T + PAD_B;

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">Выручка по дням недели</h2>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(['30d', '90d', '180d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {p === '30d' ? '30 дней' : p === '90d' ? '90 дней' : '180 дней'}
            </button>
          ))}
        </div>
      </div>

      {/* Best/worst highlights */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium mb-1">Лучший день</p>
          <p className="text-xl font-bold text-green-800">{DOW_NAMES[best.dow]}</p>
          <p className="text-sm text-green-700 mt-0.5">{fmt(best.avg_revenue)} ₽ · {Math.round(best.avg_qty)} шт. (ср.)</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-red-500 font-medium mb-1">Слабый день</p>
          <p className="text-xl font-bold text-red-700">{DOW_NAMES[worst.dow]}</p>
          <p className="text-sm text-red-600 mt-0.5">{fmt(worst.avg_revenue)} ₽ · {Math.round(worst.avg_qty)} шт. (ср.)</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ height: svgH, minWidth: svgW }} className="w-full">
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = PAD_T + BAR_H * (1 - t);
            return (
              <g key={t}>
                <line x1={PAD_L - 4} y1={y} x2={svgW} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {Math.round(maxRev * t / 1000)}к
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const barH = (d.avg_revenue / maxRev) * BAR_H;
            const x = PAD_L + i * (BAR_W + GAP);
            const y = PAD_T + BAR_H - barH;
            const isBest = d.dow === best.dow;
            const isWorst = d.dow === worst.dow;
            const fill = isBest ? '#10b981' : isWorst ? '#f87171' : '#818cf8';
            return (
              <g key={d.dow}>
                <rect x={x} y={y} width={BAR_W} height={barH} fill={fill} rx="4" opacity="0.85" />
                <text x={x + BAR_W / 2} y={PAD_T + BAR_H + 14} textAnchor="middle" fontSize="12" fill="#64748b" fontWeight="500">
                  {DOW_NAMES[d.dow]}
                </text>
                <text x={x + BAR_W / 2} y={y - 4} textAnchor="middle" fontSize="10" fill={fill}>
                  {Math.round(d.avg_revenue / 1000)}к
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left">День</th>
              <th className="px-4 py-2.5 text-right">Ср. выручка</th>
              <th className="px-4 py-2.5 text-right">Всего выручка</th>
              <th className="px-4 py-2.5 text-right">Ср. заказов</th>
              <th className="px-4 py-2.5 text-right">Всего заказов</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map(d => {
              const isBest = d.dow === best.dow;
              const isWorst = d.dow === worst.dow;
              return (
                <tr key={d.dow} className={isBest ? 'bg-green-50' : isWorst ? 'bg-red-50' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {DOW_NAMES[d.dow]}
                    {isBest && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">лучший</span>}
                    {isWorst && <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">слабый</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmt(d.avg_revenue)} ₽</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{fmt(d.total_revenue)} ₽</td>
                  <td className="px-4 py-2.5 text-right">{Math.round(d.avg_qty)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{d.total_qty}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- AI Digest tab ----
function DigestTab() {
  const [digest, setDigest] = useState<AnalyticsDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const d = await getAnalyticsDigest();
      setDigest(d);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  }

  const moodConfig = {
    positive: { icon: '📈', color: 'text-green-700', bg: 'bg-green-50 border-green-200', label: 'Положительная динамика' },
    neutral: { icon: '📊', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', label: 'Стабильно' },
    negative: { icon: '📉', color: 'text-red-700', bg: 'bg-red-50 border-red-200', label: 'Требует внимания' },
  };

  function fmtNum(n: number) { return Math.round(n).toLocaleString('ru-RU'); }
  function pctChange(cur: number, prev: number) {
    if (prev === 0) return null;
    const p = Math.round(((cur - prev) / prev) * 100);
    return { pct: p, up: p >= 0 };
  }

  return (
    <div className="space-y-5">
      {/* Generate button */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-slate-800">AI Итоги недели</h2>
          <p className="text-sm text-slate-500 mt-0.5">Сравнение последних 7 дней с предыдущими 7 днями — итоги и рекомендации от ИИ</p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Анализируем...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Сформировать отчёт
            </>
          )}
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

      {digest && (() => {
        const mood = moodConfig[digest.mood] ?? moodConfig.neutral;
        const revChg = pctChange(digest.current.revenue, digest.previous.revenue);
        const ordChg = pctChange(digest.current.orders, digest.previous.orders);
        return (
          <div className="space-y-4">
            {/* KPI comparison strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Выручка', cur: digest.current.revenue, prev: digest.previous.revenue, fmt: (v: number) => `${fmtNum(v)} ₽` },
                { label: 'Заказы', cur: digest.current.orders, prev: digest.previous.orders, fmt: (v: number) => String(v) },
                { label: 'Выплаты', cur: digest.current.net_payout, prev: digest.previous.net_payout, fmt: (v: number) => `${fmtNum(v)} ₽` },
                { label: 'Активных SKU', cur: digest.current.active_skus, prev: digest.previous.active_skus, fmt: (v: number) => String(v) },
              ].map(({ label, cur, prev, fmt: fmtFn }) => {
                const chg = pctChange(cur, prev);
                return (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className="text-xl font-bold text-slate-900">{fmtFn(cur)}</p>
                    {chg !== null ? (
                      <p className={`text-xs mt-0.5 font-medium ${chg.up ? 'text-green-600' : 'text-red-500'}`}>
                        {chg.up ? '+' : ''}{chg.pct}% к прошлой неделе
                      </p>
                    ) : (
                      <p className="text-xs mt-0.5 text-slate-400">нет данных за пред. неделю</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Mood + Summary */}
            <div className={`rounded-xl border p-5 ${mood.bg}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{mood.icon}</span>
                <span className={`text-sm font-semibold ${mood.color}`}>{mood.label}</span>
                <span className="text-xs text-slate-400 ml-auto">
                  {new Date(digest.generated_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">{digest.summary}</p>
            </div>

            {/* Highlights + Recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Ключевые наблюдения</h3>
                <ul className="space-y-3">
                  {digest.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Действия на следующую неделю</h3>
                <ul className="space-y-3">
                  {digest.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <svg className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Top SKUs this week */}
            {digest.top_skus.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Топ товаров за неделю</h3>
                <div className="space-y-2">
                  {digest.top_skus.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{s.title || s.sku}</p>
                        <p className="text-xs text-slate-400">{s.sku} · {s.platform.toUpperCase()}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-800">{fmtNum(s.revenue)} ₽</p>
                        <p className="text-xs text-slate-400">{s.orders} зак.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {!digest && !loading && (
        <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-slate-200">
          <div className="text-5xl mb-4">🤖</div>
          <p className="font-semibold text-slate-700 mb-1">Отчёт ещё не сформирован</p>
          <p className="text-sm text-slate-400">Нажмите «Сформировать отчёт» чтобы получить AI-анализ за неделю</p>
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<'overview' | 'calendar' | 'dow' | 'digest'>('overview');
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setError('');
    try {
      const result = await getAnalyticsSummary(p);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await invalidateAnalyticsCache().catch(() => {});
    await load(period);
    setRefreshing(false);
  }

  const s = data?.summary;
  const byWb = data?.byPlatform.wb;
  const byOzon = data?.byPlatform.ozon;
  const byYm = data?.byPlatform.ym;
  const byMm = data?.byPlatform.mm;
  const totalRev = (byWb?.revenue ?? 0) + (byOzon?.revenue ?? 0) + (byYm?.revenue ?? 0) + (byMm?.revenue ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Аналитика продаж</h1>
          <p className="text-slate-500 mt-1">Сводные данные по всем подключённым магазинам</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['7d', '30d', '90d'] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button onClick={handleRefresh} disabled={refreshing || loading}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {([['overview', 'Обзор'], ['calendar', 'Календарь'], ['dow', 'По дням'], ['digest', 'AI Итоги']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>{l}</button>
        ))}
      </div>

      {tab === 'calendar' && <CalendarTab />}
      {tab === 'dow' && <DowTab />}
      {tab === 'digest' && <DigestTab />}

      {error && tab === 'overview' && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

      {tab === 'overview' && (loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KpiCard label="Выручка" value={`${fmt(s?.totalRevenue ?? 0)} ₽`} sub={PERIOD_LABELS[period]} color="purple" />
            <KpiCard label="Заказы" value={String(s?.totalOrders ?? 0)} sub="штук" color="blue" />
            <KpiCard label="Чистая выплата" value={`${fmt(s?.totalNetPayout ?? 0)} ₽`} sub="после комиссий" color="green" />
            <KpiCard label="Возвраты" value={String(s?.totalReturns ?? 0)} sub={`${s?.returnRate ?? 0}% от заказов`} color={(s?.returnRate ?? 0) > 10 ? 'red' : 'slate'} />
            <KpiCard label="Ср. чек" value={`${fmt(s && s.totalOrders > 0 ? (s.totalRevenue / s.totalOrders) : 0)} ₽`} color="slate" />
          </div>

          {/* Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Выручка по дням</h2>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-400 rounded inline-block" />WB</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 rounded inline-block" />Ozon</span>
                {(byYm?.revenue ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 rounded inline-block" />Яндекс</span>}
                {(byMm?.revenue ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-500 rounded inline-block" />Мегамаркет</span>}
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-slate-300 rounded inline-block border-dashed" />Итого</span>
              </div>
            </div>
            <RevenueChart data={data.chart} height={160} />
          </div>

          {/* Platform breakdown */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-slate-800">По площадкам</h2>
              <PlatformBar label="Wildberries" value={byWb?.revenue ?? 0} total={totalRev} color="bg-pink-400" />
              <PlatformBar label="Ozon" value={byOzon?.revenue ?? 0} total={totalRev} color="bg-blue-400" />
              {(byYm?.revenue ?? 0) > 0 && <PlatformBar label="Яндекс Маркет" value={byYm?.revenue ?? 0} total={totalRev} color="bg-amber-400" />}
              {(byMm?.revenue ?? 0) > 0 && <PlatformBar label="Мегамаркет" value={byMm?.revenue ?? 0} total={totalRev} color="bg-green-400" />}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'WB заказы', val: byWb?.orders ?? 0 },
                  { label: 'Ozon заказы', val: byOzon?.orders ?? 0 },
                  ...(( byYm?.orders ?? 0) > 0 ? [{ label: 'YM заказы', val: byYm!.orders }] : []),
                  ...(( byMm?.orders ?? 0) > 0 ? [{ label: 'MM заказы', val: byMm!.orders }] : []),
                  { label: 'WB возвраты', val: byWb?.returns ?? 0 },
                  { label: 'Ozon возвраты', val: byOzon?.returns ?? 0 },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <p className="text-slate-500 text-xs">{label}</p>
                    <p className="font-semibold text-slate-800">{val}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Stock alerts */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="font-semibold text-slate-800 mb-3">
                Остатки
                {data.stockAlerts.length > 0 && (
                  <span className="ml-2 text-xs font-normal px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                    {data.stockAlerts.length} требуют пополнения
                  </span>
                )}
              </h2>
              {data.stockAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">Все товары в наличии</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {data.stockAlerts.map((a, i) => (
                    <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg text-sm ${
                      a.level === 'critical' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
                    }`}>
                      <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        a.level === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                      }`}>{a.stock}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{a.title || a.sku}</p>
                        <p className="text-xs text-slate-500">
                          {({ wb: 'WB', ozon: 'Ozon', ym: 'Яндекс Маркет', mm: 'Мегамаркет' } as Record<string, string>)[a.platform] ?? a.platform}
                          {' '}· {a.level === 'critical' ? 'Нет в наличии' : 'Мало'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Finance detail */}
          {(s?.totalNetPayout ?? 0) > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="font-semibold text-slate-800 mb-4">Финансовая разбивка</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Выручка', value: s?.totalRevenue ?? 0, color: 'text-slate-900' },
                  { label: 'Комиссии', value: -(s ? s.totalRevenue - s.totalNetPayout : 0), color: 'text-red-600' },
                  { label: 'Возвраты', value: -(s?.totalReturns ?? 0) > 0 ? -(s?.totalReturns ?? 0) : 0, color: 'text-amber-600' },
                  { label: 'Выплата продавцу', value: s?.totalNetPayout ?? 0, color: 'text-green-600' },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                    <p className={`text-xl font-bold ${item.color}`}>{fmt(Math.abs(item.value))} ₽</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.connections.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">📊</div>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Нет данных для анализа</h2>
              <p className="text-slate-500 text-sm mb-6">
                Подключите магазин WB, Ozon, Яндекс Маркет или Мегамаркет чтобы видеть аналитику продаж
              </p>
              <a href="/connections" className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 transition-colors text-sm">
                Подключить магазин
              </a>
            </div>
          )}
        </>
      ) : null)}
    </div>
  );
}

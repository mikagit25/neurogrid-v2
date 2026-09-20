'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAnalyticsSummary, invalidateAnalyticsCache } from '@/lib/api';
import type { AnalyticsSummary, SalesDayChart } from '@/lib/api';

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

export default function AnalyticsPage() {
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

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

      {loading ? (
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
      ) : null}
    </div>
  );
}

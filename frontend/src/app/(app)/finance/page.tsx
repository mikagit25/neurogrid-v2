'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiRequest as apiFetch } from '@/lib/api';

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

const PLATFORM_LABELS: Record<string, string> = { wb: 'WildBerries', ozon: 'Ozon' };

function fmt(n: number) { return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

const PERIODS = [
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
  { label: '90 дней', days: 90 },
];

export default function FinancePage() {
  const [summary, setSummary] = useState<FinanceSummary[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [noAccess, setNoAccess] = useState(false);
  const [periodDays, setPeriodDays] = useState(30);
  const [tab, setTab] = useState<'summary' | 'records'>('summary');

  function getRange(days: number) {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    return { from, to };
  }

  const load = useCallback(async (days = periodDays) => {
    const { from, to } = getRange(days);
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
  }, [periodDays]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError('');
    const { from, to } = getRange(periodDays);
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
        <div className="flex items-center gap-2">
          {/* Period picker */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {PERIODS.map(p => (
              <button
                key={p.days}
                onClick={() => { setPeriodDays(p.days); load(p.days); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  periodDays === p.days ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
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
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
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
                  { label: 'Комиссия МП', value: totals.commission, pct: totals.revenue > 0 ? (totals.commission / totals.revenue * 100).toFixed(1) : '0' },
                  { label: 'Логистика', value: totals.logistics, pct: totals.revenue > 0 ? (totals.logistics / totals.revenue * 100).toFixed(1) : '0' },
                  { label: 'Штрафы', value: totals.penalty, pct: totals.revenue > 0 ? (totals.penalty / totals.revenue * 100).toFixed(1) : '0' },
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
                  <p className="text-xs text-slate-400">
                    {totals.cost_of_goods === 0 ? 'Укажите цены закупки на странице Склад' : `${(totals.cost_of_goods / totals.revenue * 100).toFixed(1)}% от выручки`}
                  </p>
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

          {/* Records table */}
          {records.length > 0 && (
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
          )}

          {records.length === 0 && !loading && (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-400">
              <p className="text-sm">Нет данных за выбранный период. Нажмите «Обновить данные».</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

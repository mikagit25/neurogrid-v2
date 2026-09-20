'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getRuns, getScenarios, getConnections, getProducts, apiRequest } from '@/lib/api';
import { getUser } from '@/lib/auth';
import type { Run, Scenario, Connection, ProductSummary } from '@/lib/api';

/* ── Types ───────────────────────────────────────────────────────────────── */

interface StockRow {
  platform: string;
  sku: string;
  title: string;
  warehouse_type: 'fbo' | 'fbs';
  warehouse_name: string;
  quantity: number;
}

interface FinancePlatform {
  platform: string;
  revenue: number;
  net_payout: number;
  gross_profit?: number;
  margin_pct?: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const PLATFORM_LABELS: Record<string, string> = {
  wb: 'WB', ozon: 'Ozon', ym: 'YM', mm: 'MM',
};

const PLATFORM_COLORS: Record<string, string> = {
  wb: 'bg-[#CB11AB]/10 text-[#CB11AB]',
  ozon: 'bg-blue-100 text-blue-700',
  ym: 'bg-yellow-100 text-yellow-700',
  mm: 'bg-green-100 text-green-700',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  success: 'Успешно',
  error: 'Ошибка',
};

const STATUS_CLASSES: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[status] || 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('ru-RU');
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [productSummary, setProductSummary] = useState<ProductSummary | null>(null);
  const [stocks, setStocks] = useState<StockRow[] | null>(null);
  const [stocksAccessible, setStocksAccessible] = useState(true);
  const [financeSummary, setFinanceSummary] = useState<FinancePlatform[] | null>(null);
  const [financeAccessible, setFinanceAccessible] = useState(true);
  const [loading, setLoading] = useState(true);
  const user = getUser();

  useEffect(() => {
    async function load() {
      try {
        const [runsData, scenariosData, connsData] = await Promise.all([
          getRuns(20),
          getScenarios(),
          getConnections(),
        ]);
        setRuns(runsData);
        setScenarios(scenariosData);
        setConnections(connsData);

        if (connsData.length > 0) {
          // Products
          try {
            const { summary } = await getProducts(undefined, 50);
            setProductSummary(summary);
          } catch { /* no products yet */ }

          // Warehouse stocks (requires start/business plan)
          try {
            const data = await apiRequest('/api/warehouse/stocks');
            setStocks(data.stocks ?? []);
          } catch (e: any) {
            if (e.status === 403) setStocksAccessible(false);
          }

          // Finance summary last 30 days (requires business plan)
          try {
            const to = new Date().toISOString().slice(0, 10);
            const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
            const data = await apiRequest(`/api/finance/summary?from=${from}&to=${to}`);
            setFinanceSummary(data.summary ?? []);
          } catch (e: any) {
            if (e.status === 403) setFinanceAccessible(false);
          }
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Runs today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const runsToday = runs.filter((r) => new Date(r.created_at) >= today).length;
  const lastFiveRuns = runs.slice(0, 5);

  // Stock derived values
  const totalItems = stocks?.reduce((s, r) => s + r.quantity, 0) ?? 0;
  const totalFbo = stocks?.filter(r => r.warehouse_type === 'fbo').reduce((s, r) => s + r.quantity, 0) ?? 0;
  const totalFbs = stocks?.filter(r => r.warehouse_type === 'fbs').reduce((s, r) => s + r.quantity, 0) ?? 0;
  const lowStockCount = (() => {
    if (!stocks) return 0;
    const bySku = new Map<string, number>();
    for (const s of stocks) {
      const key = `${s.platform}:${s.sku}`;
      bySku.set(key, (bySku.get(key) ?? 0) + s.quantity);
    }
    return Array.from(bySku.values()).filter(q => q <= 10).length;
  })();

  // Finance derived values
  const totalRevenue = financeSummary?.reduce((s, r) => s + r.revenue, 0) ?? 0;
  const totalNetPayout = financeSummary?.reduce((s, r) => s + r.net_payout, 0) ?? 0;
  const totalGrossProfit = financeSummary?.reduce((s, r) => s + (r.gross_profit ?? 0), 0) ?? 0;
  const avgMargin = totalRevenue > 0 ? Math.round((totalGrossProfit / totalRevenue) * 100) : 0;

  const hasConnections = connections.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Дашборд</h1>
        <p className="text-slate-500 mt-1">Добро пожаловать в NeuroGrid</p>
      </div>

      {/* Onboarding for new users */}
      {!loading && !hasConnections && (
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-6 text-white">
          <h2 className="font-bold text-lg mb-1">Начните за 3 шага</h2>
          <p className="text-purple-200 text-sm mb-5">Первый результат — через 2 минуты после подключения магазина</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { n: '1', title: 'Подключите магазин', desc: 'API-ключ WB, Ozon, YM или Мегамаркет', href: '/connections', cta: 'Подключить →' },
              { n: '2', title: 'Откройте каталог', desc: 'Увидите Listing Score каждого товара', href: '/products', cta: 'Каталог →' },
              { n: '3', title: 'Включите агентов', desc: 'Автоответы, мониторинг цен, SEO', href: '/automations', cta: 'Автоматизации →' },
            ].map((s) => (
              <Link key={s.n} href={s.href} className="bg-white/10 hover:bg-white/20 rounded-xl p-4 transition-colors block">
                <div className="w-7 h-7 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center mb-3">{s.n}</div>
                <p className="font-semibold text-sm">{s.title}</p>
                <p className="text-purple-200 text-xs mt-0.5 mb-3">{s.desc}</p>
                <span className="text-xs font-medium text-purple-200">{s.cta}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Product quality */}
      {productSummary && productSummary.total > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800">Качество каталога</h2>
              <p className="text-sm text-slate-500 mt-0.5">{productSummary.total} товаров · средний балл {productSummary.avgScore}/100</p>
            </div>
            <Link href="/products" className="text-sm text-purple-600 hover:text-purple-700 font-medium">Открыть каталог →</Link>
          </div>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3">
            {productSummary.poor > 0 && <div className="bg-red-400" style={{ flex: productSummary.poor }} />}
            {productSummary.average > 0 && <div className="bg-amber-400" style={{ flex: productSummary.average }} />}
            {productSummary.good > 0 && <div className="bg-blue-400" style={{ flex: productSummary.good }} />}
            {productSummary.excellent > 0 && <div className="bg-green-400" style={{ flex: productSummary.excellent }} />}
          </div>
          <div className="flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />{productSummary.poor} плохих</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{productSummary.average} средних</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />{productSummary.good} хороших</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />{productSummary.excellent} отличных</span>
          </div>
          {productSummary.poor + productSummary.average > 0 && (
            <Link href="/products?filter=poor" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Улучшить {productSummary.poor + productSummary.average} товаров с AI
            </Link>
          )}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">Баланс</p>
          <p className="text-2xl font-bold text-slate-900">
            {user ? user.balance.toLocaleString('ru-RU') : '—'} ₽
          </p>
          <Link href="/wallet" className="mt-3 inline-block text-sm text-purple-600 hover:text-purple-700 font-medium">
            Пополнить →
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">Запусков сегодня</p>
          <p className="text-2xl font-bold text-slate-900">{runsToday}</p>
          <Link href="/runs" className="mt-3 inline-block text-sm text-purple-600 hover:text-purple-700 font-medium">
            История →
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">Подключений</p>
          <p className="text-2xl font-bold text-slate-900">{connections.length}</p>
          <Link href="/connections" className="mt-3 inline-block text-sm text-purple-600 hover:text-purple-700 font-medium">
            Управлять →
          </Link>
        </div>
      </div>

      {/* ── Warehouse + Finance widgets ────────────────────────────────── */}
      {hasConnections && (
        <div className="grid lg:grid-cols-2 gap-5">

          {/* Warehouse widget */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-base">🏭</div>
                <h2 className="font-semibold text-slate-800">Склад</h2>
              </div>
              <Link href="/warehouse" className="text-sm text-purple-600 hover:text-purple-700 font-medium">Открыть →</Link>
            </div>

            {loading ? (
              <div className="h-20 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !stocksAccessible ? (
              <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-4 text-center">
                <p className="text-sm text-slate-500 mb-2">Управление складом доступно на тарифе <strong>Старт</strong></p>
                <Link href="/pricing" className="text-xs text-purple-600 font-medium hover:text-purple-700">Перейти на тариф →</Link>
              </div>
            ) : stocks && stocks.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-400">Нет данных — нажмите «Синхронизировать» в разделе Склад</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">{fmt(totalItems)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">всего ед.</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{fmt(totalFbo)}</p>
                    <p className="text-xs text-blue-500 mt-0.5">FBO</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{fmt(totalFbs)}</p>
                    <p className="text-xs text-green-500 mt-0.5">FBS</p>
                  </div>
                </div>

                {lowStockCount > 0 && (
                  <Link href="/warehouse" className="flex items-center gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors">
                    <span className="text-lg">⚠️</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        {lowStockCount} {lowStockCount === 1 ? 'артикул' : lowStockCount < 5 ? 'артикула' : 'артикулов'} с низким остатком
                      </p>
                      <p className="text-xs text-amber-600">Остаток ≤ 10 единиц — пора пополнять</p>
                    </div>
                  </Link>
                )}

                {stocks && stocks.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Array.from(new Set(stocks.map(s => s.platform))).map(p => {
                      const qty = stocks.filter(s => s.platform === p).reduce((a, s) => a + s.quantity, 0);
                      return (
                        <span key={p} className={`text-xs px-2.5 py-1 rounded-full font-medium ${PLATFORM_COLORS[p] || 'bg-slate-100 text-slate-600'}`}>
                          {PLATFORM_LABELS[p] || p}: {fmt(qty)} ед.
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Finance widget */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-base">💰</div>
                <div>
                  <h2 className="font-semibold text-slate-800">Финансы</h2>
                  <p className="text-xs text-slate-400">последние 30 дней</p>
                </div>
              </div>
              <Link href="/finance" className="text-sm text-purple-600 hover:text-purple-700 font-medium">Открыть →</Link>
            </div>

            {loading ? (
              <div className="h-20 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !financeAccessible ? (
              <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-4 text-center">
                <p className="text-sm text-slate-500 mb-2">P&L аналитика доступна на тарифе <strong>Бизнес</strong></p>
                <Link href="/pricing" className="text-xs text-purple-600 font-medium hover:text-purple-700">Перейти на тариф →</Link>
              </div>
            ) : financeSummary && financeSummary.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-400">Нет данных — синхронизируйте финансы в разделе Финансы</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Выручка</p>
                    <p className="text-lg font-bold text-slate-900">{fmt(totalRevenue)} ₽</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3">
                    <p className="text-xs text-blue-500 mb-1">Выплата</p>
                    <p className="text-lg font-bold text-blue-700">{fmt(totalNetPayout)} ₽</p>
                  </div>
                  <div className={`rounded-xl p-3 ${totalGrossProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <p className={`text-xs mb-1 ${totalGrossProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Маржа</p>
                    <p className={`text-lg font-bold ${totalGrossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {avgMargin > 0 ? `${avgMargin}%` : '—'}
                    </p>
                  </div>
                </div>

                {financeSummary && financeSummary.length > 0 && (
                  <div className="space-y-1.5">
                    {financeSummary.slice(0, 3).map(r => (
                      <div key={r.platform} className="flex items-center justify-between text-sm">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[r.platform] || 'bg-slate-100 text-slate-600'}`}>
                          {PLATFORM_LABELS[r.platform] || r.platform}
                        </span>
                        <div className="text-right">
                          <span className="text-slate-700 font-medium">{fmt(r.revenue)} ₽</span>
                          {r.margin_pct != null && r.margin_pct > 0 && (
                            <span className="text-xs text-slate-400 ml-1.5">маржа {r.margin_pct}%</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Recent runs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Последние запуски</h2>
          <Link href="/runs" className="text-sm text-purple-600 hover:text-purple-700 font-medium">Все запуски</Link>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : lastFiveRuns.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-500 text-sm">Запусков пока нет</p>
            <Link href="/scenarios" className="mt-3 inline-block px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors">
              Запустить сценарий
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Сценарий</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Статус</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Стоимость</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lastFiveRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-700 font-medium">
                      {run.scenario_title || run.scenario_slug || '—'}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-5 py-3 text-slate-600">
                      {run.cost != null ? `${run.cost.toLocaleString('ru-RU')} ₽` : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatDate(run.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/runs/${run.id}`} className="text-purple-600 hover:text-purple-700 font-medium">Открыть</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick scenarios */}
      {scenarios.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Быстрый запуск</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scenarios.slice(0, 6).map((s) => (
              <Link key={s.id} href={`/scenarios/${s.slug}`} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50/30 transition-colors group">
                <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 group-hover:text-purple-700 truncate">{s.title}</p>
                  <p className="text-xs text-slate-500">{s.price} ₽</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

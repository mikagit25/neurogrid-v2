'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getRuns, getScenarios, getConnections, getProducts, apiRequest, getAlertEvents, getReviewStats, getRestockForecasts, getRunQuota, getOnboarding, markOnboardingStep, dismissOnboarding, getLatestReport, getFinanceToday, getGoalProgress, getDashboardRecommendations, type FinanceToday, type GoalProgress, type DashboardRecommendation } from '@/lib/api';
import { getUser } from '@/lib/auth';
import type { Run, Scenario, Connection, ProductSummary, ReviewStats, RestockForecast, WeeklyReport } from '@/lib/api';

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
  const [alertUnread, setAlertUnread] = useState(0);
  const [criticalSupplyCount, setCriticalSupplyCount] = useState(0);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [quota, setQuota] = useState<{ used: number; max: number; unlimited: boolean } | null>(null);
  const [onboarding, setOnboarding] = useState<{ steps_done: string[]; dismissed: boolean } | null>(null);
  const [latestReport, setLatestReport] = useState<WeeklyReport | null>(null);
  const [financeToday, setFinanceToday] = useState<FinanceToday | null>(null);
  const [goalProgress, setGoalProgress] = useState<GoalProgress | null>(null);
  const [recommendations, setRecommendations] = useState<DashboardRecommendation[]>([]);
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

        // Run quota + onboarding + latest report (always load regardless of connections)
        try { const q = await getRunQuota(); setQuota(q); } catch { /* ignore */ }
        try { const ob = await getOnboarding(); setOnboarding(ob); } catch { /* ignore */ }
        try { const r = await getLatestReport(); setLatestReport(r); } catch { /* ignore */ }

        if (connsData.length > 0) {
          // Operational status
          try {
            const { unread_count } = await getAlertEvents(50);
            setAlertUnread(unread_count);
          } catch { /* ignore */ }

          try {
            const forecasts: RestockForecast[] = await getRestockForecasts();
            setCriticalSupplyCount(forecasts.filter(f => f.status === 'critical' || f.status === 'out_of_stock').length);
          } catch { /* ignore */ }

          try {
            const rs = await getReviewStats();
            setReviewStats(rs);
          } catch { /* ignore */ }

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

          // Today's pulse (requires business plan)
          try {
            const td = await getFinanceToday();
            setFinanceToday(td);
          } catch { /* ignore if no access */ }

          // Goal pace for warning banner
          try {
            const gp = await getGoalProgress();
            setGoalProgress(gp);
          } catch { /* ignore if no goals or no access */ }

          // Smart recommendations
          try {
            const recs = await getDashboardRecommendations();
            setRecommendations(recs);
          } catch { /* ignore */ }
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

      {/* ── Onboarding checklist ─────────────────────────────────────── */}
      {!loading && onboarding && !onboarding.dismissed && (() => {
        const STEPS = [
          { id: 'connect', title: 'Подключить магазин', desc: 'API-ключ WB, Ozon, YM или Мегамаркет', href: '/connections', done: hasConnections },
          { id: 'products', title: 'Посмотреть каталог', desc: 'Listing Score и качество карточек', href: '/products', done: onboarding.steps_done.includes('products') || (!!productSummary && productSummary.total > 0) },
          { id: 'scenario', title: 'Запустить AI-сценарий', desc: 'Генерация, SEO, ответы на отзывы', href: '/scenarios', done: onboarding.steps_done.includes('scenario') || runs.length > 0 },
          { id: 'pricing', title: 'Настроить цены', desc: 'Правила ценообразования', href: '/price-rules', done: onboarding.steps_done.includes('pricing') },
        ];
        const doneCount = STEPS.filter(s => s.done).length;
        if (doneCount === STEPS.length) return null;
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-800">Начало работы</h2>
                <p className="text-sm text-slate-500 mt-0.5">{doneCount} из {STEPS.length} шагов выполнено</p>
              </div>
              <button
                onClick={async () => { await dismissOnboarding(); setOnboarding(o => o ? { ...o, dismissed: true } : o); }}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Скрыть
              </button>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${Math.round((doneCount / STEPS.length) * 100)}%` }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STEPS.map(s => (
                <Link key={s.id} href={s.href}
                  onClick={() => { if (!s.done) { markOnboardingStep(s.id).catch(() => {}); setOnboarding(o => o ? { ...o, steps_done: [...o.steps_done, s.id] } : o); } }}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${s.done ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 hover:border-purple-300 hover:bg-purple-50'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${s.done ? 'bg-green-500' : 'bg-slate-200'}`}>
                    {s.done
                      ? <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      : <div className="w-2 h-2 rounded-full bg-slate-400" />
                    }
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${s.done ? 'text-green-700 line-through' : 'text-slate-800'}`}>{s.title}</p>
                    <p className="text-xs text-slate-500">{s.desc}</p>
                  </div>
                  {!s.done && <svg className="w-4 h-4 text-slate-400 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

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

      {/* ── Pulse row ─────────────────────────────────────────────────── */}
      {hasConnections && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Выручка 30 дн.',
              value: totalRevenue > 0 ? `${fmt(totalRevenue)} ₽` : '—',
              sub: totalNetPayout > 0 ? `выплата ${fmt(totalNetPayout)} ₽` : 'нет данных',
              icon: '💰',
              href: '/finance',
              color: 'text-green-700',
            },
            {
              label: 'Мало на складе',
              value: String(lowStockCount),
              sub: lowStockCount > 0 ? 'товаров ≤ 10 шт' : 'всё в норме',
              icon: lowStockCount > 0 ? '⚠️' : '✅',
              href: '/warehouse',
              color: lowStockCount > 0 ? 'text-amber-600' : 'text-green-600',
            },
            {
              label: 'Без ответа',
              value: reviewStats ? String(reviewStats.unanswered ?? 0) : '—',
              sub: 'отзывов без ответа',
              icon: '💬',
              href: '/reviews',
              color: (reviewStats?.unanswered ?? 0) > 0 ? 'text-amber-600' : 'text-green-600',
            },
            {
              label: 'Критич. запасы',
              value: String(criticalSupplyCount),
              sub: criticalSupplyCount > 0 ? 'нужно пополнить' : 'запасы в норме',
              icon: criticalSupplyCount > 0 ? '🔴' : '🟢',
              href: '/supply',
              color: criticalSupplyCount > 0 ? 'text-red-600' : 'text-green-600',
            },
          ].map(tile => (
            <Link
              key={tile.label}
              href={tile.href}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-purple-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500">{tile.label}</p>
                <span className="text-base">{tile.icon}</span>
              </div>
              <p className={`text-xl font-bold ${tile.color}`}>{tile.value}</p>
              <p className="text-xs text-slate-400 mt-0.5 group-hover:text-slate-600 transition-colors">{tile.sub} →</p>
            </Link>
          ))}
        </div>
      )}

      {/* ── Today's Pulse ─────────────────────────────────────────────── */}
      {financeToday && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800">Сегодня</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <Link href="/finance" className="text-xs text-purple-600 hover:text-purple-700 font-medium">Финансы →</Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: 'Выручка',
                value: `${fmt(financeToday.today.revenue)} ₽`,
                prev: financeToday.yesterday.revenue,
                delta: financeToday.delta_pct,
              },
              {
                label: 'Выплата',
                value: `${fmt(financeToday.today.payout)} ₽`,
                prev: financeToday.yesterday.payout,
                delta: financeToday.yesterday.payout > 0
                  ? Math.round(((financeToday.today.payout - financeToday.yesterday.payout) / financeToday.yesterday.payout) * 1000) / 10
                  : null,
              },
              {
                label: 'Продаж (шт)',
                value: String(financeToday.today.quantity),
                prev: financeToday.yesterday.quantity,
                delta: financeToday.yesterday.quantity > 0
                  ? Math.round(((financeToday.today.quantity - financeToday.yesterday.quantity) / financeToday.yesterday.quantity) * 1000) / 10
                  : null,
              },
            ].map(({ label, value, prev, delta }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className="text-lg font-bold text-slate-900">{value}</p>
                {delta != null ? (
                  <p className={`text-xs font-medium mt-0.5 ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% к вчера
                  </p>
                ) : prev === 0 ? (
                  <p className="text-xs text-slate-400 mt-0.5">нет данных за вчера</p>
                ) : null}
              </div>
            ))}
          </div>
          {financeToday.week.revenue > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex gap-6 text-sm text-slate-500">
              <span>Выручка за 7 дн.: <strong className="text-slate-700">{fmt(financeToday.week.revenue)} ₽</strong></span>
              <span>Выплата за 7 дн.: <strong className="text-slate-700">{fmt(financeToday.week.payout)} ₽</strong></span>
            </div>
          )}
        </div>
      )}

      {/* ── Goal pace warning ─────────────────────────────────────────── */}
      {goalProgress && goalProgress.goal && goalProgress.days_elapsed > 0 && (() => {
        const elapsedPct = goalProgress.days_elapsed / goalProgress.days_in_month;
        const revGoal = goalProgress.goal.revenue_goal;
        const revActual = goalProgress.actual.revenue;
        const revPct = revGoal && revGoal > 0 ? revActual / revGoal : null;
        if (revPct == null || elapsedPct < 0.6 || revPct >= 0.7) return null;
        const projectedRev = Math.round((revActual / goalProgress.days_elapsed) * goalProgress.days_in_month);
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-amber-500 text-xl flex-shrink-0">⚠️</span>
            <div className="min-w-0">
              <p className="font-semibold text-amber-800">Цель месяца под угрозой</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Выручка {Math.round(revPct * 100)}% от цели при {Math.round(elapsedPct * 100)}% прошедшего месяца.
                По текущему темпу: {projectedRev.toLocaleString('ru-RU')} ₽
              </p>
              <Link href="/pnl?tab=goals" className="text-xs font-medium text-amber-700 hover:text-amber-900 mt-1 inline-block">
                Открыть цели →
              </Link>
            </div>
          </div>
        );
      })()}

      {/* ── Smart Recommendations ─────────────────────────────────────── */}
      {recommendations.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Приоритеты сегодня</h2>
            <span className="text-xs text-slate-400">{recommendations.length} задачи</span>
          </div>
          <div className="space-y-2">
            {recommendations.map((rec, i) => {
              const priorityStyles = {
                high:   { dot: 'bg-red-500',   badge: 'bg-red-50 text-red-700 border-red-200',   row: 'hover:bg-red-50/30' },
                medium: { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200', row: 'hover:bg-amber-50/30' },
                low:    { dot: 'bg-slate-300', badge: 'bg-slate-50 text-slate-500 border-slate-200', row: 'hover:bg-slate-50' },
              }[rec.priority];
              return (
                <Link
                  key={i}
                  href={rec.href}
                  className={`flex items-start gap-3 p-3 rounded-xl border border-transparent transition-colors ${priorityStyles.row}`}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${priorityStyles.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-800">{rec.title}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${priorityStyles.badge}`}>
                        {rec.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{rec.description}</p>
                  </div>
                  {rec.value && (
                    <span className="text-sm font-bold text-slate-600 flex-shrink-0">{rec.value}</span>
                  )}
                  <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
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

      {/* ── Latest AI Report ─────────────────────────────────────────── */}
      {latestReport && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">📊</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">{latestReport.headline ?? 'Еженедельный отчёт'}</p>
                  <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full flex-shrink-0">{latestReport.period_start} — {latestReport.period_end}</span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{latestReport.summary}</p>
                {latestReport.insights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {latestReport.insights.slice(0, 3).map((ins, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${ins.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : ins.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : ins.type === 'action' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                        {ins.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Link href="/reports" className="text-xs text-purple-600 hover:text-purple-800 font-medium flex-shrink-0 mt-1">
              Все отчёты →
            </Link>
          </div>
        </div>
      )}

      {/* ── Run quota ───────────────────────────────────────────────────── */}
      {quota && !quota.unlimited && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-slate-700">AI-запуски в этом месяце</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {quota.used} из {quota.max} использовано
              </p>
            </div>
            {quota.used >= quota.max && (
              <Link href="/pricing" className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1 rounded-full font-medium hover:bg-amber-200 transition-colors">
                Обновить тариф
              </Link>
            )}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${quota.used / quota.max >= 0.9 ? 'bg-red-500' : quota.used / quota.max >= 0.7 ? 'bg-amber-500' : 'bg-purple-600'}`}
              style={{ width: `${Math.min(100, Math.round((quota.used / quota.max) * 100))}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1.5">
            <span>{Math.round((quota.used / quota.max) * 100)}% использовано</span>
            <span>{quota.max - quota.used} осталось</span>
          </div>
        </div>
      )}

      {/* ── Operational status ───────────────────────────────────────── */}
      {hasConnections && (alertUnread > 0 || criticalSupplyCount > 0 || (reviewStats && reviewStats.unanswered > 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Alerts */}
          <Link href="/alerts"
            className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${alertUnread > 0 ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${alertUnread > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
              🔔
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-medium mb-0.5 ${alertUnread > 0 ? 'text-red-600' : 'text-slate-500'}`}>Уведомления</p>
              <p className={`text-lg font-bold leading-none ${alertUnread > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                {alertUnread > 0 ? `${alertUnread} новых` : '0 новых'}
              </p>
            </div>
            <svg className={`w-4 h-4 ml-auto flex-shrink-0 ${alertUnread > 0 ? 'text-red-400' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          {/* Supply */}
          <Link href="/supply"
            className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${criticalSupplyCount > 0 ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${criticalSupplyCount > 0 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
              📦
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-medium mb-0.5 ${criticalSupplyCount > 0 ? 'text-orange-600' : 'text-slate-500'}`}>Поставки</p>
              <p className={`text-lg font-bold leading-none ${criticalSupplyCount > 0 ? 'text-orange-700' : 'text-slate-400'}`}>
                {criticalSupplyCount > 0 ? `${criticalSupplyCount} критичных` : 'Всё в порядке'}
              </p>
            </div>
            <svg className={`w-4 h-4 ml-auto flex-shrink-0 ${criticalSupplyCount > 0 ? 'text-orange-400' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          {/* Reviews */}
          <Link href="/reviews"
            className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${reviewStats && reviewStats.unanswered > 0 ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${reviewStats && reviewStats.unanswered > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
              ⭐
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-medium mb-0.5 ${reviewStats && reviewStats.unanswered > 0 ? 'text-amber-600' : 'text-slate-500'}`}>Отзывы</p>
              <p className={`text-lg font-bold leading-none ${reviewStats && reviewStats.unanswered > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                {reviewStats && reviewStats.unanswered > 0 ? `${reviewStats.unanswered} без ответа` : 'Все отвечены'}
              </p>
            </div>
            <svg className={`w-4 h-4 ml-auto flex-shrink-0 ${reviewStats && reviewStats.unanswered > 0 ? 'text-amber-400' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

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

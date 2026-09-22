'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLifecycle, getLifecycleAi, type LifecycleItem, type LifecycleStage, type LifecycleAiResult, type LifecycleAiActionItem } from '@/lib/api';

const STAGE_META: Record<LifecycleStage, {
  label: string; icon: string; color: string; bg: string; border: string;
  desc: string; tip: string;
}> = {
  launch: {
    label: 'Запуск', icon: '🚀',
    color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200',
    desc: 'Новые товары — продажи только начались',
    tip: 'Усиль рекламу и SEO для быстрого старта',
  },
  growth: {
    label: 'Рост', icon: '📈',
    color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200',
    desc: 'Продажи выросли более чем на 20%',
    tip: 'Обеспечь запасы — спрос растёт',
  },
  stable: {
    label: 'Стабильность', icon: '📊',
    color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200',
    desc: 'Продажи стабильны (±20%)',
    tip: 'Оптимизируй маржу и снижай расходы',
  },
  declining: {
    label: 'Спад', icon: '📉',
    color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200',
    desc: 'Продажи снизились более чем на 20%',
    tip: 'Проверь конкурентов и цену',
  },
  dead: {
    label: 'Уходит', icon: '⚫',
    color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200',
    desc: 'Продажи очень низкие или отсутствуют',
    tip: 'Рассмотри распродажу или вывод из ассортимента',
  },
};

const PLATFORM_LABELS: Record<string, string> = {
  wb: 'WB', ozon: 'Ozon', ym: 'ЯМ', mm: 'ММ',
};

const STAGE_ORDER: LifecycleStage[] = ['launch', 'growth', 'stable', 'declining', 'dead'];

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}к`;
  return String(Math.round(n));
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-slate-300">новый</span>;
  const color = pct >= 20 ? 'text-green-600' : pct >= 0 ? 'text-slate-500' : pct >= -20 ? 'text-amber-600' : 'text-red-600';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {pct >= 0 ? '+' : ''}{pct}%
    </span>
  );
}

function SkuCard({ item }: { item: LifecycleItem }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 hover:border-purple-300 hover:shadow-sm transition-all">
      <p className="text-sm font-medium text-slate-800 line-clamp-1 mb-1">{item.title || item.sku}</p>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
          item.platform === 'wb' ? 'bg-purple-100 text-purple-700' :
          item.platform === 'ozon' ? 'bg-blue-100 text-blue-700' :
          'bg-slate-100 text-slate-600'
        }`}>{PLATFORM_LABELS[item.platform] ?? item.platform}</span>
        <span className="text-xs text-slate-400 truncate">{item.sku}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{item.qty2 > 0 ? `${item.qty2} шт` : '0 шт'}</span>
        <span className="font-medium text-slate-700">{fmt(item.rev2)} ₽</span>
        <ChangeBadge pct={item.change_pct} />
      </div>
    </div>
  );
}

function LifecycleAiPanel({ result, onClose }: { result: LifecycleAiResult; onClose: () => void }) {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-600 rounded-xl flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">AI советник по портфелю</p>
            <p className="text-xs text-slate-500">{result.total_skus} SKU проанализировано</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed">{result.summary}</p>

      {result.declining_actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Товары в спаде — действия</p>
          {result.declining_actions.map((a: LifecycleAiActionItem, i: number) => (
            <div key={i} className="bg-white rounded-xl border border-amber-100 p-3 flex items-start gap-3">
              {a.priority === 'high' && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0 mt-0.5">Срочно</span>}
              <div>
                <p className="text-xs text-slate-500 font-mono">{a.sku} · {a.title}</p>
                <p className="text-sm text-slate-700 mt-0.5">{a.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.dead_actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">Уходящие товары — стратегия</p>
          {result.dead_actions.map((a: LifecycleAiActionItem, i: number) => (
            <div key={i} className="bg-white rounded-xl border border-red-100 p-3">
              <p className="text-xs text-slate-500 font-mono">{a.sku} · {a.title}</p>
              <p className="text-sm text-slate-700 mt-0.5">{a.action}</p>
            </div>
          ))}
        </div>
      )}

      {result.growth_tips.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-green-700 mb-2">Советы по растущим товарам</p>
          <ul className="space-y-1">
            {result.growth_tips.map((t, i) => (
              <li key={i} className="text-sm text-green-800 flex gap-2"><span className="flex-shrink-0">•</span>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
        <p className="text-xs font-semibold text-purple-700 mb-1">Общая стратегия</p>
        <p className="text-sm text-purple-800">{result.overall_strategy}</p>
      </div>
    </div>
  );
}

export default function LifecyclePage() {
  const [items, setItems] = useState<LifecycleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiResult, setAiResult] = useState<LifecycleAiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<LifecycleStage>>(() => {
    const s = new Set<LifecycleStage>();
    s.add('launch'); s.add('growth'); s.add('stable'); s.add('declining');
    return s;
  });

  useEffect(() => {
    getLifecycle()
      .then(setItems)
      .catch(e => setError(e.message ?? 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAi() {
    setAiLoading(true);
    setAiResult(null);
    try { setAiResult(await getLifecycleAi()); } catch { /* ignore */ } finally { setAiLoading(false); }
  }

  const grouped = STAGE_ORDER.reduce<Record<LifecycleStage, LifecycleItem[]>>(
    (acc, s) => { acc[s] = items.filter(i => i.stage === s); return acc; },
    { launch: [], growth: [], stable: [], declining: [], dead: [] }
  );

  function toggleExpand(stage: LifecycleStage) {
    setExpanded(prev => {
      const n = new Set<LifecycleStage>();
      prev.forEach(v => n.add(v));
      if (n.has(stage)) n.delete(stage); else n.add(stage);
      return n;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Жизненный цикл товаров</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Классификация SKU на основе динамики продаж: 90 дней → 45 дней vs последние 45 дней
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAi}
            disabled={aiLoading || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {aiLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            AI советник
          </button>
          <Link href="/scoreboard" className="px-4 py-2 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
            Рейтинг товаров →
          </Link>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {aiResult && <LifecycleAiPanel result={aiResult} onClose={() => setAiResult(null)} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-slate-200">
          <div className="text-5xl mb-4">📦</div>
          <p className="font-semibold text-slate-700 mb-1">Нет данных о продажах</p>
          <p className="text-sm text-slate-400 mb-4">Синхронизируйте финансовые данные за последние 90 дней</p>
          <Link href="/finance" className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors">
            Открыть финансы
          </Link>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-5 gap-3">
            {STAGE_ORDER.map(s => {
              const meta = STAGE_META[s];
              const count = grouped[s].length;
              return (
                <button
                  key={s}
                  onClick={() => toggleExpand(s)}
                  className={`rounded-xl border p-3 text-left transition-all ${meta.bg} ${meta.border} ${expanded.has(s) ? 'shadow-sm ring-1 ring-inset ring-current/10' : 'opacity-80'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">{meta.icon}</span>
                    <span className={`text-lg font-bold ${meta.color}`}>{count}</span>
                  </div>
                  <p className={`text-xs font-semibold ${meta.color}`}>{meta.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{meta.tip}</p>
                </button>
              );
            })}
          </div>

          {/* Stage columns */}
          <div className="space-y-4">
            {STAGE_ORDER.map(s => {
              const meta = STAGE_META[s];
              const stageItems = grouped[s];
              if (stageItems.length === 0) return null;
              const isOpen = expanded.has(s);
              return (
                <div key={s} className={`rounded-xl border ${meta.border} overflow-hidden`}>
                  <button
                    className={`w-full flex items-center justify-between px-5 py-3 ${meta.bg} transition-colors hover:opacity-80`}
                    onClick={() => toggleExpand(s)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{meta.icon}</span>
                      <div className="text-left">
                        <p className={`font-semibold ${meta.color}`}>{meta.label} — {stageItems.length} {stageItems.length === 1 ? 'товар' : stageItems.length < 5 ? 'товара' : 'товаров'}</p>
                        <p className="text-xs text-slate-500">{meta.desc} · {meta.tip}</p>
                      </div>
                    </div>
                    <svg className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="p-4 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {stageItems.map(item => (
                        <SkuCard key={`${item.platform}:${item.sku}`} item={item} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

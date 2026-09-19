'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getProducts, getConnections } from '@/lib/api';
import type { ScoredProduct, ProductSummary, Connection } from '@/lib/api';

const SCORE_COLORS: Record<string, { bar: string; badge: string; label: string }> = {
  excellent: { bar: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200',  label: 'Отлично' },
  good:      { bar: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-200',     label: 'Хорошо' },
  average:   { bar: 'bg-amber-500',  badge: 'bg-amber-50 text-amber-700 border-amber-200',  label: 'Средне' },
  poor:      { bar: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',        label: 'Плохо' },
};

function ScoreBar({ score, label }: { score: number; label: string }) {
  const c = SCORE_COLORS[label] ?? SCORE_COLORS.poor;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c.bar} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-700 w-8 text-right">{score}</span>
    </div>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${color}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
    </div>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ScoredProduct[]>([]);
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConn, setSelectedConn] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'poor' | 'average' | 'good' | 'excellent'>('all');

  const load = useCallback(async (connId?: string) => {
    setLoading(true);
    setError('');
    try {
      const [{ products: p, summary: s }, conns] = await Promise.all([
        getProducts(connId || undefined),
        getConnections(),
      ]);
      setProducts(p);
      setSummary(s);
      setConnections(conns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleConnChange(id: string) {
    setSelectedConn(id);
    load(id || undefined);
  }

  function handleFix(product: ScoredProduct) {
    const params = new URLSearchParams({
      sku: product.sku,
      title: product.title,
      description: product.description ?? '',
      platform: product.platform,
      connectionId: product.connectionId,
    });
    router.push(`/scenarios/card-generator?${params}`);
  }

  function handleAutopilot(product: ScoredProduct) {
    sessionStorage.setItem('autopilot_prefill', JSON.stringify({
      name: product.title || `Арт. ${product.sku}`,
      description: product.description ?? '',
      photoUrls: product.photoUrls ?? [],
      platform: product.platform,
      connectionId: product.connectionId,
    }));
    router.push('/autopilot');
  }

  const filtered = filter === 'all' ? products : products.filter((p) => p.scoreLabel === filter);

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (connections.length === 0) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Каталог товаров</h1>
        <p className="text-slate-500 mt-1">Listing Score — качество карточек вашего магазина</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="text-5xl mb-4">🔌</div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Подключите магазин</h2>
        <p className="text-slate-500 text-sm mb-6">Чтобы видеть товары и их оценки, добавьте API-ключ WildBerries или Ozon</p>
        <a href="/connections" className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 transition-colors text-sm">
          Подключить магазин
        </a>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Каталог товаров</h1>
          <p className="text-slate-500 mt-1">Listing Score — оценка качества каждой карточки</p>
        </div>
        <select
          value={selectedConn}
          onChange={(e) => handleConnChange(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
        >
          <option value="">Все магазины</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>{c.display_name} ({c.platform.toUpperCase()})</option>
          ))}
        </select>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

      {/* Summary */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-4 text-center text-white">
            <p className="text-3xl font-bold">{summary.avgScore}</p>
            <p className="text-xs text-purple-200 mt-0.5">Средний балл</p>
          </div>
          <SummaryCard label="Плохо (0–34)"    count={summary.poor}      color="bg-red-50 border-red-200 text-red-700" />
          <SummaryCard label="Средне (35–59)"  count={summary.average}   color="bg-amber-50 border-amber-200 text-amber-700" />
          <SummaryCard label="Хорошо (60–79)"  count={summary.good}      color="bg-blue-50 border-blue-200 text-blue-700" />
          <SummaryCard label="Отлично (80+)"   count={summary.excellent} color="bg-green-50 border-green-200 text-green-700" />
        </div>
      )}

      {summary && summary.poor + summary.average > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <span className="text-xl shrink-0">⚠️</span>
          <div>
            <span className="font-semibold">{summary.poor + summary.average} товаров</span> требуют улучшения карточки.
            Нажмите <span className="font-semibold">«Улучшить с AI»</span> — AI сгенерирует SEO-описание и обновит карточку автоматически.
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {summary && summary.total > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(['all', 'poor', 'average', 'good', 'excellent'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-purple-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {f === 'all' ? `Все (${summary.total})` :
               f === 'poor' ? `Плохо (${summary.poor})` :
               f === 'average' ? `Средне (${summary.average})` :
               f === 'good' ? `Хорошо (${summary.good})` :
               `Отлично (${summary.excellent})`}
            </button>
          ))}
        </div>
      )}

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          {products.length === 0 ? 'Нет товаров в подключённом магазине' : 'Нет товаров с таким фильтром'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50">
          {filtered.map((p) => {
            const c = SCORE_COLORS[p.scoreLabel];
            return (
              <div key={`${p.platform}-${p.sku}`} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Photo thumbnail */}
                {p.photoUrls?.[0] ? (
                  <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={p.photoUrls[0]} alt={p.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  /* Score badge when no photo */
                  <div className={`shrink-0 w-14 h-14 rounded-xl border flex flex-col items-center justify-center ${c.badge}`}>
                    <span className="text-lg font-bold leading-none">{p.score}</span>
                    <span className="text-xs font-medium mt-0.5">{c.label}</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="font-medium text-slate-900 truncate max-w-xs sm:max-w-md">{p.title || `Арт. ${p.sku}`}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      p.platform === 'wb' ? 'bg-pink-50 text-pink-700 border-pink-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {p.platform === 'wb' ? 'WB' : 'Ozon'} · {p.sku}
                    </span>
                    {p.photoUrls?.[0] && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${c.badge}`}>
                        {p.score} · {c.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <ScoreBar score={p.score} label={p.scoreLabel} />
                  </div>
                  {p.issues.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.issues.map((issue) => (
                        <span key={issue} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Price + Stock + CTA */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-slate-800">{p.price.toLocaleString('ru-RU')} ₽</p>
                    <p className="text-xs text-slate-400">{p.stock} шт.</p>
                  </div>
                  {p.scoreLabel !== 'excellent' && (
                    <button
                      onClick={() => handleFix(p)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Улучшить с AI
                    </button>
                  )}
                  <button
                    onClick={() => handleAutopilot(p)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
                  >
                    🤖 Автопилот
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

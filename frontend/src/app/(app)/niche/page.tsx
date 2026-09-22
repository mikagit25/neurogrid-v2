'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { searchNiche, type NicheSearchResult, type NicheCompetitor } from '@/lib/api';

const COMPETITION_META = {
  low:    { label: 'Низкая',   color: 'text-green-700 bg-green-50 border-green-200',    bar: 'bg-green-500',  width: '33%' },
  medium: { label: 'Средняя',  color: 'text-amber-700 bg-amber-50 border-amber-200',    bar: 'bg-amber-500',  width: '66%' },
  high:   { label: 'Высокая',  color: 'text-red-700 bg-red-50 border-red-200',          bar: 'bg-red-500',    width: '100%' },
};

const MARGIN_META = {
  low:    { label: 'Низкий',  color: 'text-red-700'   },
  medium: { label: 'Средний', color: 'text-amber-700' },
  high:   { label: 'Высокий', color: 'text-green-700' },
};

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  return (
    <span className="flex items-center gap-0.5 text-xs text-amber-500">
      {'★'.repeat(full)}{'☆'.repeat(5 - full)}
      <span className="text-slate-500 ml-0.5">{rating.toFixed(1)}</span>
    </span>
  );
}

function PriceDistBar({ data }: { data: Array<{ label: string; count: number }> }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-28 flex-shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-4 bg-slate-100 rounded-md overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-md transition-all"
              style={{ width: `${Math.round((d.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-slate-700 w-8 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function CompetitorRow({ c, rank }: { c: NicheCompetitor; rank: number }) {
  const price = c.salePrice > 0 ? c.salePrice : c.price;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${rank <= 3 ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 truncate">{c.name}</p>
        {c.brand && <p className="text-xs text-slate-400">{c.brand}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-slate-900">{price.toLocaleString('ru-RU')} ₽</p>
        <Stars rating={c.rating} />
      </div>
      <div className="text-right flex-shrink-0 min-w-[50px]">
        <p className="text-xs text-slate-500">{c.reviews.toLocaleString('ru-RU')}</p>
        <p className="text-xs text-slate-400">отзывов</p>
      </div>
    </div>
  );
}

export default function NichePage() {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<'wb' | 'ozon'>('wb');
  const [result, setResult] = useState<NicheSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || query.trim().length < 2) return;
    setLoading(true); setError(''); setResult(null);
    try {
      setResult(await searchNiche(query.trim(), platform));
    } catch (err: any) {
      setError(err.message || 'Ошибка поиска');
    } finally { setLoading(false); }
  }

  const comp = result?.analysis?.competitionLevel
    ? COMPETITION_META[result.analysis.competitionLevel] ?? COMPETITION_META.medium
    : null;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Анализ ниши</h1>
        <p className="text-slate-500 text-sm mt-0.5">Введите ключевое слово или категорию — AI проанализирует рынок и конкурентов</p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Например: зубная щётка, летнее платье, умные часы..."
          className="flex-1 min-w-60 px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as 'wb' | 'ozon')}
          className="px-3 py-3 border border-slate-300 rounded-xl text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="wb">WildBerries</option>
          <option value="ozon">Ozon</option>
        </select>
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
        >
          {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
          {loading ? 'Анализируем...' : 'Анализировать'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

      {loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-600 font-medium">Собираем данные о товарах...</p>
          <p className="text-xs text-slate-400 mt-1">Обычно 5–15 секунд</p>
        </div>
      )}

      {result && !loading && (
        <>
          {result.competitorsCount === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <p className="text-slate-600">По запросу «{result.keyword}» товаров не найдено. Попробуйте другой запрос.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-purple-600 text-white rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{result.competitorsCount}</p>
                  <p className="text-xs text-purple-200 mt-0.5">Товаров найдено</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-slate-900">{result.priceRange.avg.toLocaleString('ru-RU')} ₽</p>
                  <p className="text-xs text-slate-400 mt-0.5">Средняя цена</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-sm font-semibold text-slate-700">{result.priceRange.min.toLocaleString('ru-RU')} — {result.priceRange.max.toLocaleString('ru-RU')} ₽</p>
                  <p className="text-xs text-slate-400 mt-0.5">Диапазон цен</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1 text-amber-500 text-lg">
                    ★ <span className="text-slate-900 font-bold text-xl">{result.avgRating.toFixed(1)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Средний рейтинг</p>
                </div>
              </div>

              {/* AI Analysis */}
              {result.analysis && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🤖</span>
                    <h2 className="font-semibold text-slate-900">AI-анализ ниши</h2>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{result.analysis.summary}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Competition level */}
                    {comp && (
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs font-medium text-slate-500 mb-2">Конкуренция</p>
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${comp.color}`}>
                          {comp.label}
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                          <div className={`h-full rounded-full ${comp.bar}`} style={{ width: comp.width }} />
                        </div>
                        {result.analysis.competitionReason && (
                          <p className="text-xs text-slate-500 mt-2 leading-relaxed">{result.analysis.competitionReason}</p>
                        )}
                      </div>
                    )}

                    {/* Entry price */}
                    {result.analysis.entryPrice != null && result.analysis.entryPrice > 0 && (
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs font-medium text-slate-500 mb-1">Рекомендуемая цена входа</p>
                        <p className="text-xl font-bold text-purple-700">{result.analysis.entryPrice.toLocaleString('ru-RU')} ₽</p>
                        {result.analysis.entryPriceReason && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{result.analysis.entryPriceReason}</p>
                        )}
                      </div>
                    )}

                    {/* Margin potential */}
                    {result.analysis.marginPotential && (
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs font-medium text-slate-500 mb-1">Потенциал маржи</p>
                        <p className={`text-lg font-bold ${MARGIN_META[result.analysis.marginPotential]?.color ?? 'text-slate-700'}`}>
                          {MARGIN_META[result.analysis.marginPotential]?.label ?? result.analysis.marginPotential}
                        </p>
                        {result.analysis.topBrands?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {result.analysis.topBrands.slice(0, 3).map((b, i) => (
                              <span key={i} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{b}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Strategy */}
                  {result.analysis.strategy && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-purple-700 mb-1">💡 Стратегия входа</p>
                      <p className="text-sm text-purple-900 leading-relaxed">{result.analysis.strategy}</p>
                    </div>
                  )}

                  {/* Opportunities + Warnings */}
                  {(result.analysis.opportunities?.length > 0 || result.analysis.warnings?.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {result.analysis.opportunities?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-green-700 mb-1.5">✅ Возможности</p>
                          <ul className="space-y-1">
                            {result.analysis.opportunities.map((o, i) => (
                              <li key={i} className="text-xs text-slate-600 flex gap-1.5"><span className="text-green-500 flex-shrink-0 mt-0.5">•</span>{o}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.analysis.warnings?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-amber-700 mb-1.5">⚠️ Риски</p>
                          <ul className="space-y-1">
                            {result.analysis.warnings.map((w, i) => (
                              <li key={i} className="text-xs text-slate-600 flex gap-1.5"><span className="text-amber-500 flex-shrink-0 mt-0.5">•</span>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Price distribution + Top competitors side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {result.priceDistribution.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Распределение цен</h3>
                    <PriceDistBar data={result.priceDistribution} />
                  </div>
                )}

                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">Топ конкурентов</h3>
                    <span className="text-xs text-slate-400">по отзывам</span>
                  </div>
                  <div>
                    {result.topCompetitors.slice(0, 10).map((c, i) => (
                      <CompetitorRow key={i} c={c} rank={i + 1} />
                    ))}
                  </div>
                </div>
              </div>

              {/* CTA */}
              {result.analysis?.entryPrice != null && result.analysis.entryPrice > 0 && (
                <Link
                  href={`/calculator?price=${result.analysis.entryPrice}`}
                  className="flex items-center justify-center gap-2 p-4 bg-purple-50 border border-purple-200 rounded-2xl text-sm text-purple-700 hover:bg-purple-100 transition-colors font-medium"
                >
                  <span>🧮</span>
                  <span>Рассчитать юнит-экономику для цены {result.analysis.entryPrice.toLocaleString('ru-RU')} ₽ →</span>
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {!result && !loading && !error && (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="font-semibold text-slate-700 mb-1">Исследуйте любую нишу</p>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Введите запрос — получите анализ конкуренции, диапазон цен, топ-бренды и AI-рекомендацию по стратегии входа
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {['зубная щётка', 'сумка женская', 'умный дом', 'кофемашина', 'детские игрушки'].map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); setTimeout(() => inputRef.current?.focus(), 0); }}
                className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-600 rounded-full transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

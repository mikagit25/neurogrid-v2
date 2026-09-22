'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getProductDetail, getSmartPrice, auditProduct, getFinanceRecordsBySku, type ProductDetailData, type SmartPriceResult, type ProductAudit, type AuditQuickWin, type SkuFinanceRecord } from '@/lib/api';

function fmt(n: number) { return Math.round(n).toLocaleString('ru-RU'); }

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold text-slate-700 w-8 text-right">{score}</span>
    </div>
  );
}

function MiniChart({ data, valueKey, dateKey, color = '#7c3aed' }: {
  data: Record<string, any>[];
  valueKey: string;
  dateKey: string;
  color?: string;
}) {
  if (!data.length) return <div className="h-20 flex items-center justify-center text-xs text-slate-400">Нет данных</div>;
  const vals = data.map(d => Number(d[valueKey]));
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals);
  const W = 300; const H = 60; const PAD = 4;
  const w = W - PAD * 2; const h = H - PAD * 2;
  const n = data.length;
  const px = (i: number) => PAD + (i / Math.max(n - 1, 1)) * w;
  const py = (v: number) => PAD + h - ((v - min) / Math.max(max - min, 1)) * h;
  const pts = data.map((d, i) => `${px(i)},${py(Number(d[valueKey]))}`).join(' ');
  const fill = `${pts} ${px(n - 1)},${PAD + h} ${PAD},${PAD + h}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16">
      <polygon points={fill} fill={color} fillOpacity={0.1} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
      {n === 1 && <circle cx={px(0)} cy={py(vals[0])} r={3} fill={color} />}
    </svg>
  );
}

export default function ProductDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const searchParams = useSearchParams();
  const connectionId = searchParams.get('connectionId') ?? undefined;

  const [data, setData] = useState<ProductDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [smartPrice, setSmartPrice] = useState<SmartPriceResult | null>(null);
  const [loadingSmartPrice, setLoadingSmartPrice] = useState(false);
  const [audit, setAudit] = useState<ProductAudit | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [financeRecords, setFinanceRecords] = useState<SkuFinanceRecord[]>([]);
  const [financeDays, setFinanceDays] = useState(90);
  const [loadingFinance, setLoadingFinance] = useState(false);

  useEffect(() => {
    getProductDetail(decodeURIComponent(sku), connectionId)
      .then(setData)
      .catch(e => setError(e.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [sku, connectionId]);

  useEffect(() => {
    setLoadingFinance(true);
    getFinanceRecordsBySku(decodeURIComponent(sku), financeDays)
      .then(setFinanceRecords)
      .catch(() => {})
      .finally(() => setLoadingFinance(false));
  }, [sku, financeDays]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-600">{error}</p>
      <Link href="/products" className="text-purple-600 text-sm mt-2 inline-block">← Назад</Link>
    </div>
  );

  if (!data) return null;

  const { product, priceHistory, competitorPrices, stockTrend, seoPositions, reviews } = data;
  const decodedSku = decodeURIComponent(sku);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + header */}
      <div>
        <Link href="/products" className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Каталог товаров
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{product?.title ?? decodedSku}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-sm text-slate-500">SKU: <code className="bg-slate-100 px-1 rounded">{decodedSku}</code></span>
              {product?.platform && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium uppercase">{String(product.platform)}</span>
              )}
            </div>
          </div>
          {product?.score !== undefined && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-slate-500">Listing Score</span>
              <div className="w-36"><ScoreBar score={Number(product.score)} /></div>
            </div>
          )}
        </div>
      </div>

      {/* KPI row */}
      {product && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Цена', value: product.price ? `${fmt(Number(product.price))} ₽` : '—' },
            { label: 'Остаток', value: product.stock != null ? String(product.stock) : '—' },
            { label: 'Изменений цены', value: String(priceHistory.length) },
            { label: 'Конкурентов', value: String(competitorPrices.length) },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Issues */}
      {product?.issues && Array.isArray(product.issues) && (product.issues as string[]).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">Проблемы карточки</p>
          <ul className="space-y-1">
            {(product.issues as string[]).map((issue, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>{issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Price history */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800 mb-3">История цены</h2>
          {priceHistory.length === 0 ? (
            <p className="text-sm text-slate-400">Изменений не зафиксировано</p>
          ) : (
            <>
              <MiniChart data={[...priceHistory].reverse()} valueKey="new_price" dateKey="applied_at" color="#7c3aed" />
              <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                {priceHistory.slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-slate-600">
                    <span>{new Date(p.applied_at).toLocaleDateString('ru-RU')}</span>
                    <span className="font-medium">{fmt(p.old_price)} → {fmt(p.new_price)} ₽</span>
                    {p.reason && <span className="text-slate-400 truncate max-w-[100px]">{p.reason}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Stock trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800 mb-3">Динамика остатков</h2>
          {stockTrend.length === 0 ? (
            <p className="text-sm text-slate-400">Нет данных об остатках</p>
          ) : (
            <>
              <MiniChart data={stockTrend} valueKey="qty" dateKey="day" color="#059669" />
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>{new Date(stockTrend[0]?.day).toLocaleDateString('ru-RU')}</span>
                <span className="font-medium text-slate-600">Сейчас: {stockTrend[stockTrend.length - 1]?.qty ?? 0} шт.</span>
                <span>{new Date(stockTrend[stockTrend.length - 1]?.day).toLocaleDateString('ru-RU')}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Competitors */}
      {competitorPrices.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800 mb-3">Цены конкурентов</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-2 text-xs text-slate-500 font-medium">Конкурент</th>
                  <th className="text-right pb-2 text-xs text-slate-500 font-medium">Их цена</th>
                  <th className="text-right pb-2 text-xs text-slate-500 font-medium">Моя цена</th>
                  <th className="text-right pb-2 text-xs text-slate-500 font-medium">Разница</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {competitorPrices.map((c, i) => {
                  const diff = c.diff_pct;
                  return (
                    <tr key={i}>
                      <td className="py-2 font-medium text-slate-800">{c.competitor_name || c.competitor_sku}</td>
                      <td className="py-2 text-right text-slate-700">{fmt(c.price)} ₽</td>
                      <td className="py-2 text-right text-slate-500">{c.my_price ? `${fmt(c.my_price)} ₽` : '—'}</td>
                      <td className="py-2 text-right">
                        {diff != null && (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${diff > 0 ? 'bg-red-100 text-red-700' : diff < 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
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
      )}

      {/* SEO positions */}
      {seoPositions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800 mb-3">Позиции в поиске</h2>
          <div className="space-y-2">
            {seoPositions.map((pos, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${pos.position <= 3 ? 'bg-green-100 text-green-700' : pos.position <= 10 ? 'bg-blue-100 text-blue-700' : pos.position <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {pos.position}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{pos.keyword}</p>
                  <p className="text-xs text-slate-400">Стр. {pos.page} · {pos.platform.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Отзывы</h2>
            <Link href="/reviews" className="text-xs text-purple-600 hover:text-purple-700">Все отзывы →</Link>
          </div>
          <div className="space-y-3">
            {reviews.map(r => (
              <div key={r.id} className={`p-3 rounded-xl border ${r.is_answered ? 'border-green-200 bg-green-50/50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map(s => (
                      <svg key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  {r.author && <span className="text-xs text-slate-500">{r.author}</span>}
                  <span className="text-xs text-slate-400 ml-auto">{new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{r.text}</p>
                {!r.is_answered && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-2 inline-block">
                    Без ответа
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finance P&L by SKU */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">Финансы по товару</h2>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[30, 60, 90].map(d => (
              <button key={d} onClick={() => setFinanceDays(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${financeDays === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {d} дн.
              </button>
            ))}
          </div>
        </div>
        {loadingFinance ? (
          <div className="flex justify-center py-6"><div className="w-6 h-6 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : financeRecords.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Нет данных о продажах за выбранный период</p>
        ) : (() => {
          const totals = financeRecords.reduce((acc, r) => ({
            quantity: acc.quantity + r.quantity,
            revenue: acc.revenue + r.revenue,
            commission: acc.commission + r.commission,
            logistics: acc.logistics + r.logistics,
            penalty: acc.penalty + r.penalty,
            net_payout: acc.net_payout + r.net_payout,
            gross_profit: acc.gross_profit + (r.gross_profit ?? 0),
          }), { quantity: 0, revenue: 0, commission: 0, logistics: 0, penalty: 0, net_payout: 0, gross_profit: 0 });
          const marginPct = totals.revenue > 0 ? Math.round((totals.gross_profit / totals.revenue) * 1000) / 10 : 0;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Выручка', value: `${fmt(totals.revenue)} ₽`, color: 'text-slate-900' },
                  { label: 'Чистая выплата', value: `${fmt(totals.net_payout)} ₽`, color: 'text-blue-700' },
                  { label: 'Прибыль', value: `${fmt(totals.gross_profit)} ₽`, color: totals.gross_profit >= 0 ? 'text-green-700' : 'text-red-600' },
                  { label: 'Маржа', value: `${marginPct}%`, color: marginPct >= 20 ? 'text-green-700' : marginPct >= 10 ? 'text-amber-600' : 'text-red-600' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">{kpi.label}</p>
                    <p className={`text-base font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-600">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Площадка', 'Продаж', 'Выручка', 'Комиссия', 'Логистика', 'Штрафы', 'Выплата'].map(h => (
                        <th key={h} className="py-1.5 text-right first:text-left first:pl-0 pr-3 last:pr-0 text-slate-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {financeRecords.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 font-medium text-slate-700 uppercase text-xs">{r.platform}</td>
                        <td className="py-1.5 text-right pr-3">{r.quantity}</td>
                        <td className="py-1.5 text-right pr-3">{fmt(r.revenue)} ₽</td>
                        <td className="py-1.5 text-right pr-3 text-red-500">-{fmt(r.commission)} ₽</td>
                        <td className="py-1.5 text-right pr-3 text-red-500">-{fmt(r.logistics)} ₽</td>
                        <td className="py-1.5 text-right pr-3 text-red-500">{r.penalty > 0 ? `-${fmt(r.penalty)} ₽` : '—'}</td>
                        <td className="py-1.5 text-right text-blue-700 font-medium">{fmt(r.net_payout)} ₽</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 font-semibold text-slate-800">
                      <td className="py-1.5">Итого</td>
                      <td className="py-1.5 text-right pr-3">{totals.quantity}</td>
                      <td className="py-1.5 text-right pr-3">{fmt(totals.revenue)} ₽</td>
                      <td className="py-1.5 text-right pr-3 text-red-500">-{fmt(totals.commission)} ₽</td>
                      <td className="py-1.5 text-right pr-3 text-red-500">-{fmt(totals.logistics)} ₽</td>
                      <td className="py-1.5 text-right pr-3 text-red-500">{totals.penalty > 0 ? `-${fmt(totals.penalty)} ₽` : '—'}</td>
                      <td className="py-1.5 text-right text-blue-700">{fmt(totals.net_payout)} ₽</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Smart Price Recommendation */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <p className="text-sm font-semibold text-slate-900">AI-рекомендация цены</p>
          </div>
          {!smartPrice && (
            <button
              onClick={async () => {
                setLoadingSmartPrice(true);
                try { setSmartPrice(await getSmartPrice(decodeURIComponent(sku), connectionId)); }
                catch { /* ignore */ }
                finally { setLoadingSmartPrice(false); }
              }}
              disabled={loadingSmartPrice}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {loadingSmartPrice ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
              {loadingSmartPrice ? 'Анализ...' : 'Проверить цену'}
            </button>
          )}
        </div>
        {smartPrice ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-0.5">Текущая цена</div>
                <div className="text-lg font-bold text-slate-700">{smartPrice.currentPrice > 0 ? `${smartPrice.currentPrice.toLocaleString('ru-RU')} ₽` : '—'}</div>
              </div>
              {smartPrice.recommendedPrice && smartPrice.recommendedPrice !== smartPrice.currentPrice && (
                <>
                  <div className="text-slate-300 text-xl">→</div>
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-0.5">Рекомендуем</div>
                    <div className={`text-lg font-bold ${smartPrice.recommendedPrice < smartPrice.currentPrice ? 'text-amber-600' : 'text-green-600'}`}>
                      {smartPrice.recommendedPrice.toLocaleString('ru-RU')} ₽
                    </div>
                  </div>
                </>
              )}
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-medium ${smartPrice.confidence === 'high' ? 'bg-green-50 border-green-200 text-green-700' : smartPrice.confidence === 'medium' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                {smartPrice.confidence === 'high' ? 'Высокая уверенность' : smartPrice.confidence === 'medium' ? 'Средняя уверенность' : 'Мало данных'}
              </span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{smartPrice.reasoning}</p>
            {smartPrice.data.competitorCount > 0 && (
              <div className="flex gap-4 flex-wrap text-xs text-slate-500">
                <span>Конкурентов: <strong>{smartPrice.data.competitorCount}</strong></span>
                {smartPrice.data.avgCompPrice && <span>Средняя цена конкурентов: <strong>{Math.round(smartPrice.data.avgCompPrice).toLocaleString('ru-RU')} ₽</strong></span>}
                {smartPrice.data.monthlySales > 0 && <span>Продаж/мес: <strong>{smartPrice.data.monthlySales}</strong></span>}
              </div>
            )}
            <button onClick={() => setSmartPrice(null)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Обновить</button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Нажмите «Проверить цену» — AI сравнит вашу цену с конкурентами и даст рекомендацию</p>
        )}
      </div>

      {/* AI Card Audit */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <p className="text-sm font-semibold text-slate-900">AI-аудит карточки</p>
          </div>
          {!audit && (
            <button
              onClick={async () => {
                setLoadingAudit(true);
                try {
                  const res = await auditProduct(decodeURIComponent(sku), product?.platform ? String(product.platform) : undefined);
                  setAudit(res.audit);
                } finally { setLoadingAudit(false); }
              }}
              disabled={loadingAudit}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {loadingAudit ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
              {loadingAudit ? 'Анализируем...' : 'Аудит карточки'}
            </button>
          )}
          {audit && <button onClick={() => setAudit(null)} className="text-xs text-slate-400 hover:text-slate-600">Обновить</button>}
        </div>

        {!audit && !loadingAudit && (
          <p className="text-sm text-slate-400">Нажмите «Аудит карточки» — AI проверит заголовок, описание, ключевые слова и предложит улучшения</p>
        )}

        {audit && (
          <div className="space-y-4">
            {/* Score + summary */}
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 rounded-full border-4 flex items-center justify-center text-lg font-bold"
                  style={{ borderColor: audit.score >= 70 ? '#16a34a' : audit.score >= 50 ? '#d97706' : '#dc2626',
                           color: audit.score >= 70 ? '#16a34a' : audit.score >= 50 ? '#d97706' : '#dc2626' }}>
                  {audit.score}
                </div>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{audit.summary}</p>
            </div>

            {/* Quick wins */}
            {audit.quick_wins?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Быстрые победы</p>
                <div className="space-y-2">
                  {audit.quick_wins.map((win: AuditQuickWin, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg">
                      <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                        win.impact === 'высокий' ? 'bg-green-100 text-green-700' :
                        win.impact === 'средний' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>{win.impact}</span>
                      <p className="text-sm text-slate-700 flex-1">{win.action}</p>
                      <span className="flex-shrink-0 text-xs text-slate-400">усилия: {win.effort}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Title improvements */}
            {(audit.title_issues?.length > 0 || audit.title_suggestion) && (
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Заголовок</p>
                {audit.title_issues?.map((issue: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-amber-700 mb-1">
                    <span className="text-amber-500 flex-shrink-0">⚠</span> {issue}
                  </div>
                ))}
                {audit.title_suggestion && (
                  <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-600 font-medium mb-1">Рекомендуемый заголовок:</p>
                    <p className="text-sm text-green-900">{audit.title_suggestion}</p>
                  </div>
                )}
              </div>
            )}

            {/* Keyword gaps */}
            {audit.keyword_gaps?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Ключевые слова для добавления</p>
                <div className="flex flex-wrap gap-1.5">
                  {audit.keyword_gaps.map((kw: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Description tips */}
            {audit.description_tips?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Советы по описанию</p>
                <ul className="space-y-1">
                  {audit.description_tips.map((tip: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-purple-400 flex-shrink-0 mt-0.5">•</span> {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Link to chat for AI analysis */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-purple-900">Нужен совет по этому товару?</p>
          <p className="text-xs text-purple-600">AI-ассистент проанализирует цены, конкурентов и SEO</p>
        </div>
        <Link href={`/chat?prompt=Проанализируй товар SKU ${decodedSku}: цены, конкуренты, остатки и SEO. Дай рекомендации.`}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
          Спросить AI
        </Link>
      </div>
    </div>
  );
}

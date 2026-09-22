'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWatchlist, removeFromWatchlist, type WatchlistItem } from '@/lib/api';

const PLATFORM_LABELS: Record<string, string> = {
  wb: 'WB', ozon: 'Ozon', ym: 'ЯМ', mm: 'ММ',
};

const PLATFORM_COLORS: Record<string, string> = {
  wb: 'bg-purple-100 text-purple-700',
  ozon: 'bg-blue-100 text-blue-700',
  ym: 'bg-amber-100 text-amber-700',
  mm: 'bg-green-100 text-green-700',
};

function fmt(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

function StockBadge({ qty }: { qty: number | null }) {
  if (qty == null) return <span className="text-slate-300 text-xs">—</span>;
  if (qty === 0) return <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">0 шт</span>;
  if (qty < 10) return <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{qty} шт</span>;
  return <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{qty} шт</span>;
}

function MarginBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-slate-300 text-xs">нет закупки</span>;
  const color = pct >= 20 ? 'text-green-700' : pct >= 10 ? 'text-amber-600' : pct >= 0 ? 'text-orange-600' : 'text-red-600';
  return <span className={`text-sm font-semibold ${color}`}>{pct >= 0 ? '+' : ''}{pct}%</span>;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getWatchlist()
      .then(setItems)
      .catch(e => setError(e.message ?? 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  async function handleRemove(id: number) {
    await removeFromWatchlist(id).catch(() => {});
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Избранные товары</h1>
          <p className="text-slate-500 text-sm mt-0.5">Быстрый мониторинг ключевых SKU — остатки, выручка и маржа за 30 дней</p>
        </div>
        <div className="flex gap-2">
          <Link href="/pnl" className="px-4 py-2 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
            P&amp;L по товарам
          </Link>
          <Link href="/scoreboard" className="px-4 py-2 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
            Рейтинг товаров
          </Link>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-slate-200">
          <div className="text-5xl mb-4">⭐</div>
          <p className="font-semibold text-slate-700 mb-1">Список наблюдения пуст</p>
          <p className="text-sm text-slate-400 mb-4">Добавляйте товары из P&L, Рейтинга или Склада</p>
          <div className="flex gap-3 justify-center">
            <Link href="/pnl" className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors">
              Открыть P&amp;L
            </Link>
            <Link href="/scoreboard" className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
              Рейтинг товаров
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Товаров в списке', value: items.length.toString(), sub: 'отслеживается' },
              { label: 'Выручка 30 дн.', value: `${fmt(items.reduce((s, i) => s + i.revenue, 0))} ₽`, sub: 'суммарно' },
              { label: 'Нулевые остатки', value: items.filter(i => i.stock_qty === 0).length.toString(), sub: 'нужно пополнить', color: items.filter(i => i.stock_qty === 0).length > 0 ? 'text-red-600' : 'text-green-700' },
              { label: 'Ср. маржа', value: (() => {
                const withMargin = items.filter(i => i.margin_pct != null);
                if (!withMargin.length) return '—';
                return `${(withMargin.reduce((s, i) => s + (i.margin_pct ?? 0), 0) / withMargin.length).toFixed(1)}%`;
              })(), sub: 'по товарам' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-xl font-bold ${color ?? 'text-slate-900'}`}>{value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs text-slate-500 font-medium">Товар</th>
                    <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Остаток</th>
                    <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Выручка 30 дн.</th>
                    <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Кол-во</th>
                    <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Маржа</th>
                    <th className="px-4 py-2.5 text-center text-xs text-slate-500 font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 truncate max-w-[220px]">{item.title || item.sku}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[item.platform] ?? 'bg-slate-100 text-slate-600'}`}>
                            {PLATFORM_LABELS[item.platform] ?? item.platform}
                          </span>
                          <span className="text-xs text-slate-400">{item.sku}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StockBadge qty={item.stock_qty} />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {item.revenue > 0 ? `${fmt(item.revenue)} ₽` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {item.quantity > 0 ? item.quantity : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MarginBadge pct={item.margin_pct} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/pnl?sku=${encodeURIComponent(item.sku)}`}
                            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Открыть в P&L"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </Link>
                          <button
                            onClick={() => handleRemove(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Убрать из списка"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

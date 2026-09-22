'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { apiRequest as apiFetch, importPurchasePriceCsv, getWarehouseCsvExportUrl, getWarehouseAiAnalysis, WarehouseAiAnalysis, WarehouseAiStockAdvice } from '@/lib/api';

interface StockRow {
  sku: string;
  catalog_title: string;
  platform: string;
  warehouse_type: 'fbo' | 'fbs';
  warehouse_name: string;
  quantity: number;
  purchase_price: number | null;
  connection_name: string;
  snapped_at: string;
}

interface CatalogItem {
  platform: string;
  sku: string;
  title: string;
  purchase_price: number | null;
}

const PLATFORM_LABELS: Record<string, string> = { wb: 'WildBerries', ozon: 'Ozon' };
const WH_LABELS: Record<string, string> = { fbo: 'FBO (склад МП)', fbs: 'FBS (мой склад)' };
const WH_COLORS: Record<string, string> = {
  fbo: 'bg-blue-100 text-blue-700',
  fbs: 'bg-orange-100 text-orange-700',
};

function AdviceList({ items, color }: { items: WarehouseAiStockAdvice[]; color: string }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((a, i) => (
        <div key={i} className={`rounded-lg border p-3 ${color}`}>
          <p className="text-xs font-semibold text-slate-700 truncate">{a.title || a.sku}</p>
          <p className="text-xs text-slate-500 mt-0.5">{a.issue}</p>
          <p className="text-xs font-medium text-slate-800 mt-1">→ {a.action}</p>
        </div>
      ))}
    </div>
  );
}

function WarehouseAiPanel({ result, onClose }: { result: WarehouseAiAnalysis; onClose: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-violet-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h3 className="font-semibold text-slate-800">AI анализ склада</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>

      <p className="text-sm text-slate-600">{result.summary}</p>

      {/* Stat strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'SKU', value: result.total_skus },
          { label: 'Нулевые', value: result.zero_stock_count, red: result.zero_stock_count > 0 },
          { label: 'Избыток', value: result.overstock_count, amber: result.overstock_count > 0 },
          { label: 'Дефицит', value: result.understock_count, red: result.understock_count > 0 },
        ].map(({ label, value, red, amber }) => (
          <div key={label} className="bg-slate-50 rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${red ? 'text-red-600' : amber ? 'text-amber-600' : 'text-slate-800'}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {result.overstock_advice.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Избыточные остатки</p>
            <AdviceList items={result.overstock_advice} color="bg-amber-50 border-amber-100" />
          </div>
        )}
        {result.understock_advice.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Дефицит</p>
            <AdviceList items={result.understock_advice} color="bg-red-50 border-red-100" />
          </div>
        )}
        {result.imbalance_advice.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">Дисбаланс FBO/FBS</p>
            <AdviceList items={result.imbalance_advice} color="bg-blue-50 border-blue-100" />
          </div>
        )}
      </div>

      {result.actions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Рекомендации</p>
          <ol className="space-y-1">
            {result.actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                {a}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-slate-400">Сформировано: {new Date(result.generated_at).toLocaleString('ru-RU')}</p>
    </div>
  );
}

export default function WarehousePage() {
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'fbo' | 'fbs'>('all');
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; errors: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [aiResult, setAiResult] = useState<WarehouseAiAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/api/warehouse/stocks');
      setStocks(data.stocks ?? []);
    } catch (e: any) {
      if (e.message?.includes('403') || e.status === 403) setNoAccess(true);
      else setError(e.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError('');
    try {
      await apiFetch('/api/warehouse/sync', { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importPurchasePriceCsv(file);
      setImportResult(result);
      await load();
    } catch (err: any) {
      setError(err.message ?? 'Ошибка импорта');
    } finally {
      setImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  async function handleAiAnalysis() {
    setAiLoading(true);
    setAiResult(null);
    try {
      const result = await getWarehouseAiAnalysis();
      setAiResult(result);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка AI анализа');
    } finally {
      setAiLoading(false);
    }
  }

  async function savePrice(platform: string, sku: string) {
    const price = parseFloat(editPrice);
    if (!price || price <= 0) return;
    setSavingPrice(true);
    try {
      await apiFetch(`/api/warehouse/catalog/${platform}/${sku}`, {
        method: 'PUT',
        body: JSON.stringify({ purchase_price: price }),
      });
      setStocks(prev => prev.map(s =>
        s.sku === sku && s.platform === platform ? { ...s, purchase_price: price } : s
      ));
      setEditingSku(null);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка сохранения');
    } finally {
      setSavingPrice(false);
    }
  }

  const filtered = stocks.filter(s => tab === 'all' || s.warehouse_type === tab);

  const totalFbo = stocks.filter(s => s.warehouse_type === 'fbo').reduce((s, r) => s + r.quantity, 0);
  const totalFbs = stocks.filter(s => s.warehouse_type === 'fbs').reduce((s, r) => s + r.quantity, 0);
  const totalSkus = new Set(stocks.map(s => s.sku)).size;

  if (noAccess) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-4">
        <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V7m0 0a4 4 0 00-4 4h8a4 4 0 00-4-4z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800">Нужен тариф «Старт»</h2>
        <p className="text-slate-500 text-sm">Учёт остатков по складам доступен с тарифа Старт (490 ₽/мес)</p>
        <Link href="/pricing" className="inline-block px-5 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors">
          Посмотреть тарифы
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Склад</h1>
          <p className="text-slate-500 text-sm mt-0.5">Остатки по всем складам и маркетплейсам</p>
        </div>
        <div className="flex items-center gap-2">
          {/* CSV import */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvImport}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={importing}
            title="Загрузить CSV с себестоимостью"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            <svg className={`w-4 h-4 ${importing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {importing ? 'Импорт...' : 'Импорт CSV'}
          </button>
          <a
            href={getWarehouseCsvExportUrl()}
            download="purchase_prices.csv"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            title="Скачать шаблон CSV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Шаблон
          </a>
          <button
            onClick={handleAiAnalysis}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {aiLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : <span>🤖</span>}
            {aiLoading ? 'Анализ...' : 'AI анализ'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Синхронизация...' : 'Обновить остатки'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {importResult && (
        <div className={`p-3 rounded-lg text-sm border ${importResult.errors.length ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          <div className="flex items-center justify-between">
            <span>
              Обновлено: <strong>{importResult.updated}</strong> товаров
              {importResult.errors.length > 0 && `, пропущено: ${importResult.errors.length}`}
            </span>
            <button onClick={() => setImportResult(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs opacity-70">
              {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              {importResult.errors.length > 5 && <li>...и ещё {importResult.errors.length - 5}</li>}
            </ul>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Всего товаров', value: totalSkus },
          { label: 'FBO (МП)', value: totalFbo },
          { label: 'FBS (мой склад)', value: totalFbs },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-900">{value.toLocaleString('ru-RU')}</p>
          </div>
        ))}
      </div>

      {aiResult && (
        <WarehouseAiPanel result={aiResult} onClose={() => setAiResult(null)} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(['all', 'fbo', 'fbs'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'all' ? 'Все' : WH_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm">Остатки не найдены. Нажмите «Обновить остатки».</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Товар / SKU</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Площадка</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Склад</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Остаток</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Себест., ₽</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 truncate max-w-[220px]">
                      {row.catalog_title || 'Без названия'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{row.sku}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-slate-600">{PLATFORM_LABELS[row.platform] ?? row.platform}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${WH_COLORS[row.warehouse_type]}`}>
                      {row.warehouse_type.toUpperCase()}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[140px]">{row.warehouse_name}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${row.quantity < 5 ? 'text-red-600' : row.quantity < 20 ? 'text-amber-600' : 'text-slate-800'}`}>
                      {row.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingSku === `${row.platform}:${row.sku}` ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          autoFocus
                          type="number"
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                          className="w-20 px-2 py-1 text-xs border border-purple-400 rounded focus:outline-none"
                          placeholder="0.00"
                        />
                        <button
                          onClick={() => savePrice(row.platform, row.sku)}
                          disabled={savingPrice}
                          className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                        >✓</button>
                        <button onClick={() => setEditingSku(null)} className="text-xs px-2 py-1 bg-slate-200 rounded">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingSku(`${row.platform}:${row.sku}`); setEditPrice(String(row.purchase_price ?? '')); }}
                        className="text-slate-600 hover:text-purple-600 transition-colors"
                        title="Установить цену закупки"
                      >
                        {row.purchase_price != null
                          ? <span className="font-medium">{Number(row.purchase_price).toLocaleString('ru-RU')} ₽</span>
                          : <span className="text-slate-300 text-xs">— указать</span>
                        }
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

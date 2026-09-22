'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProducts, getConnections, updateProductPrice, bulkUpdatePrices, bulkGenerateAiContent } from '@/lib/api';
import type { ScoredProduct, ProductSummary, Connection } from '@/lib/api';

const PLATFORM_BADGE: Record<string, { label: string; cls: string }> = {
  wb:   { label: 'WB',              cls: 'bg-pink-50 text-pink-700 border-pink-200' },
  ozon: { label: 'Ozon',            cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  ym:   { label: 'Яндекс',          cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  mm:   { label: 'Мегамаркет',      cls: 'bg-green-50 text-green-700 border-green-200' },
};

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

function InlinePriceEdit({ product, onSaved }: { product: ScoredProduct; onSaved: (newPrice: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(product.price));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const p = Number(value);
    if (!p || p <= 0) { setError('Укажите корректную цену'); return; }
    setSaving(true); setError('');
    try {
      await updateProductPrice({ connectionId: product.connectionId, sku: product.sku, price: p });
      onSaved(p);
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-right group">
        <p className="text-sm font-semibold text-slate-800 group-hover:text-purple-600 transition-colors">
          {product.price.toLocaleString('ru-RU')} ₽
          <span className="ml-1 text-xs text-slate-300 group-hover:text-purple-400">✏</span>
        </p>
        <p className="text-xs text-slate-400">{product.stock} шт.</p>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 min-w-[110px]">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="w-20 px-2 py-1 border border-purple-400 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <span className="text-xs text-slate-500">₽</span>
        <button onClick={save} disabled={saving}
          className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors disabled:opacity-50">
          {saving ? '...' : '✓'}
        </button>
        <button onClick={() => setEditing(false)} className="px-2 py-1 border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs rounded transition-colors">✕</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
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
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | 'price' | 'ai'>(null);
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkResult, setBulkResult] = useState('');

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
      setPriceOverrides({});
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

  function toggleSelect(key: string) {
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => `${p.connectionId}:${p.sku}`)));
  }

  async function handleBulkPrice() {
    const p = Number(bulkPrice);
    if (!p || p <= 0) return;
    setBulkWorking(true); setBulkResult('');
    const connId = selectedConn || connections[0]?.id;
    if (!connId) { setBulkWorking(false); return; }
    const updates = filtered
      .filter(pr => selected.has(`${pr.connectionId}:${pr.sku}`))
      .map(pr => ({ sku: pr.sku, price: p }));
    try {
      const res = await bulkUpdatePrices(connId, updates);
      setBulkResult(`Обновлено ${res.applied} из ${updates.length} товаров`);
      setBulkAction(null); setSelected(new Set());
    } catch (e: any) { setBulkResult(e.message); }
    finally { setBulkWorking(false); }
  }

  async function handleBulkAi() {
    setBulkWorking(true); setBulkResult('');
    const connId = selectedConn || connections[0]?.id;
    if (!connId) { setBulkWorking(false); return; }
    const skus = filtered
      .filter(pr => selected.has(`${pr.connectionId}:${pr.sku}`))
      .map(pr => pr.sku)
      .slice(0, 20);
    try {
      const { results } = await bulkGenerateAiContent(connId, skus);
      setBulkResult(`AI-контент создан для ${results.length} товаров`);
      setBulkAction(null); setSelected(new Set());
    } catch (e: any) { setBulkResult(e.message); }
    finally { setBulkWorking(false); }
  }

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
        <p className="text-slate-500 text-sm mb-6">Подключите WildBerries, Ozon, Яндекс Маркет или Мегамаркет чтобы видеть товары и их оценки</p>
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
        <div className="flex gap-2 flex-wrap items-center">
          <a href="/api/products/export" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 ml-auto border border-slate-200 bg-white text-slate-600 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Экспорт CSV
          </a>
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-purple-600 rounded-xl p-3 flex flex-wrap items-center gap-3 text-white text-sm">
          <span className="font-medium">{selected.size} выбрано</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button onClick={() => setBulkAction('price')}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">
              Установить цену
            </button>
            <button onClick={() => { setBulkAction('ai'); handleBulkAi(); }}
              disabled={bulkWorking}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
              {bulkWorking && bulkAction === 'ai' ? 'Генерируем...' : 'AI-контент'}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors">
              Отмена
            </button>
          </div>
          {bulkAction === 'price' && (
            <div className="w-full flex gap-2 items-center">
              <input type="number" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)}
                placeholder="Новая цена ₽"
                className="px-3 py-1.5 rounded-lg text-slate-900 text-sm w-36 focus:outline-none" />
              <button onClick={handleBulkPrice} disabled={bulkWorking}
                className="px-3 py-1.5 bg-white text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-50 disabled:opacity-50 transition-colors">
                {bulkWorking ? 'Обновляем...' : 'Применить'}
              </button>
            </div>
          )}
          {bulkResult && <p className="w-full text-xs text-purple-100">{bulkResult}</p>}
        </div>
      )}

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          {products.length === 0 ? 'Нет товаров в подключённом магазине' : 'Нет товаров с таким фильтром'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50">
          {/* Select all row */}
          <div className="px-4 py-2 flex items-center gap-3 bg-slate-50/50">
            <input type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 accent-purple-600 cursor-pointer"
            />
            <span className="text-xs text-slate-500">Выбрать все ({filtered.length})</span>
          </div>
          {filtered.map((p) => {
            const key = `${p.connectionId}:${p.sku}`;
            const c = SCORE_COLORS[p.scoreLabel];
            const pb = PLATFORM_BADGE[p.platform] ?? { label: p.platform.toUpperCase(), cls: 'bg-slate-50 text-slate-700 border-slate-200' };
            const displayPrice = priceOverrides[`${p.connectionId}:${p.sku}`] ?? p.price;
            const displayProduct = { ...p, price: displayPrice };
            return (
              <div key={`${p.platform}-${p.sku}`} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${selected.has(key) ? 'bg-purple-50/50' : ''}`}>
                {/* Checkbox */}
                <input type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggleSelect(key)}
                  className="w-4 h-4 accent-purple-600 cursor-pointer shrink-0"
                />

                {/* Photo thumbnail */}
                {p.photoUrls?.[0] ? (
                  <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={p.photoUrls[0]} alt={p.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className={`shrink-0 w-14 h-14 rounded-xl border flex flex-col items-center justify-center ${c.badge}`}>
                    <span className="text-lg font-bold leading-none">{p.score}</span>
                    <span className="text-xs font-medium mt-0.5">{c.label}</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="font-medium text-slate-900 truncate max-w-xs sm:max-w-md">{p.title || `Арт. ${p.sku}`}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${pb.cls}`}>
                      {pb.label} · {p.sku}
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
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:block">
                    <InlinePriceEdit
                      product={displayProduct}
                      onSaved={(newPrice) => setPriceOverrides((prev) => ({ ...prev, [`${p.connectionId}:${p.sku}`]: newPrice }))}
                    />
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
                  <Link
                    href={`/products/${encodeURIComponent(p.sku)}?connectionId=${p.connectionId}`}
                    className="flex items-center gap-1 px-3 py-2 border border-slate-200 hover:border-purple-300 text-slate-600 hover:text-purple-700 text-sm rounded-xl transition-colors whitespace-nowrap"
                  >
                    Детали
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

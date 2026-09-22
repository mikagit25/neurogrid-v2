'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CompetitorSku, CompetitorPricePoint, CompetitorAiSummary,
  getCompetitors, addCompetitor, updateCompetitor, deleteCompetitor, scrapeAllCompetitors,
  getCompetitorAiSummary,
} from '@/lib/api';

const PLATFORM_LABELS: Record<string, string> = { wb: 'Wildberries', ozon: 'Ozon' };
const PLATFORM_COLORS: Record<string, string> = {
  wb: 'bg-pink-50 text-pink-700 border-pink-200',
  ozon: 'bg-blue-50 text-blue-700 border-blue-200',
};

function fmt(n: number) { return Math.round(n).toLocaleString('ru-RU'); }

function PriceSparkline({ history }: { history: CompetitorPricePoint[] }) {
  if (history.length < 2) {
    return <span className="text-xs text-slate-300">—</span>;
  }
  const sorted = [...history].sort((a, b) => a.scraped_at.localeCompare(b.scraped_at));
  const prices = sorted.map(h => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices, min + 1);
  const W = 80; const H = 28;
  const px = (i: number) => (i / (sorted.length - 1)) * W;
  const py = (v: number) => H - ((v - min) / (max - min)) * H;
  const pts = sorted.map((h, i) => `${px(i)},${py(h.price)}`).join(' ');
  const trend = prices[prices.length - 1] - prices[0];
  const color = trend < 0 ? '#16a34a' : trend > 0 ? '#dc2626' : '#94a3b8';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function PriceChangeBadge({ history }: { history: CompetitorPricePoint[] }) {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.scraped_at.localeCompare(b.scraped_at));
  const latest = sorted[sorted.length - 1].price;
  const prev = sorted[sorted.length - 2].price;
  const diff = latest - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : 0;
  if (diff === 0) return null;
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${diff < 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {diff < 0 ? '▼' : '▲'} {Math.abs(pct)}%
    </span>
  );
}

function AddCompetitorModal({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  const [platform, setPlatform] = useState<'wb' | 'ozon'>('wb');
  const [externalId, setExternalId] = useState('');
  const [ourSku, setOurSku] = useState('');
  const [alertPct, setAlertPct] = useState('5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit() {
    if (!externalId.trim()) { setError('Укажите ID товара'); return; }
    setSaving(true);
    setError('');
    try {
      await addCompetitor({
        platform,
        external_id: externalId.trim(),
        our_sku: ourSku.trim() || undefined,
        alert_pct: alertPct ? Number(alertPct) : undefined,
      });
      onSave();
    } catch (e: any) {
      setError(e.message ?? 'Ошибка при добавлении');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Добавить конкурента</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Площадка</label>
            <div className="flex gap-2">
              {(['wb', 'ozon'] as const).map(p => (
                <button key={p} onClick={() => setPlatform(p)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    platform === p ? 'bg-purple-50 border-purple-300 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              {platform === 'wb' ? 'Артикул WB (числовой)' : 'ID товара Ozon'}
            </label>
            <input
              value={externalId}
              onChange={e => setExternalId(e.target.value)}
              placeholder={platform === 'wb' ? 'например: 123456789' : 'например: 987654321'}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            {platform === 'wb' && (
              <p className="text-xs text-slate-400 mt-1">Артикул из URL: wildberries.ru/catalog/<span className="font-mono font-bold">123456789</span>/detail.aspx</p>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">Наш SKU (для сравнения, опционально)</label>
            <input
              value={ourSku}
              onChange={e => setOurSku(e.target.value)}
              placeholder="Ваш артикул"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">Порог оповещения (% изменения цены)</label>
            <input
              type="number"
              value={alertPct}
              onChange={e => setAlertPct(e.target.value)}
              min="1" max="50"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onSubmit} disabled={saving}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Добавляем...' : 'Добавить и отслеживать'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-slate-500 text-sm hover:text-slate-700">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<CompetitorSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAlertPct, setEditAlertPct] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aiSummary, setAiSummary] = useState<CompetitorAiSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCompetitors(await getCompetitors()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleScrapeAll() {
    setScraping(true);
    try { await scrapeAllCompetitors(); await load(); }
    finally { setScraping(false); }
  }

  async function handleDelete(id: string) {
    await deleteCompetitor(id);
    setConfirmDelete(null);
    await load();
  }

  async function handleUpdateAlert(id: string) {
    await updateCompetitor(id, { alert_pct: Number(editAlertPct) });
    setEditingId(null);
    await load();
  }

  async function handleAiSummary() {
    setAiLoading(true);
    setShowAiPanel(true);
    setAiSummary(null);
    try { setAiSummary(await getCompetitorAiSummary()); }
    catch (e: any) { setError(e.message); }
    finally { setAiLoading(false); }
  }

  // Summary stats
  const totalTracked = competitors.length;
  const priceDrops = competitors.filter(c => {
    if (c.history.length < 2) return false;
    const sorted = [...c.history].sort((a, b) => a.scraped_at.localeCompare(b.scraped_at));
    return sorted[sorted.length - 1].price < sorted[sorted.length - 2].price;
  }).length;
  const priceRises = competitors.filter(c => {
    if (c.history.length < 2) return false;
    const sorted = [...c.history].sort((a, b) => a.scraped_at.localeCompare(b.scraped_at));
    return sorted[sorted.length - 1].price > sorted[sorted.length - 2].price;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Мониторинг конкурентов</h1>
          <p className="text-slate-500 text-sm mt-0.5">Отслеживайте цены конкурентов на WB и Ozon</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleScrapeAll} disabled={scraping || loading}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            <svg className={`w-4 h-4 ${scraping ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {scraping ? 'Обновляем...' : 'Обновить цены'}
          </button>
          <button onClick={handleAiSummary} disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {aiLoading ? (
              <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            AI Позиционирование
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Добавить конкурента
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {totalTracked > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{totalTracked}</p>
            <p className="text-xs text-slate-500 mt-0.5">Отслеживается</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{priceDrops}</p>
            <p className="text-xs text-slate-500 mt-0.5">Цена снизилась</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{priceRises}</p>
            <p className="text-xs text-slate-500 mt-0.5">Цена выросла</p>
          </div>
        </div>
      )}

      {/* AI Positioning panel */}
      {showAiPanel && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-sm font-semibold text-slate-800">AI Конкурентное позиционирование</span>
            <button onClick={() => setShowAiPanel(false)} className="text-slate-400 hover:text-slate-600 text-xs">Скрыть</button>
          </div>
          {aiLoading ? (
            <div className="flex items-center justify-center py-8 gap-3">
              <div className="w-6 h-6 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Анализируем конкурентную позицию...</p>
            </div>
          ) : aiSummary && (() => {
            const posConfig: Record<string, { icon: string; color: string; bg: string }> = {
              leader:      { icon: '🏆', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
              competitive: { icon: '⚡', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
              lagging:     { icon: '📉', color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
              mixed:       { icon: '📊', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
              unknown:     { icon: 'ℹ️', color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
            };
            const pc = posConfig[aiSummary.positioning] ?? posConfig.unknown;
            return (
              <div className="p-5 space-y-4">
                <div className={`flex items-center gap-3 p-4 rounded-xl border ${pc.bg}`}>
                  <span className="text-2xl">{pc.icon}</span>
                  <div>
                    <p className={`font-bold ${pc.color}`}>{aiSummary.positioning_label}</p>
                    <p className="text-sm text-slate-700 mt-0.5 leading-relaxed">{aiSummary.summary}</p>
                  </div>
                  <span className="ml-auto text-xs text-slate-400 shrink-0">
                    {new Date(aiSummary.generated_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {aiSummary.advantages.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-green-700 mb-2">Преимущества</p>
                      <ul className="space-y-1.5">
                        {aiSummary.advantages.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiSummary.weaknesses.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-red-700 mb-2">Слабые стороны</p>
                      <ul className="space-y-1.5">
                        {aiSummary.weaknesses.map((w, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                            <span className="text-red-500 mt-0.5 flex-shrink-0">✗</span>{w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiSummary.strategy_tips.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-purple-700 mb-2">Стратегические советы</p>
                      <ul className="space-y-1.5">
                        {aiSummary.strategy_tips.map((t, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-purple-900">
                            <svg className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">Убрать этот товар из отслеживания?</p>
          <div className="flex gap-2">
            <button onClick={() => handleDelete(confirmDelete)}
              className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700">Убрать</button>
            <button onClick={() => setConfirmDelete(null)} className="text-slate-500 text-sm px-3 py-1.5">Отмена</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : competitors.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium mb-1">Нет отслеживаемых конкурентов</p>
          <p className="text-slate-400 text-sm mb-4">Добавьте артикул конкурента на WB или Ozon, чтобы следить за его ценой</p>
          <button onClick={() => setShowAdd(true)}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
            Добавить первого конкурента
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Товар конкурента</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Наш SKU</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Цена сейчас</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">История 30д</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">Порог</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Обновлено</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {competitors.map(c => {
                const sorted = [...c.history].sort((a, b) => a.scraped_at.localeCompare(b.scraped_at));
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded border text-xs font-medium ${PLATFORM_COLORS[c.platform]}`}>
                          {c.platform.toUpperCase()}
                        </span>
                        <div>
                          <p className="font-medium text-slate-800 truncate max-w-[160px]">
                            {c.name ?? `#${c.external_id}`}
                          </p>
                          {c.brand && <p className="text-xs text-slate-400">{c.brand}</p>}
                          <p className="text-xs text-slate-300 font-mono">{c.external_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                      {c.our_sku ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <PriceChangeBadge history={c.history} />
                        <span className="font-semibold text-slate-900">
                          {c.last_price != null ? `${fmt(c.last_price)} ₽` : <span className="text-slate-300">—</span>}
                        </span>
                      </div>
                      {sorted.length >= 2 && (
                        <p className="text-xs text-slate-400 text-right mt-0.5">
                          мин {fmt(Math.min(...sorted.map(h => h.price)))} / макс {fmt(Math.max(...sorted.map(h => h.price)))}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <PriceSparkline history={c.history} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingId === c.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number" value={editAlertPct} onChange={e => setEditAlertPct(e.target.value)}
                            className="w-14 border rounded px-1.5 py-1 text-xs"
                          />
                          <span className="text-xs text-slate-400">%</span>
                          <button onClick={() => handleUpdateAlert(c.id)}
                            className="text-xs text-purple-600 font-medium hover:text-purple-800">✓</button>
                          <button onClick={() => setEditingId(null)}
                            className="text-xs text-slate-400 hover:text-slate-600">✗</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingId(c.id); setEditAlertPct(String(c.alert_pct)); }}
                          className="text-xs text-slate-500 hover:text-purple-600 border border-dashed border-slate-200 rounded px-2 py-0.5">
                          ±{c.alert_pct}%
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">
                      {c.last_scraped_at
                        ? new Date(c.last_scraped_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setConfirmDelete(c.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddCompetitorModal onSave={() => { setShowAdd(false); load(); }} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

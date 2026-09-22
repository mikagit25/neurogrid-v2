'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  TrackedKeyword, KeywordPosition, ListingScore, TrackedCompetitor,
  getTrackedKeywords, addTrackedKeyword, deleteTrackedKeyword,
  checkKeywordPositions, getKeywordHistory,
  getListingScores, computeListingScores,
  getTrackedCompetitors, addTrackedCompetitor, deleteTrackedCompetitor,
  checkCompetitorPrices,
  generateSeoListing, type SeoListingResult,
} from '../../../lib/api';

// ---- helpers ----
function ScoreBadge({ score, label }: { score: number; label: string }) {
  const color =
    label === 'excellent' ? 'bg-green-100 text-green-800' :
    label === 'good' ? 'bg-blue-100 text-blue-800' :
    label === 'average' ? 'bg-yellow-100 text-yellow-800' :
    'bg-red-100 text-red-800';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{score}</span>;
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PositionBadge({ pos }: { pos: number | null | undefined }) {
  if (pos == null) return <span className="text-gray-400 text-xs">—</span>;
  const color = pos <= 10 ? 'text-green-600' : pos <= 30 ? 'text-blue-600' : pos <= 50 ? 'text-yellow-600' : 'text-red-600';
  return <span className={`font-bold ${color}`}>{pos}</span>;
}

// ---- Keywords tab ----
function KeywordsTab() {
  const [keywords, setKeywords] = useState<TrackedKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [selectedKw, setSelectedKw] = useState<string | null>(null);
  const [history, setHistory] = useState<KeywordPosition[]>([]);
  const [form, setForm] = useState({ platform: 'wb', sku: '', keyword: '' });
  const [addError, setAddError] = useState('');

  const load = useCallback(async () => {
    try { setKeywords(await getTrackedKeywords()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onCheck() {
    setChecking(true);
    try { await checkKeywordPositions(); await load(); } finally { setChecking(false); }
  }

  async function onAdd() {
    setAddError('');
    if (!form.sku.trim() || !form.keyword.trim()) { setAddError('Заполните SKU и ключевое слово'); return; }
    try {
      await addTrackedKeyword(form);
      setForm({ platform: 'wb', sku: '', keyword: '' });
      await load();
    } catch (e: any) { setAddError(e.message); }
  }

  async function onDelete(id: string) {
    await deleteTrackedKeyword(id);
    setKeywords(kws => kws.filter(k => k.id !== id));
  }

  async function onSelect(id: string) {
    if (selectedKw === id) { setSelectedKw(null); return; }
    setSelectedKw(id);
    setHistory(await getKeywordHistory(id));
  }

  if (loading) return <div className="py-10 text-center text-gray-400">Загрузка...</div>;

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Платформа</label>
          <select
            value={form.platform}
            onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="wb">Wildberries</option>
            <option value="ozon">Ozon</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">SKU</label>
          <input
            value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
            placeholder="Артикул" className="border rounded px-2 py-1.5 text-sm w-36"
          />
        </div>
        <div className="flex-1 min-w-48">
          <label className="text-xs text-gray-500 block mb-1">Ключевое слово</label>
          <input
            value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
            placeholder="например: кроссовки мужские" className="border rounded px-2 py-1.5 text-sm w-full"
          />
        </div>
        <button onClick={onAdd} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm hover:bg-indigo-700">
          + Добавить
        </button>
        <button onClick={onCheck} disabled={checking} className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-200 disabled:opacity-50">
          {checking ? 'Проверяем...' : 'Проверить позиции'}
        </button>
        <a href="/api/seo/keywords/export" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 border border-gray-200 bg-white text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          CSV
        </a>
        {addError && <span className="text-red-500 text-xs w-full">{addError}</span>}
      </div>

      {/* Table */}
      {keywords.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Нет отслеживаемых ключей. Добавьте первый!</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Платформа</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Ключевое слово</th>
                <th className="px-4 py-3 text-center">Позиция</th>
                <th className="px-4 py-3 text-left">Проверено</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keywords.map(kw => (
                <>
                  <tr key={kw.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(kw.id)}>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100">{kw.platform.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{kw.sku}</td>
                    <td className="px-4 py-3 font-medium">{kw.keyword}</td>
                    <td className="px-4 py-3 text-center">
                      <PositionBadge pos={kw.last_position?.position} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {kw.last_position ? new Date(kw.last_position.checked_at).toLocaleString('ru') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); onDelete(kw.id); }}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >Удалить</button>
                    </td>
                  </tr>
                  {selectedKw === kw.id && (
                    <tr key={`${kw.id}-hist`}>
                      <td colSpan={6} className="px-6 py-4 bg-gray-50">
                        <p className="text-xs text-gray-500 mb-2 font-medium">История позиций (последние 30)</p>
                        {history.length === 0 ? (
                          <p className="text-xs text-gray-400">Нет данных</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {history.map(h => (
                              <div key={h.id} className="text-center">
                                <PositionBadge pos={h.position} />
                                <div className="text-xs text-gray-400 mt-0.5">{new Date(h.checked_at).toLocaleDateString('ru')}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Listing Scores tab ----
function ListingScoresTab() {
  const [scores, setScores] = useState<ListingScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [filterLabel, setFilterLabel] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setScores(await getListingScores(filterPlatform || undefined, filterLabel || undefined)); }
    finally { setLoading(false); }
  }, [filterLabel, filterPlatform]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function onCompute() {
    setComputing(true);
    try { await computeListingScores(); await load(); } finally { setComputing(false); }
  }

  const avg = scores.length ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length) : 0;
  const byLabel = { excellent: 0, good: 0, average: 0, poor: 0 };
  for (const s of scores) byLabel[s.score_label]++;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-2xl font-bold">{avg}</div>
          <div className="text-xs text-gray-500">Средний балл</div>
        </div>
        {(['excellent', 'good', 'average', 'poor'] as const).map(l => (
          <div key={l} className="bg-white rounded-xl border p-4 text-center">
            <div className="text-2xl font-bold">{byLabel[l]}</div>
            <div className="text-xs text-gray-500 capitalize">{l === 'excellent' ? 'Отлично' : l === 'good' ? 'Хорошо' : l === 'average' ? 'Средне' : 'Плохо'}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap items-center">
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
          <option value="">Все платформы</option>
          <option value="wb">Wildberries</option>
          <option value="ozon">Ozon</option>
        </select>
        <select value={filterLabel} onChange={e => setFilterLabel(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
          <option value="">Все оценки</option>
          <option value="poor">Плохо</option>
          <option value="average">Средне</option>
          <option value="good">Хорошо</option>
          <option value="excellent">Отлично</option>
        </select>
        <a href="/api/seo/scores/export" target="_blank" rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 border border-gray-200 bg-white text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          CSV
        </a>
        <button onClick={onCompute} disabled={computing} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
          {computing ? 'Вычисляем...' : 'Пересчитать'}
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400">Загрузка...</div>
      ) : scores.length === 0 ? (
        <div className="py-12 text-center text-gray-400">Нет данных. Нажмите «Пересчитать» для анализа листингов.</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Платформа</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Название</th>
                <th className="px-4 py-3 text-center">Балл</th>
                <th className="px-4 py-3 text-left">Прогресс</th>
                <th className="px-4 py-3 text-right">Детали</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {scores.map(s => (
                <>
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100">{s.platform.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.sku}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-48 truncate">{s.title || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <ScoreBadge score={s.score} label={s.score_label} />
                    </td>
                    <td className="px-4 py-3 w-32"><ScoreBar value={s.score} /></td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                        className="text-indigo-500 hover:text-indigo-700 text-xs"
                      >
                        {expanded === s.id ? 'Скрыть' : 'Показать'}
                      </button>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-exp`}>
                      <td colSpan={6} className="px-6 py-4 bg-indigo-50">
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div className="space-y-1.5">
                            {([
                              ['Заголовок', s.score_title, 20],
                              ['Фотографии', s.score_photos, 25],
                              ['Описание', s.score_desc, 20],
                              ['Характеристики', s.score_attrs, 15],
                              ['Цена / Остатки', s.score_rating, 10],
                            ] as [string, number, number][]).map(([label, val, max]) => (
                              <div key={label} className="flex items-center gap-2 text-xs">
                                <span className="w-32 text-gray-600 shrink-0">{label}</span>
                                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${val >= max * 0.8 ? 'bg-green-500' : val >= max * 0.5 ? 'bg-blue-500' : val > 0 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                    style={{ width: `${(val / max) * 100}%` }}
                                  />
                                </div>
                                <span className="w-10 text-right text-gray-500">{val}/{max}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-2">
                            {s.issues.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-red-700 mb-1">Проблемы:</p>
                                <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
                                  {s.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                                </ul>
                              </div>
                            )}
                            {s.suggestions.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-indigo-700 mb-1">Рекомендации:</p>
                                <ul className="list-disc list-inside text-xs text-indigo-600 space-y-0.5">
                                  {s.suggestions.map((sug, i) => <li key={i}>{sug}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Competitors tab ----
function CompetitorsTab() {
  const [competitors, setCompetitors] = useState<TrackedCompetitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({ platform: 'wb', my_sku: '', competitor_sku: '', competitor_name: '' });
  const [addError, setAddError] = useState('');

  const load = useCallback(async () => {
    try { setCompetitors(await getTrackedCompetitors()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onCheck() {
    setChecking(true);
    try { await checkCompetitorPrices(); await load(); } finally { setChecking(false); }
  }

  async function onAdd() {
    setAddError('');
    if (!form.my_sku.trim() || !form.competitor_sku.trim()) { setAddError('Заполните SKU'); return; }
    try {
      await addTrackedCompetitor({ ...form, competitor_name: form.competitor_name || undefined });
      setForm({ platform: 'wb', my_sku: '', competitor_sku: '', competitor_name: '' });
      await load();
    } catch (e: any) { setAddError(e.message); }
  }

  async function onDelete(id: string) {
    await deleteTrackedCompetitor(id);
    setCompetitors(cs => cs.filter(c => c.id !== id));
  }

  if (loading) return <div className="py-10 text-center text-gray-400">Загрузка...</div>;

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Платформа</label>
          <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="border rounded px-2 py-1.5 text-sm">
            <option value="wb">Wildberries</option>
            <option value="ozon">Ozon</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Мой SKU</label>
          <input value={form.my_sku} onChange={e => setForm(f => ({ ...f, my_sku: e.target.value }))} placeholder="Мой артикул" className="border rounded px-2 py-1.5 text-sm w-32" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">SKU конкурента</label>
          <input value={form.competitor_sku} onChange={e => setForm(f => ({ ...f, competitor_sku: e.target.value }))} placeholder="Артикул конкурента" className="border rounded px-2 py-1.5 text-sm w-36" />
        </div>
        <div className="flex-1 min-w-36">
          <label className="text-xs text-gray-500 block mb-1">Название (опц.)</label>
          <input value={form.competitor_name} onChange={e => setForm(f => ({ ...f, competitor_name: e.target.value }))} placeholder="Название конкурента" className="border rounded px-2 py-1.5 text-sm w-full" />
        </div>
        <button onClick={onAdd} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm hover:bg-indigo-700">+ Добавить</button>
        <button onClick={onCheck} disabled={checking} className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-200 disabled:opacity-50">
          {checking ? 'Проверяем...' : 'Проверить цены'}
        </button>
        {addError && <span className="text-red-500 text-xs w-full">{addError}</span>}
      </div>

      {competitors.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Нет отслеживаемых конкурентов. Добавьте первого!</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Платформа</th>
                <th className="px-4 py-3 text-left">Мой SKU</th>
                <th className="px-4 py-3 text-left">Конкурент</th>
                <th className="px-4 py-3 text-right">Цена конк.</th>
                <th className="px-4 py-3 text-right">Моя цена</th>
                <th className="px-4 py-3 text-right">Разница</th>
                <th className="px-4 py-3 text-left">Проверено</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {competitors.map(c => {
                const lp = c.last_price;
                const diff = lp?.diff_pct;
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100">{c.platform.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.my_sku}</td>
                    <td className="px-4 py-3 text-gray-800">
                      <div>{c.competitor_name || c.competitor_sku}</div>
                      {c.competitor_name && <div className="text-xs text-gray-400 font-mono">{c.competitor_sku}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {lp?.price != null ? `${Number(lp.price).toLocaleString('ru')} ₽` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {lp?.my_price != null ? `${Number(lp.my_price).toLocaleString('ru')} ₽` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {diff != null ? (
                        <span className={diff < 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                          {diff > 0 ? '+' : ''}{Number(diff).toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {lp ? new Date(lp.checked_at).toLocaleString('ru') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => onDelete(c.id)} className="text-red-400 hover:text-red-600 text-xs">Удалить</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- AI Generator tab ----
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function onClick() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={onClick}
      className="text-xs text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
      title="Копировать"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  );
}

function GeneratorTab() {
  const [form, setForm] = useState({
    productName: '',
    platform: 'wb',
    category: '',
    currentTitle: '',
    keywords: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SeoListingResult | null>(null);

  async function onGenerate() {
    if (!form.productName.trim()) { setError('Введите название товара'); return; }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const kw = form.keywords.split(',').map(s => s.trim()).filter(Boolean);
      const r = await generateSeoListing({
        productName: form.productName,
        platform: form.platform,
        category: form.category || undefined,
        currentTitle: form.currentTitle || undefined,
        keywords: kw.length ? kw : undefined,
      });
      setResult(r);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  }

  const platformLabel = form.platform === 'wb' ? 'Wildberries' : form.platform === 'ozon' ? 'Ozon' : form.platform === 'ym' ? 'Яндекс Маркет' : 'Мегамаркет';

  return (
    <div className="space-y-5">
      {/* Input form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-800 text-sm">Параметры товара</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600 block mb-1">Название товара *</label>
            <input
              value={form.productName}
              onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
              placeholder="например: Кроссовки мужские летние сетчатые"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Платформа</label>
            <select
              value={form.platform}
              onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="wb">Wildberries</option>
              <option value="ozon">Ozon</option>
              <option value="ym">Яндекс Маркет</option>
              <option value="mm">Мегамаркет</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Категория (опц.)</label>
            <input
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              placeholder="например: Обувь / Кроссовки"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Текущий заголовок (опц.)</label>
            <input
              value={form.currentTitle}
              onChange={e => setForm(f => ({ ...f, currentTitle: e.target.value }))}
              placeholder="Текущее название для улучшения"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Ключевые слова (опц., через запятую)</label>
            <input
              value={form.keywords}
              onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
              placeholder="кроссовки мужские, обувь летняя"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Генерируем...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Сгенерировать карточку для {platformLabel}
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Title */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Заголовок</h3>
              <CopyButton text={result.title} />
            </div>
            <p className="text-base font-semibold text-slate-900 leading-relaxed">{result.title}</p>
            <p className="text-xs text-slate-400 mt-1">{result.title.length} символов</p>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Описание</h3>
              <CopyButton text={result.description} />
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{result.description}</p>
            <p className="text-xs text-slate-400 mt-1">{result.description.length} символов</p>
          </div>

          {/* Bullets + Keywords side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Характеристики / Буллиты</h3>
                <CopyButton text={result.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')} />
              </div>
              <ul className="space-y-2">
                {result.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SEO-ключевые слова</h3>
                <CopyButton text={result.keywords.join(', ')} />
              </div>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map((k, i) => (
                  <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs rounded-full font-medium">{k}</span>
                ))}
              </div>
            </div>
          </div>

          {/* SEO tips */}
          {result.seo_tips.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Советы по оптимизации</h3>
              <ul className="space-y-2">
                {result.seo_tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Copy all */}
          <div className="flex justify-end">
            <CopyButton text={`ЗАГОЛОВОК:\n${result.title}\n\nОПИСАНИЕ:\n${result.description}\n\nХАРАКТЕРИСТИКИ:\n${result.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\nКЛЮЧИ:\n${result.keywords.join(', ')}`} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main ----
const TABS = [
  { id: 'keywords', label: 'Позиции ключей' },
  { id: 'listing', label: 'Листинг-скор' },
  { id: 'competitors', label: 'Конкуренты' },
  { id: 'generator', label: 'AI Генератор' },
];

export default function SeoPage() {
  const [tab, setTab] = useState('keywords');

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">SEO и конкурентная разведка</h1>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'keywords' && <KeywordsTab />}
      {tab === 'listing' && <ListingScoresTab />}
      {tab === 'competitors' && <CompetitorsTab />}
      {tab === 'generator' && <GeneratorTab />}
    </div>
  );
}

'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  ProductReview, ReviewStats, ReviewReplySettings, ReviewsAnalytics,
  getReviews, getReviewStats, syncReviews,
  generateReviewReply, approveReviewReply, updateReview,
  getReviewReplySettings, saveReviewReplySettings,
  bulkReplyReviews, type BulkReplyResult, getReviewsAnalytics,
} from '../../../lib/api';

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="text-yellow-500 text-sm">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

function ReviewCard({ review, onUpdated }: { review: ProductReview; onUpdated: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [editReply, setEditReply] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  async function onGenerate() {
    setError('');
    setGenerating(true);
    try {
      const { reply } = await generateReviewReply(review.id);
      setEditReply(reply);
      setEditing(true);
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  }

  async function onApprove() {
    await approveReviewReply(review.id, editing ? editReply : undefined);
    await updateReview(review.id, { is_answered: true });
    onUpdated();
  }

  const hasReply = review.ai_reply || review.reply_approved;

  return (
    <div className={`bg-white rounded-xl border p-4 space-y-3 ${review.rating && review.rating <= 2 ? 'border-red-200' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StarRating rating={review.rating} />
            <span className="text-xs text-gray-500">{review.author || 'Аноним'}</span>
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{review.platform.toUpperCase()}</span>
            {review.review_date && <span className="text-xs text-gray-400">{new Date(review.review_date).toLocaleDateString('ru')}</span>}
            {review.is_answered && <span className="text-xs text-green-600 font-medium">✓ Отвечено</span>}
          </div>
          {review.text && <p className="text-sm text-gray-700 mt-1">{review.text}</p>}
          {review.pros && <p className="text-xs text-green-600 mt-0.5">+ {review.pros}</p>}
          {review.cons && <p className="text-xs text-red-500 mt-0.5">– {review.cons}</p>}
        </div>
        <div className="text-xs text-gray-400 font-mono shrink-0">{review.sku}</div>
      </div>

      {/* Existing reply */}
      {hasReply && !editing && (
        <div className="bg-indigo-50 rounded-lg p-3">
          <p className="text-xs text-indigo-600 font-medium mb-1">Ответ:</p>
          <p className="text-sm text-indigo-800">{review.ai_reply}</p>
          <button onClick={() => { setEditReply(review.ai_reply ?? ''); setEditing(true); }} className="text-xs text-indigo-400 hover:text-indigo-600 mt-1">Редактировать</button>
        </div>
      )}

      {/* Edit area */}
      {editing && (
        <div className="space-y-2">
          <textarea
            value={editReply}
            onChange={e => setEditReply(e.target.value)}
            rows={3}
            className="w-full border rounded px-3 py-2 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={onApprove} className="bg-green-600 text-white text-xs px-3 py-1.5 rounded hover:bg-green-700">Опубликовать ответ</button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700">Отмена</button>
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}

      {!editing && !review.is_answered && (
        <div className="flex gap-2">
          <button onClick={onGenerate} disabled={generating} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50">
            {generating ? 'Генерируем...' : 'Сгенерировать ответ AI'}
          </button>
          {review.ai_reply && !editing && (
            <button onClick={onApprove} className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded hover:bg-green-200">
              Одобрить и опубликовать
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<ReviewReplySettings>({ tone: 'friendly', brand_name: null, custom_instructions: null, auto_approve: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { getReviewReplySettings().then(setSettings).catch(() => {}); }, []);

  async function onSave() {
    setSaving(true);
    try { await saveReviewReplySettings(settings); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-xl border p-5 space-y-4">
      <h3 className="font-semibold text-gray-800">Настройки AI-ответов</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Тон ответов</label>
          <select value={settings.tone} onChange={e => setSettings(s => ({ ...s, tone: e.target.value }))} className="border rounded px-3 py-2 text-sm w-full">
            <option value="friendly">Дружелюбный</option>
            <option value="formal">Официальный</option>
            <option value="empathetic">Эмпатичный</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Название бренда</label>
          <input value={settings.brand_name ?? ''} onChange={e => setSettings(s => ({ ...s, brand_name: e.target.value || null }))} placeholder="Ваш бренд" className="border rounded px-3 py-2 text-sm w-full" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500 block mb-1">Дополнительные инструкции</label>
          <textarea value={settings.custom_instructions ?? ''} onChange={e => setSettings(s => ({ ...s, custom_instructions: e.target.value || null }))} rows={2} placeholder="Например: всегда предлагать замену, упоминать гарантию 2 года" className="border rounded px-3 py-2 text-sm w-full resize-none" />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" id="auto_approve" checked={settings.auto_approve} onChange={e => setSettings(s => ({ ...s, auto_approve: e.target.checked }))} className="rounded" />
          <label htmlFor="auto_approve" className="text-sm text-gray-700">Автоматически публиковать AI-ответы (без ручного одобрения)</label>
        </div>
      </div>
      <button onClick={onSave} disabled={saving} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
        {saved ? '✓ Сохранено' : saving ? 'Сохраняем...' : 'Сохранить настройки'}
      </button>
    </div>
  );
}

export default function ReviewsPage() {
  const [tab, setTab] = useState('reviews');
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [bulkReplying, setBulkReplying] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkReplyResult | null>(null);
  const [filterAnswered, setFilterAnswered] = useState<string>('all');
  const [filterRating, setFilterRating] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        getReviewStats(),
        getReviews({
          answered: filterAnswered === 'all' ? undefined : filterAnswered === 'answered',
          rating: filterRating ? Number(filterRating) : undefined,
          limit: 100,
        }),
      ]);
      setStats(s);
      setReviews(r);
    } finally { setLoading(false); }
  }, [filterAnswered, filterRating]);

  useEffect(() => { load(); }, [load]);

  async function onSync() {
    setSyncing(true);
    try { await syncReviews(); await load(); } finally { setSyncing(false); }
  }

  async function onBulkReply() {
    setBulkReplying(true);
    setBulkResult(null);
    try {
      const result = await bulkReplyReviews(10);
      setBulkResult(result);
      if (result.processed > 0) await load();
    } catch (e: any) { alert(e.message); }
    finally { setBulkReplying(false); }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Отзывы покупателей</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onBulkReply} disabled={bulkReplying || syncing}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 disabled:opacity-50">
            {bulkReplying
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />AI отвечает...</>
              : <>✨ AI: ответить на все</>}
          </button>
          <button onClick={onSync} disabled={syncing || bulkReplying} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
            {syncing ? 'Синхронизируем...' : 'Синхронизировать'}
          </button>
        </div>
      </div>

      {bulkResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${
          bulkResult.processed > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <span>
            {bulkResult.processed > 0
              ? `✅ AI сгенерировал ответы для ${bulkResult.processed} отзывов — проверьте и одобрите их`
              : (bulkResult.message ?? 'Нет отзывов без ответа')}
          </span>
          <button onClick={() => setBulkResult(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border p-4 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-gray-500">Всего</div>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{stats.unanswered}</div>
            <div className="text-xs text-gray-500">Без ответа</div>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">{stats.avg_rating ? Number(stats.avg_rating).toFixed(1) : '—'}</div>
            <div className="text-xs text-gray-500">Средняя оценка</div>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{stats.negative}</div>
            <div className="text-xs text-gray-500">Негативных</div>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{stats.replied}</div>
            <div className="text-xs text-gray-500">Отвечено</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[['reviews', 'Отзывы'], ['analytics', '📊 Аналитика'], ['settings', 'Настройки AI']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'settings' && <SettingsPanel />}
      {tab === 'analytics' && <ReviewsAnalyticsTab />}

      {tab === 'reviews' && (
        <>
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <select value={filterAnswered} onChange={e => setFilterAnswered(e.target.value)} className="border rounded px-3 py-2 text-sm">
              <option value="all">Все</option>
              <option value="unanswered">Без ответа</option>
              <option value="answered">Отвеченные</option>
            </select>
            <select value={filterRating} onChange={e => setFilterRating(e.target.value)} className="border rounded px-3 py-2 text-sm">
              <option value="">Все оценки</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★</option>)}
            </select>
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-400">Загрузка...</div>
          ) : reviews.length === 0 ? (
            <div className="py-12 text-center text-gray-400">Нет отзывов. Нажмите «Синхронизировать» для загрузки.</div>
          ) : (
            <div className="space-y-3">
              {reviews.map(r => <ReviewCard key={r.id} review={r} onUpdated={load} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Reviews Analytics Tab ─────────────────────────────────────────────────────

function ReviewsAnalyticsTab() {
  const [data, setData]   = useState<ReviewsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getReviewsAnalytics()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>;
  }

  if (!data || data.response_rate.total === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm bg-white rounded-xl border border-dashed border-slate-200">
        Нет отзывов для анализа. Синхронизируйте отзывы.
      </div>
    );
  }

  const totalReviews = data.distribution.reduce((s, d) => s + d.count, 0);
  const maxDist      = Math.max(...data.distribution.map(d => d.count), 1);

  // SVG weekly trend
  const W = 500, H = 100, PAD = { t: 8, b: 20, l: 8, r: 8 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const trend  = data.weekly_trend;
  const maxTotal = Math.max(...trend.map(w => w.total), 1);

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Всего отзывов',     value: data.response_rate.total },
          { label: 'Ответов отправлено', value: `${data.response_rate.answered} (${data.response_rate.pct}%)`, color: data.response_rate.pct >= 70 ? 'text-green-600' : 'text-amber-600' },
          { label: 'Опубликовано',       value: data.response_rate.published },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${('color' in k ? k.color : '') || 'text-slate-900'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Rating distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Распределение оценок</p>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map(rating => {
              const item = data.distribution.find(d => d.rating === rating);
              const count = item?.count ?? 0;
              const pct   = totalReviews > 0 ? Math.round(count / totalReviews * 100) : 0;
              const barW  = maxDist > 0 ? Math.round(count / maxDist * 100) : 0;
              const color = rating >= 4 ? 'bg-green-400' : rating === 3 ? 'bg-amber-400' : 'bg-red-400';
              return (
                <div key={rating} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-4 text-right">{rating}★</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${barW}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 w-16 text-right">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top negative keywords */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Топ слов в негативных отзывах (1-2★)</p>
          {data.top_negative_keywords.length === 0 ? (
            <p className="text-sm text-slate-400">Негативных отзывов нет — отлично!</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.top_negative_keywords.map(kw => {
                const maxCount = data.top_negative_keywords[0]?.count ?? 1;
                const opacity  = 0.4 + 0.6 * (kw.count / maxCount);
                return (
                  <span
                    key={kw.word}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700"
                    style={{ opacity }}
                    title={`${kw.count} упоминаний`}
                  >
                    {kw.word} <span className="opacity-70">×{kw.count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Weekly trend chart */}
      {trend.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Еженедельная динамика отзывов</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
            {[0, 0.5, 1].map(f => (
              <line key={f} x1={PAD.l} x2={W - PAD.r}
                y1={PAD.t + chartH * (1 - f)} y2={PAD.t + chartH * (1 - f)}
                stroke="#f1f5f9" strokeWidth="1" />
            ))}
            {trend.map((w, i) => {
              const x = PAD.l + (i / Math.max(trend.length - 1, 1)) * chartW;
              const h = (w.total / maxTotal) * chartH;
              const barW2 = Math.max(4, chartW / trend.length - 4);
              const color = w.avg_rating >= 4 ? '#4ade80' : w.avg_rating >= 3 ? '#fbbf24' : '#f87171';
              return (
                <rect
                  key={i}
                  x={x - barW2 / 2}
                  y={PAD.t + chartH - h}
                  width={barW2}
                  height={h}
                  rx="2"
                  fill={color}
                  opacity="0.85"
                />
              );
            })}
            {/* x-axis labels: first, mid, last */}
            {[0, Math.floor(trend.length / 2), trend.length - 1]
              .filter((v, i, a) => a.indexOf(v) === i && v < trend.length)
              .map(i => {
                const x = PAD.l + (i / Math.max(trend.length - 1, 1)) * chartW;
                return (
                  <text key={i} x={x} y={H - 3} textAnchor="middle" fontSize="8" fill="#94a3b8">
                    {new Date(trend[i].week).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                  </text>
                );
              })}
          </svg>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block" /> ≥4★</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> 3★</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> ≤2★</span>
          </div>
        </div>
      )}
    </div>
  );
}

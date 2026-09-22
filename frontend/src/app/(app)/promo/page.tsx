'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PromoEvent, PromoCompare, PromoAiAdvice,
  getPromoEvents, createPromoEvent, updatePromoEvent, deletePromoEvent, getPromoCompare,
  getPromoAiAdvice,
} from '@/lib/api';

const PROMO_TYPE_LABELS: Record<string, string> = {
  sale:       'Распродажа',
  flash:      'Флеш-акция',
  wb_promo:   'WB акция',
  ozon_promo: 'Ozon акция',
  custom:     'Своя акция',
};

const PROMO_TYPE_COLORS: Record<string, string> = {
  sale:       'bg-red-100 text-red-700',
  flash:      'bg-orange-100 text-orange-700',
  wb_promo:   'bg-violet-100 text-violet-700',
  ozon_promo: 'bg-blue-100 text-blue-700',
  custom:     'bg-slate-100 text-slate-600',
};

function fmtMoney(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function LiftBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-400 text-xs">—</span>;
  const pos = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${pos ? 'text-green-600' : 'text-red-600'}`}>
      {pos ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

// ── Sparkline chart for before/during comparison ──────────────────────────────
function CompareChart({ compare }: { compare: PromoCompare }) {
  const daily = compare.daily;
  if (!daily.length) return null;

  const W = 600, H = 120, PAD = { t: 8, b: 20, l: 48, r: 8 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const maxRev = Math.max(...daily.map(d => d.revenue), 1);
  const xStep  = chartW / Math.max(1, daily.length - 1);

  function cx(i: number) { return PAD.l + i * xStep; }
  function cy(v: number) { return PAD.t + chartH * (1 - v / maxRev); }

  const pts = daily.map((d, i) => `${cx(i)},${cy(d.revenue)}`).join(' ');

  // find promo start index
  const promoIdx = daily.findIndex(d => d.date >= compare.promo_start);

  // x-axis labels: first, promo start, last
  const labelIdxs = [0, ...(promoIdx > 0 ? [promoIdx] : []), daily.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
      {/* grid */}
      {[0, 0.5, 1].map(frac => (
        <line key={frac}
          x1={PAD.l} x2={W - PAD.r}
          y1={PAD.t + chartH * (1 - frac)} y2={PAD.t + chartH * (1 - frac)}
          stroke="#e2e8f0" strokeWidth="1"
        />
      ))}

      {/* before / during shading */}
      {promoIdx > 0 && (
        <rect
          x={cx(promoIdx)} y={PAD.t}
          width={cx(daily.length - 1) - cx(promoIdx)}
          height={chartH}
          fill="#8b5cf620"
        />
      )}

      {/* promo start line */}
      {promoIdx > 0 && (
        <line
          x1={cx(promoIdx)} x2={cx(promoIdx)}
          y1={PAD.t} y2={H - PAD.b}
          stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="4 2"
        />
      )}

      {/* revenue line */}
      <polyline points={pts} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" />

      {/* dots */}
      {daily.map((d, i) => (
        <circle key={i} cx={cx(i)} cy={cy(d.revenue)} r="2.5" fill="#8b5cf6" />
      ))}

      {/* x labels */}
      {labelIdxs.map(i => (
        <text key={i} x={cx(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {fmtDate(daily[i].date)}
        </text>
      ))}

      {/* y label */}
      <text x={PAD.l - 4} y={PAD.t + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
        {Math.round(maxRev / 1000)}k
      </text>
    </svg>
  );
}

// ── Compare drawer ────────────────────────────────────────────────────────────
function CompareDrawer({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [data, setData] = useState<PromoCompare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPromoCompare(eventId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Анализ акции</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

          {data && (
            <>
              <p className="text-sm text-slate-500">
                Сравниваем {data.window_days} дней до акции ({fmtDate(data.before.from)} — {fmtDate(data.before.to)}) vs период акции ({fmtDate(data.during.from)} — {fmtDate(data.during.to)})
              </p>

              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Выручка до', value: fmtMoney(data.before.revenue) },
                  { label: 'Выручка во время', value: fmtMoney(data.during.revenue), lift: data.revenue_lift_pct },
                  { label: 'Заказов до', value: data.before.quantity.toLocaleString('ru-RU') },
                  { label: 'Заказов во время', value: data.during.quantity.toLocaleString('ru-RU'), lift: data.quantity_lift_pct },
                ].map(k => (
                  <div key={k.label} className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                    <p className="text-xl font-bold text-slate-900">{k.value}</p>
                    {'lift' in k && <div className="mt-1"><LiftBadge pct={k.lift ?? null} /></div>}
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-2">Выручка по дням</p>
                <CompareChart compare={data} />
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-slate-300 inline-block" /> До акции</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-100 rounded-sm inline-block border border-purple-200" /> Период акции</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add/Edit modal ────────────────────────────────────────────────────────────
const EMPTY: Omit<PromoEvent, 'id' | 'created_at'> = {
  name:         '',
  platform:     null,
  skus:         [],
  starts_at:    new Date().toISOString().slice(0, 10),
  ends_at:      new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
  discount_pct: null,
  promo_type:   'custom',
  notes:        null,
};

function EventModal({
  initial, onSave, onClose,
}: {
  initial: Omit<PromoEvent, 'id' | 'created_at'> | null;
  onSave: (data: Omit<PromoEvent, 'id' | 'created_at'>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial ?? EMPTY);
  const [skusText, setSkusText] = useState((initial?.skus ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Введите название'); return; }
    setSaving(true);
    setError('');
    try {
      const skus = skusText.split(',').map(s => s.trim()).filter(Boolean);
      await onSave({ ...form, skus });
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{initial ? 'Редактировать акцию' : 'Новая акция'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</div>}

        <div>
          <label className="block text-xs text-slate-500 mb-1">Название *</label>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="11.11 Распродажа"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Тип</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.promo_type} onChange={e => set('promo_type', e.target.value)}
            >
              {Object.entries(PROMO_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Площадка</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.platform ?? ''} onChange={e => set('platform', e.target.value || null)}
            >
              <option value="">Все</option>
              <option value="wb">WildBerries</option>
              <option value="ozon">Ozon</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Начало *</label>
            <input
              type="date"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.starts_at} onChange={e => set('starts_at', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Конец *</label>
            <input
              type="date"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.ends_at} onChange={e => set('ends_at', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Скидка, %</label>
          <input
            type="number" min="0" max="100" step="0.5"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
            value={form.discount_pct ?? ''} onChange={e => set('discount_pct', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Не указано"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">SKU (через запятую, или оставьте пустым для всех)</label>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none font-mono"
            value={skusText} onChange={e => setSkusText(e.target.value)}
            placeholder="123456, 789012"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Заметки</label>
          <textarea
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
            value={form.notes ?? ''} onChange={e => set('notes', e.target.value || null)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Отмена
          </button>
          <button
            type="submit" disabled={saving}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── AI Advice Modal ───────────────────────────────────────────────────────────
function PromoAiAdviceModal({ eventId, eventName, onClose }: { eventId: number; eventName: string; onClose: () => void }) {
  const [advice, setAdvice] = useState<PromoAiAdvice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPromoAiAdvice(eventId)
      .then(setAdvice)
      .catch(e => setError(e.message ?? 'Ошибка AI-анализа'))
      .finally(() => setLoading(false));
  }, [eventId]);

  const verdictConfig: Record<string, { bg: string; border: string; icon: string; text: string; label: string }> = {
    recommend:    { bg: 'bg-green-50',  border: 'border-green-300',  icon: '✅', text: 'text-green-800',  label: 'Рекомендуем' },
    caution:      { bg: 'bg-amber-50',  border: 'border-amber-300',  icon: '⚠️', text: 'text-amber-800',  label: 'Осторожно' },
    not_recommend:{ bg: 'bg-red-50',    border: 'border-red-300',    icon: '❌', text: 'text-red-800',    label: 'Не рекомендуем' },
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">AI Оценка промоакции</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{eventName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Анализируем данные...</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

        {advice && !loading && (() => {
          const vc = verdictConfig[advice.verdict] ?? verdictConfig.caution;
          return (
            <div className="space-y-4">
              {/* Verdict banner */}
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${vc.bg} ${vc.border}`}>
                <span className="text-2xl">{vc.icon}</span>
                <div>
                  <p className={`font-bold text-base ${vc.text}`}>{advice.verdict_label || vc.label}</p>
                  <p className="text-sm text-slate-700 mt-0.5 leading-relaxed">{advice.reasoning}</p>
                </div>
              </div>

              {/* Metrics */}
              {(advice.expected_lift_pct != null || advice.suggested_discount_pct != null) && (
                <div className="grid grid-cols-2 gap-3">
                  {advice.expected_lift_pct != null && (
                    <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                      <p className="text-xs text-slate-500 mb-1">Ожидаемый рост продаж</p>
                      <p className={`text-xl font-bold ${advice.expected_lift_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {advice.expected_lift_pct >= 0 ? '+' : ''}{advice.expected_lift_pct}%
                      </p>
                    </div>
                  )}
                  {advice.suggested_discount_pct != null && (
                    <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                      <p className="text-xs text-slate-500 mb-1">Рекомендуемая скидка</p>
                      <p className="text-xl font-bold text-purple-700">{advice.suggested_discount_pct}%</p>
                    </div>
                  )}
                </div>
              )}

              {/* Risks */}
              {advice.risks.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-700 mb-2">Риски</p>
                  <ul className="space-y-1.5">
                    {advice.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                        <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              {advice.actions.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-purple-700 mb-2">Рекомендуемые действия</p>
                  <ul className="space-y-1.5">
                    {advice.actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-purple-900">
                        <svg className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-slate-400 text-right">
                {new Date(advice.generated_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PromoPage() {
  const [events, setEvents] = useState<PromoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const [showModal, setShowModal]     = useState(false);
  const [editEvent, setEditEvent]     = useState<PromoEvent | null>(null);
  const [compareId, setCompareId]     = useState<string | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [aiAdviceId, setAiAdviceId]   = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const evs = await getPromoEvents();
      setEvents(evs);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(data: Omit<PromoEvent, 'id' | 'created_at'>) {
    if (editEvent) {
      const updated = await updatePromoEvent(editEvent.id, data);
      setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
    } else {
      const created = await createPromoEvent(data);
      setEvents(prev => [created, ...prev]);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await deletePromoEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
      setDeleteId(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  const now = new Date().toISOString().slice(0, 10);
  const active  = events.filter(e => e.starts_at <= now && e.ends_at >= now);
  const planned = events.filter(e => e.starts_at > now);
  const past    = events.filter(e => e.ends_at < now);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Акции и промо</h1>
          <p className="text-slate-500 text-sm mt-0.5">Отслеживайте влияние акций на продажи</p>
        </div>
        <button
          onClick={() => { setEditEvent(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Новая акция
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Активных',    value: active.length,  color: 'text-green-600' },
          { label: 'Запланирован.', value: planned.length, color: 'text-amber-600' },
          { label: 'Завершённых',  value: past.length,    color: 'text-slate-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Events list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
          <p className="text-slate-400 text-sm">Акций пока нет. Нажмите «Новая акция».</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => {
            const isActive  = ev.starts_at <= now && ev.ends_at >= now;
            const isPlanned = ev.starts_at > now;

            return (
              <div key={ev.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PROMO_TYPE_COLORS[ev.promo_type]}`}>
                      {PROMO_TYPE_LABELS[ev.promo_type]}
                    </span>
                    {ev.platform && (
                      <span className="text-xs text-slate-400 font-medium">{ev.platform.toUpperCase()}</span>
                    )}
                    {isActive && (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                        Активна
                      </span>
                    )}
                    {isPlanned && (
                      <span className="text-xs text-amber-600 font-medium">Запланирована</span>
                    )}
                    {ev.discount_pct != null && (
                      <span className="text-xs text-slate-400">−{ev.discount_pct}%</span>
                    )}
                  </div>
                  <p className="font-semibold text-slate-900">{ev.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(ev.starts_at)} — {fmtDate(ev.ends_at)}
                    {ev.skus.length > 0 && ` · ${ev.skus.length} SKU`}
                  </p>
                  {ev.notes && <p className="text-xs text-slate-500 mt-1 italic">{ev.notes}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setAiAdviceId(Number(ev.id))}
                    className="px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 border border-purple-200 rounded-lg transition-colors flex items-center gap-1"
                    title="AI-оценка промоакции"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI
                  </button>
                  {!isPlanned && (
                    <button
                      onClick={() => setCompareId(ev.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                    >
                      Анализ
                    </button>
                  )}
                  <button
                    onClick={() => { setEditEvent(ev); setShowModal(true); }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Редактировать"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {deleteId === ev.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(ev.id)}
                        disabled={deleting}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg disabled:opacity-50"
                      >
                        {deleting ? '...' : 'Удалить'}
                      </button>
                      <button onClick={() => setDeleteId(null)} className="px-2 py-1 text-xs bg-slate-200 rounded-lg">
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteId(ev.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      title="Удалить"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <EventModal
          initial={editEvent ? {
            name: editEvent.name, platform: editEvent.platform,
            skus: editEvent.skus, starts_at: editEvent.starts_at, ends_at: editEvent.ends_at,
            discount_pct: editEvent.discount_pct, promo_type: editEvent.promo_type, notes: editEvent.notes,
          } : null}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditEvent(null); }}
        />
      )}

      {compareId && (
        <CompareDrawer eventId={compareId} onClose={() => setCompareId(null)} />
      )}

      {aiAdviceId != null && (
        <PromoAiAdviceModal
          eventId={aiAdviceId}
          eventName={events.find(e => Number(e.id) === aiAdviceId)?.name ?? ''}
          onClose={() => setAiAdviceId(null)}
        />
      )}
    </div>
  );
}

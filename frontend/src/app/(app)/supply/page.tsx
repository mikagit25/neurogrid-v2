'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RestockForecast, PurchaseOrder, Supplier, DeadStockItem, DeadStockResult,
  PurchaseOrderItem, PurchaseOrderResult, SupplyAiPlan, SupplyAiPlanItem,
  getRestockForecasts, computeRestockForecasts,
  getPurchaseOrders, createPurchaseOrder, updatePurchaseOrder,
  getSuppliers, createSupplier, updateSupplier, deleteSupplier,
  getDeadStock, getPurchaseOrder, getPurchaseOrderCsvUrl, getSupplyAiPlan,
} from '../../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  critical: 'bg-red-100 text-red-700',
  out_of_stock: 'bg-red-900 text-red-100',
};

const STATUS_LABELS: Record<string, string> = {
  ok: 'ОК',
  warning: 'Предупреждение',
  critical: 'Критично',
  out_of_stock: 'Нет в наличии',
};

const PO_STATUS_COLORS: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-700',
  ordered: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
};

const PO_STATUS_LABELS: Record<string, string> = {
  planned: 'Запланирован',
  ordered: 'Заказан',
  in_transit: 'В пути',
  received: 'Получен',
  cancelled: 'Отменён',
};

const URGENCY_CONFIG = {
  critical: { label: 'Критично', cls: 'bg-red-100 text-red-700' },
  high:     { label: 'Высокий',  cls: 'bg-orange-100 text-orange-700' },
  medium:   { label: 'Средний',  cls: 'bg-yellow-100 text-yellow-700' },
};

function SupplyAiPlanPanel({ plan, onClose }: { plan: SupplyAiPlan; onClose: () => void }) {
  const budgetFmt = plan.total_budget_estimate != null
    ? plan.total_budget_estimate.toLocaleString('ru-RU') + ' ₽'
    : 'не указан';

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">AI план закупок</p>
            <p className="text-xs text-slate-500">Анализ {plan.forecast_count} SKU с нехваткой запасов</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed">{plan.summary}</p>

      {plan.total_budget_estimate != null && (
        <div className="bg-white rounded-xl border border-indigo-100 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-600">Оценка бюджета закупки</span>
          <span className="font-bold text-indigo-700 text-lg">{budgetFmt}</span>
        </div>
      )}

      {plan.priority_items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Приоритеты закупки</p>
          {plan.priority_items.map((item: SupplyAiPlanItem, i: number) => {
            const urg = URGENCY_CONFIG[item.urgency] ?? URGENCY_CONFIG.medium;
            return (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-3 flex items-start gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${urg.cls}`}>{urg.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-500">{item.platform.toUpperCase()} · {item.sku}</p>
                  <p className="text-sm text-slate-700 mt-0.5">{item.reasoning}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-900">{item.recommended_qty} шт.</p>
                  {item.estimated_cost != null && (
                    <p className="text-xs text-slate-500">{item.estimated_cost.toLocaleString('ru-RU')} ₽</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <p className="text-xs font-semibold text-amber-700 mb-1">Сроки</p>
        <p className="text-sm text-amber-800">{plan.timing_advice}</p>
      </div>

      {plan.risks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Риски</p>
          <ul className="space-y-1">
            {plan.risks.map((r, i) => <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-red-400 flex-shrink-0">•</span>{r}</li>)}
          </ul>
        </div>
      )}

      {plan.actions.length > 0 && (
        <div className="bg-indigo-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-indigo-700 mb-1.5">Действия</p>
          <ol className="space-y-1">
            {plan.actions.map((a, i) => <li key={i} className="text-sm text-indigo-800 flex gap-2"><span className="flex-shrink-0 font-semibold">{i + 1}.</span>{a}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

function ForecastsTab() {
  const [forecasts, setForecasts] = useState<RestockForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [aiPlan, setAiPlan] = useState<SupplyAiPlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setForecasts(await getRestockForecasts({ status: filterStatus || undefined, platform: filterPlatform || undefined })); }
    finally { setLoading(false); }
  }, [filterStatus, filterPlatform]);

  useEffect(() => { load(); }, [load]);

  async function onCompute() {
    setComputing(true);
    try { await computeRestockForecasts(); await load(); } finally { setComputing(false); }
  }

  async function onAiPlan() {
    setAiLoading(true);
    setAiPlan(null);
    try { setAiPlan(await getSupplyAiPlan()); } catch { /* ignore */ } finally { setAiLoading(false); }
  }

  const critical = forecasts.filter(f => f.status === 'critical' || f.status === 'out_of_stock').length;
  const warning = forecasts.filter(f => f.status === 'warning').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-2xl font-bold">{forecasts.length}</div>
          <div className="text-xs text-gray-500">Всего SKU</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{critical}</div>
          <div className="text-xs text-gray-500">Критично / нет в наличии</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{warning}</div>
          <div className="text-xs text-gray-500">Нужен дозаказ скоро</div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{forecasts.length - critical - warning}</div>
          <div className="text-xs text-gray-500">В норме</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="">Все статусы</option>
          <option value="out_of_stock">Нет в наличии</option>
          <option value="critical">Критично</option>
          <option value="warning">Предупреждение</option>
          <option value="ok">ОК</option>
        </select>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="">Все платформы</option>
          <option value="wb">Wildberries</option>
          <option value="ozon">Ozon</option>
        </select>
        <button onClick={onCompute} disabled={computing} className="ml-auto bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
          {computing ? 'Вычисляем...' : 'Пересчитать прогноз'}
        </button>
        <button
          onClick={onAiPlan}
          disabled={aiLoading}
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-medium rounded transition-colors"
        >
          {aiLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          AI план закупок
        </button>
      </div>

      {aiPlan && <SupplyAiPlanPanel plan={aiPlan} onClose={() => setAiPlan(null)} />}

      {loading ? (
        <div className="py-10 text-center text-gray-400">Загрузка...</div>
      ) : forecasts.length === 0 ? (
        <div className="py-12 text-center text-gray-400">Нет данных. Нажмите «Пересчитать прогноз».</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Платформа</th>
                <th className="px-4 py-3 text-left">SKU / Название</th>
                <th className="px-4 py-3 text-center">Остаток</th>
                <th className="px-4 py-3 text-center">Продаж/день</th>
                <th className="px-4 py-3 text-center">Дней осталось</th>
                <th className="px-4 py-3 text-center">Статус</th>
                <th className="px-4 py-3 text-right">Рекомендуем</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {forecasts.map(f => (
                <tr key={f.id} className={`hover:bg-gray-50 ${f.status === 'out_of_stock' ? 'bg-red-50' : f.status === 'critical' ? 'bg-orange-50' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100">{f.platform.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-gray-600">{f.sku}</div>
                    {f.title && <div className="text-gray-800 text-xs truncate max-w-48">{f.title}</div>}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold">{f.current_stock}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{Number(f.avg_daily_sales).toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">
                    {f.days_left != null ? (
                      <span className={f.days_left <= 3 ? 'text-red-600 font-bold' : f.days_left <= 14 ? 'text-yellow-600 font-semibold' : 'text-gray-700'}>
                        {f.days_left} дн.
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[f.status]}`}>
                      {STATUS_LABELS[f.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {f.reorder_qty ? `Заказать ${f.reorder_qty} шт.` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PurchaseOrdersTab() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ platform: 'wb', sku: '', title: '', qty: '', unit_cost: '', supplier: '', notes: '', expected_at: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrders(await getPurchaseOrders()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onSubmit() {
    setError('');
    if (!form.sku || !form.qty) { setError('Укажите SKU и количество'); return; }
    setSaving(true);
    try {
      await createPurchaseOrder({
        platform: form.platform, sku: form.sku, title: form.title || undefined,
        qty: Number(form.qty), unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined,
        supplier: form.supplier || undefined, notes: form.notes || undefined,
        expected_at: form.expected_at || undefined,
      });
      setShowForm(false);
      setForm({ platform: 'wb', sku: '', title: '', qty: '', unit_cost: '', supplier: '', notes: '', expected_at: '' });
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function onStatusChange(id: string, status: string) {
    await updatePurchaseOrder(id, { status } as any);
    await load();
  }

  const NEXT_STATUS: Record<string, string> = { planned: 'ordered', ordered: 'in_transit', in_transit: 'received' };
  const NEXT_LABEL: Record<string, string> = { planned: 'Подтвердить заказ', ordered: 'Отправлен в путь', in_transit: 'Получен' };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(s => !s)} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">
          + Новый заказ поставки
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">Добавить заказ поставки</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Платформа</label>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="border rounded px-3 py-2 text-sm w-full">
                <option value="wb">Wildberries</option>
                <option value="ozon">Ozon</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">SKU</label>
              <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Артикул" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Название товара</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Название (опционально)" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Количество</label>
              <input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="100" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Себестоимость за ед. (₽)</label>
              <input type="number" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} placeholder="250" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Поставщик</label>
              <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Название поставщика" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Ожидаемая дата получения</label>
              <input type="date" value={form.expected_at} onChange={e => setForm(f => ({ ...f, expected_at: e.target.value }))} className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Заметки</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="border rounded px-3 py-2 text-sm w-full resize-none" />
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onSubmit} disabled={saving} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Сохраняем...' : 'Создать'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-gray-500 text-sm px-4 py-2">Отмена</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-gray-400">Загрузка...</div>
      ) : orders.length === 0 ? (
        <div className="py-12 text-center text-gray-400">Нет заказов поставки.</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Поставщик</th>
                <th className="px-4 py-3 text-right">Кол-во</th>
                <th className="px-4 py-3 text-right">Сумма</th>
                <th className="px-4 py-3 text-left">Ожидается</th>
                <th className="px-4 py-3 text-center">Статус</th>
                <th className="px-4 py-3 text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-gray-600">{o.sku}</div>
                    {o.title && <div className="text-xs text-gray-500 truncate max-w-40">{o.title}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{o.supplier || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{o.qty}</td>
                  <td className="px-4 py-3 text-right">
                    {o.total_cost != null ? `${Number(o.total_cost).toLocaleString('ru')} ₽` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {o.expected_at ? new Date(o.expected_at).toLocaleDateString('ru') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PO_STATUS_COLORS[o.status]}`}>
                      {PO_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {NEXT_STATUS[o.status] && (
                      <button
                        onClick={() => onStatusChange(o.id, NEXT_STATUS[o.status])}
                        className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100"
                      >
                        {NEXT_LABEL[o.status]}
                      </button>
                    )}
                    {o.status !== 'received' && o.status !== 'cancelled' && (
                      <button
                        onClick={() => onStatusChange(o.id, 'cancelled')}
                        className="ml-1 text-xs text-red-400 hover:text-red-600"
                      >Отмена</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EMPTY_SUPPLIER = { name: '', contact_name: '', email: '', phone: '', lead_time_days: 14, min_order_qty: '', payment_terms: '', notes: '' };

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<typeof EMPTY_SUPPLIER>({ ...EMPTY_SUPPLIER });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSuppliers(await getSuppliers()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_SUPPLIER });
    setError('');
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name, contact_name: s.contact_name ?? '', email: s.email ?? '',
      phone: s.phone ?? '', lead_time_days: s.lead_time_days,
      min_order_qty: s.min_order_qty != null ? String(s.min_order_qty) : '',
      payment_terms: s.payment_terms ?? '', notes: s.notes ?? '',
    });
    setError('');
    setShowForm(true);
  }

  async function onSave() {
    if (!form.name.trim()) { setError('Укажите название поставщика'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(), contact_name: form.contact_name || undefined,
        email: form.email || undefined, phone: form.phone || undefined,
        lead_time_days: Number(form.lead_time_days),
        min_order_qty: form.min_order_qty ? Number(form.min_order_qty) : undefined,
        payment_terms: form.payment_terms || undefined,
        notes: form.notes || undefined,
      };
      if (editing) { await updateSupplier(editing.id, payload); }
      else { await createSupplier(payload as any); }
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function onDelete(id: string) {
    await deleteSupplier(id);
    setConfirmDelete(null);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openAdd} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">
          + Добавить поставщика
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">{editing ? 'Редактировать поставщика' : 'Новый поставщик'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Название *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ООО Поставщик" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Контактное лицо</label>
              <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                placeholder="Иван Иванов" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="supplier@example.com" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Телефон</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+7 999 000 00 00" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Срок поставки (дней)</label>
              <input type="number" value={form.lead_time_days} onChange={e => setForm(f => ({ ...f, lead_time_days: Number(e.target.value) }))}
                placeholder="14" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Мин. заказ (шт.)</label>
              <input type="number" value={form.min_order_qty} onChange={e => setForm(f => ({ ...f, min_order_qty: e.target.value }))}
                placeholder="100" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Условия оплаты</label>
              <input value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                placeholder="50% предоплата" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Заметки</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className="border rounded px-3 py-2 text-sm w-full resize-none" />
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onSave} disabled={saving}
              className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-gray-500 text-sm px-4 py-2">Отмена</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">Удалить поставщика? Это действие нельзя отменить.</p>
          <div className="flex gap-2">
            <button onClick={() => onDelete(confirmDelete)}
              className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700">Удалить</button>
            <button onClick={() => setConfirmDelete(null)}
              className="text-gray-500 text-sm px-3 py-1.5">Отмена</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-gray-400">Загрузка...</div>
      ) : suppliers.length === 0 ? (
        <div className="py-12 text-center text-gray-400 bg-white rounded-xl border">
          <p className="font-medium text-gray-500 mb-1">Нет поставщиков</p>
          <p className="text-sm">Добавьте поставщиков, чтобы связывать их с заказами поставки.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Поставщик</th>
                <th className="px-4 py-3 text-left">Контакт</th>
                <th className="px-4 py-3 text-center">Срок, дн.</th>
                <th className="px-4 py-3 text-center">Мин. заказ</th>
                <th className="px-4 py-3 text-left">Условия оплаты</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{s.name}</p>
                    {s.notes && <p className="text-xs text-gray-400 truncate max-w-48">{s.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {s.contact_name && <p className="text-gray-700">{s.contact_name}</p>}
                    {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                    {s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{s.lead_time_days}</td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {s.min_order_qty != null ? `${s.min_order_qty} шт.` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.payment_terms || '—'}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openEdit(s)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Изменить</button>
                    <button onClick={() => setConfirmDelete(s.id)}
                      className="text-xs text-red-400 hover:text-red-600">Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const PLATFORM_LABELS: Record<string, string> = { wb: 'WB', ozon: 'Ozon', ym: 'YM', mm: 'MM' };

function DeadStockTab() {
  const [data, setData] = useState<DeadStockResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState('');

  useEffect(() => {
    getDeadStock().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-10 text-center text-gray-400">Загрузка...</div>;
  if (!data || data.items.length === 0) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border">
        <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-medium text-gray-700">Нет залежавшихся товаров</p>
        <p className="text-sm text-gray-400 mt-1">Все товары с остатком имели продажи за последние 30 дней</p>
      </div>
    );
  }

  const items = filterPlatform ? data.items.filter(i => i.platform === filterPlatform) : data.items;
  const platforms = data.items.map(i => i.platform).filter((p, idx, arr) => arr.indexOf(p) === idx);

  const deadCount = data.items.filter(i => !i.days_since_last_sale || i.days_since_last_sale > 60).length;
  const slowCount = data.items.length - deadCount;
  const totalCapital = data.total_capital;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xl font-bold text-red-600">{deadCount}</p>
          <p className="text-xs text-gray-500">Мёртвый сток (60+ дн.)</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xl font-bold text-amber-600">{slowCount}</p>
          <p className="text-xs text-gray-500">Медленные продажи</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-xl font-bold text-slate-700">{Math.round(totalCapital / 1000)}к ₽</p>
          <p className="text-xs text-gray-500">Заморожено капитала</p>
        </div>
      </div>

      {platforms.length > 1 && (
        <div className="flex gap-2">
          <button onClick={() => setFilterPlatform('')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!filterPlatform ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Все
          </button>
          {platforms.map(p => (
            <button key={p} onClick={() => setFilterPlatform(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterPlatform === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {PLATFORM_LABELS[p] ?? p}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Товар</th>
              <th className="px-4 py-3 text-center">Остаток</th>
              <th className="px-4 py-3 text-center">Продаж за 30д</th>
              <th className="px-4 py-3 text-center">Дней без продаж</th>
              <th className="px-4 py-3 text-right">Заморожен капитал</th>
              <th className="px-4 py-3 text-left">Рекомендация</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, i) => {
              const isDead = !item.days_since_last_sale || item.days_since_last_sale > 60;
              return (
                <tr key={i} className={`hover:bg-gray-50 ${isDead ? 'bg-red-50/40' : 'bg-amber-50/30'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isDead ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {PLATFORM_LABELS[item.platform] ?? item.platform}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800 truncate max-w-[200px]">{item.title}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{item.stock} шт.</td>
                  <td className="px-4 py-3 text-center text-gray-600">{item.units_sold}</td>
                  <td className="px-4 py-3 text-center">
                    {item.days_since_last_sale != null
                      ? <span className={item.days_since_last_sale > 60 ? 'text-red-600 font-semibold' : 'text-amber-600'}>
                          {item.days_since_last_sale} дн.
                        </span>
                      : <span className="text-red-600 font-semibold">Никогда</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.capital_tied_up > 0
                      ? <span className="font-semibold text-gray-800">{Math.round(item.capital_tied_up).toLocaleString('ru-RU')} ₽</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-600 leading-relaxed">{item.recommendation}</span>
                      <Link href={`/price-rules`}
                        className="flex-shrink-0 text-xs text-indigo-600 hover:underline whitespace-nowrap">
                        Задать цену →
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Smart Reorder tab ─────────────────────────────────────────────────────────
function SmartReorderTab() {
  const [data, setData]         = useState<PurchaseOrderResult | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [reorderDays, setReorderDays] = useState(14);
  const [targetDays, setTargetDays]   = useState(45);
  const [filterUrgent, setFilterUrgent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await getPurchaseOrder({ reorder_days: reorderDays, target_days: targetDays });
      setData(d);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [reorderDays, targetDays]);

  useEffect(() => { load(); }, [load]);

  const items = data ? (filterUrgent ? data.items.filter(i => i.urgent) : data.items) : [];
  const totalCostFiltered = items.reduce((s, i) => s + (i.total_cost ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Порог срочности (дней)</label>
          <input
            type="number" min="3" max="60" value={reorderDays}
            onChange={e => setReorderDays(parseInt(e.target.value) || 14)}
            className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Заказывать на (дней)</label>
          <input
            type="number" min="7" max="180" value={targetDays}
            onChange={e => setTargetDays(parseInt(e.target.value) || 45)}
            className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <button
          onClick={() => setFilterUrgent(f => !f)}
          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${filterUrgent ? 'bg-red-50 border-red-300 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          {filterUrgent ? '🔴 Только срочные' : 'Все товары'}
        </button>
        <a
          href={getPurchaseOrderCsvUrl({ reorder_days: reorderDays, target_days: targetDays })}
          download="purchase_order.csv"
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Экспорт CSV
        </a>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* KPI */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Срочных заказов', value: data.urgent_count, color: data.urgent_count > 0 ? 'text-red-600' : 'text-green-600' },
            { label: 'Всего позиций',   value: data.items.length, color: 'text-slate-900' },
            { label: 'Сумма заказа',    value: (filterUrgent ? totalCostFiltered : data.total_cost) > 0
              ? `${Math.round(filterUrgent ? totalCostFiltered : data.total_cost).toLocaleString('ru-RU')} ₽`
              : '—', color: 'text-slate-900' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 mb-1">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {data?.items.length === 0 ? 'Нет данных о продажах. Синхронизируйте данные.' : 'Срочных товаров нет.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Товар / SKU</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Остаток</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Дней осталось</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Скорость/д.</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Заказать, шт.</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item, i) => (
                <tr key={i} className={`transition-colors ${item.urgent ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.urgent && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Срочно" />}
                      <div>
                        <p className="font-medium text-slate-800 truncate max-w-[200px]">{item.title}</p>
                        <p className="text-xs text-slate-400">{item.sku} · {item.platform.toUpperCase()}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{item.current_stock}</td>
                  <td className="px-4 py-3 text-right">
                    {item.days_of_stock != null ? (
                      <span className={`font-semibold ${item.days_of_stock <= reorderDays ? 'text-red-600' : item.days_of_stock <= reorderDays * 2 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {Math.round(item.days_of_stock)}д
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.daily_velocity}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${item.suggested_qty && item.suggested_qty > 0 ? 'text-purple-700' : 'text-slate-400'}`}>
                      {item.suggested_qty ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">
                    {item.total_cost ? `${item.total_cost.toLocaleString('ru-RU')} ₽` : '—'}
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

export default function SupplyPage() {
  const [tab, setTab] = useState('forecasts');

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Управление поставками</h1>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[['forecasts', 'Прогноз запасов'], ['orders', 'Заказы поставки'], ['suppliers', 'Поставщики'], ['dead-stock', 'Мёртвый сток'], ['smart-reorder', 'Умный заказ']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'forecasts' && <ForecastsTab />}
      {tab === 'orders' && <PurchaseOrdersTab />}
      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'dead-stock' && <DeadStockTab />}
      {tab === 'smart-reorder' && <SmartReorderTab />}
    </div>
  );
}

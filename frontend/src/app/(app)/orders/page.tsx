'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getOrders, getConnections,
  createWbSupply, getWbSupplyBarcode, getWbOrderStickers, closeWbSupply,
  shipOzonOrder, getOzonLabel,
  getYmLabel, confirmYmOrder,
  getMmLabel, confirmMmOrder,
} from '@/lib/api';
import type { MarketplaceOrder, Connection } from '@/lib/api';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-blue-100 text-blue-700' },
  awaiting_packaging: { label: 'К сборке', color: 'bg-amber-100 text-amber-700' },
  awaiting_deliver: { label: 'К отгрузке', color: 'bg-purple-100 text-purple-700' },
  delivering: { label: 'В доставке', color: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Доставлен', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-700' },
};

function statusBadge(status: string) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'bg-slate-100 text-slate-600' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>;
}

function openBase64(data: string, mimeType: string) {
  const win = window.open();
  if (!win) return;
  win.document.write(`<iframe src="data:${mimeType};base64,${data}" width="100%" height="100%" style="border:none"></iframe>`);
}

function openBase64Png(base64: string) {
  const win = window.open();
  if (!win) return;
  win.document.write(`<img src="data:image/png;base64,${base64}" style="max-width:100%;display:block;margin:auto" />`);
}

// ---- WB Supply Modal ----
function WbSupplyPanel({
  orders, connectionId, onClose,
}: { orders: MarketplaceOrder[]; connectionId: string; onClose: () => void }) {
  const [supplyId, setSupplyId] = useState('');
  const [supplyName, setSupplyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [stickersLoading, setStickersLoading] = useState(false);
  const [error, setError] = useState('');

  const orderIds = orders.map((o) => o.id);

  async function handleCreate() {
    setLoading(true); setError('');
    try {
      const { supplyId: id, name } = await createWbSupply({ connectionId, orderIds, supplyName: supplyName || undefined });
      setSupplyId(id);
      setSupplyName(name);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
  }

  async function handleBarcode() {
    setBarcodeLoading(true); setError('');
    try {
      const { barcode } = await getWbSupplyBarcode(supplyId, connectionId);
      openBase64Png(barcode);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBarcodeLoading(false); }
  }

  async function handleStickers() {
    setStickersLoading(true); setError('');
    try {
      const { stickers } = await getWbOrderStickers({ connectionId, orderIds });
      for (const s of stickers) {
        if (s.barcodeBase64) openBase64Png(s.barcodeBase64);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setStickersLoading(false); }
  }

  async function handleClose() {
    if (!supplyId) return;
    try { await closeWbSupply(supplyId, connectionId); } catch { /* ignore */ }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Поставка WB — {orders.length} заказов</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

        {/* Order list */}
        <div className="max-h-40 overflow-y-auto space-y-1">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center gap-2 text-sm p-2 bg-slate-50 rounded-lg">
              <span className="font-mono text-xs text-slate-500 shrink-0">#{o.id}</span>
              <span className="flex-1 truncate text-slate-800">{o.items[0]?.title || o.items[0]?.offerId || 'Товар'}</span>
              <span className="shrink-0 font-medium text-slate-700">{(o.items[0]?.price ?? 0).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
        </div>

        {!supplyId ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Название поставки</label>
              <input
                type="text"
                value={supplyName}
                onChange={(e) => setSupplyName(e.target.value)}
                placeholder={`Поставка ${new Date().toLocaleDateString('ru-RU')}`}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={handleCreate} disabled={loading}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm"
            >
              {loading ? 'Создаём поставку...' : 'Создать поставку и добавить заказы'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-green-800">Поставка создана</p>
                <p className="text-xs text-green-700 font-mono">{supplyId}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">Следующие шаги:</p>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleStickers} disabled={stickersLoading}
                className="flex flex-col items-center gap-1.5 p-3 border-2 border-slate-200 hover:border-purple-400 rounded-xl transition-colors disabled:opacity-50">
                <span className="text-2xl">🏷️</span>
                <span className="text-xs font-medium text-slate-700">{stickersLoading ? 'Загрузка...' : 'Наклейки на товары'}</span>
              </button>
              <button onClick={handleBarcode} disabled={barcodeLoading}
                className="flex flex-col items-center gap-1.5 p-3 border-2 border-slate-200 hover:border-purple-400 rounded-xl transition-colors disabled:opacity-50">
                <span className="text-2xl">📦</span>
                <span className="text-xs font-medium text-slate-700">{barcodeLoading ? 'Загрузка...' : 'QR на коробку'}</span>
              </button>
            </div>

            <button onClick={handleClose}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-xl transition-colors text-sm">
              Готово — сдать на ПВЗ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Ozon order row ----
function OzonOrderRow({ order, onRefresh }: { order: MarketplaceOrder; onRefresh: () => void }) {
  const [shipping, setShipping] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleShip() {
    setShipping(true); setError('');
    try {
      await shipOzonOrder({
        connectionId: order.connectionId,
        postingNumber: order.postingNumber!,
      });
      onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setShipping(false); }
  }

  async function handleLabel() {
    setLabelLoading(true); setError('');
    try {
      const { pdf } = await getOzonLabel({ connectionId: order.connectionId, postingNumbers: [order.postingNumber!] });
      openBase64(pdf, 'application/pdf');
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLabelLoading(false); }
  }

  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-500">{order.postingNumber}</span>
          {statusBadge(order.status)}
        </div>
        <div className="mt-1 space-y-0.5">
          {order.items.map((item, i) => (
            <p key={i} className="text-sm text-slate-800">
              {item.title || item.offerId} <span className="text-slate-500">× {item.quantity}</span>
              <span className="ml-2 font-medium">{item.price.toLocaleString('ru-RU')} ₽</span>
            </p>
          ))}
        </div>
        {order.deliveryMethod && <p className="text-xs text-slate-500 mt-1">{order.deliveryMethod}</p>}
        {order.shipByDate && (
          <p className="text-xs text-amber-600 mt-0.5">Отгрузить до: {new Date(order.shipByDate).toLocaleDateString('ru-RU')}</p>
        )}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={handleLabel} disabled={labelLoading}
          className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors disabled:opacity-50">
          {labelLoading ? '...' : '🏷 Ярлык PDF'}
        </button>
        {(order.status === 'awaiting_packaging' || order.status === 'new') && (
          <button onClick={handleShip} disabled={shipping}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
            {shipping ? 'Отгружаем...' : '✓ Передать в доставку'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- YM order row ----
function YmOrderRow({ order, onRefresh }: { order: MarketplaceOrder; onRefresh: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLabel() {
    setLabelLoading(true); setError('');
    try {
      const { pdf } = await getYmLabel({ connectionId: order.connectionId, orderId: order.id });
      openBase64(pdf, 'application/pdf');
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLabelLoading(false); }
  }

  async function handleConfirm() {
    setConfirming(true); setError('');
    try {
      await confirmYmOrder({ connectionId: order.connectionId, orderId: order.id });
      onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setConfirming(false); }
  }

  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-500">#{order.id}</span>
          {statusBadge(order.status)}
          <span className="text-xs text-slate-400">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('ru-RU') : ''}</span>
        </div>
        <div className="mt-1 space-y-0.5">
          {order.items.map((item, i) => (
            <p key={i} className="text-sm text-slate-800">
              {item.title || item.offerId} <span className="text-slate-500">× {item.quantity}</span>
              <span className="ml-2 font-medium">{item.price.toLocaleString('ru-RU')} ₽</span>
            </p>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={handleLabel} disabled={labelLoading}
          className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors disabled:opacity-50">
          {labelLoading ? '...' : '🏷 Ярлык PDF'}
        </button>
        {(order.status === 'PROCESSING' || order.status === 'PENDING') && (
          <button onClick={handleConfirm} disabled={confirming}
            className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
            {confirming ? 'Подтверждаем...' : '✓ Готов к отправке'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- MM order row ----
function MmOrderRow({ order, onRefresh }: { order: MarketplaceOrder; onRefresh: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLabel() {
    setLabelLoading(true); setError('');
    try {
      const { pdf } = await getMmLabel({ connectionId: order.connectionId, orderId: order.id });
      openBase64(pdf, 'application/pdf');
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLabelLoading(false); }
  }

  async function handleConfirm() {
    setConfirming(true); setError('');
    try {
      await confirmMmOrder({ connectionId: order.connectionId, orderId: order.id });
      onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setConfirming(false); }
  }

  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-500">#{order.id}</span>
          {statusBadge(order.status)}
          <span className="text-xs text-slate-400">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('ru-RU') : ''}</span>
        </div>
        <div className="mt-1 space-y-0.5">
          {order.items.map((item, i) => (
            <p key={i} className="text-sm text-slate-800">
              {item.title || item.offerId} <span className="text-slate-500">× {item.quantity}</span>
              <span className="ml-2 font-medium">{item.price.toLocaleString('ru-RU')} ₽</span>
            </p>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={handleLabel} disabled={labelLoading}
          className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors disabled:opacity-50">
          {labelLoading ? '...' : '🏷 Ярлык PDF'}
        </button>
        {(order.status === 'CONFIRMED' || order.status === 'PROCESSING') && (
          <button onClick={handleConfirm} disabled={confirming}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
            {confirming ? 'Подтверждаем...' : '✓ Подтвердить заказ'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Main page ----
export default function OrdersPage() {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConn, setSelectedConn] = useState('');
  const [statusFilter, setStatusFilter] = useState<'new' | 'all'>('new');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // WB multi-select state
  const [selectedWb, setSelectedWb] = useState<Set<string>>(new Set());
  const [showWbPanel, setShowWbPanel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [{ orders: os }, conns] = await Promise.all([
        getOrders(statusFilter, selectedConn || undefined),
        getConnections(),
      ]);
      setOrders(os);
      setConnections(conns);
      setSelectedWb(new Set());
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
  }, [statusFilter, selectedConn]);

  useEffect(() => { load(); }, [load]);

  const wbOrders = orders.filter((o) => o.platform === 'wb');
  const ozonOrders = orders.filter((o) => o.platform === 'ozon');
  const ymOrders = orders.filter((o) => o.platform === 'ym');
  const mmOrders = orders.filter((o) => o.platform === 'mm');

  function toggleWb(id: string) {
    setSelectedWb((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllWb() {
    if (selectedWb.size === wbOrders.length) setSelectedWb(new Set());
    else setSelectedWb(new Set(wbOrders.map((o) => o.id)));
  }

  const selectedWbOrders = wbOrders.filter((o) => selectedWb.has(o.id));
  const wbConnectionId = selectedWbOrders[0]?.connectionId ?? wbOrders[0]?.connectionId ?? '';

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {showWbPanel && selectedWbOrders.length > 0 && (
        <WbSupplyPanel
          orders={selectedWbOrders}
          connectionId={wbConnectionId}
          onClose={() => { setShowWbPanel(false); load(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Заказы и отгрузка</h1>
          <p className="text-slate-500 mt-1">FBS-заказы с WB, Ozon, Яндекс Маркета и Мегамаркета — поставки, наклейки, ярлыки</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedConn}
            onChange={(e) => setSelectedConn(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">Все магазины</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.display_name} ({c.platform.toUpperCase()})</option>
            ))}
          </select>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['new', 'all'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {s === 'new' ? 'Новые' : 'Все'}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

      {orders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">📭</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Нет заказов</h2>
          <p className="text-slate-500 text-sm">
            {statusFilter === 'new' ? 'Новых FBS-заказов нет. Попробуйте переключиться на «Все».' : 'Заказов за последние 7 дней нет.'}
          </p>
        </div>
      ) : (
        <>
          {/* WB section */}
          {wbOrders.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center text-sm font-bold text-pink-700">WB</span>
                  <div>
                    <h2 className="font-semibold text-slate-800">Wildberries FBS</h2>
                    <p className="text-xs text-slate-500">{wbOrders.length} заказов</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={selectAllWb} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded">
                    {selectedWb.size === wbOrders.length ? 'Снять всё' : 'Выбрать всё'}
                  </button>
                  {selectedWb.size > 0 && (
                    <button
                      onClick={() => setShowWbPanel(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                      📦 Создать поставку ({selectedWb.size})
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {wbOrders.map((order) => (
                  <div key={order.id} className="flex items-start gap-3 p-4">
                    <input
                      type="checkbox"
                      checked={selectedWb.has(order.id)}
                      onChange={() => toggleWb(order.id)}
                      className="mt-1 w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 shrink-0 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-slate-500">#{order.id}</span>
                        {statusBadge(order.status)}
                        {order.warehouseName && (
                          <span className="text-xs text-slate-500">📍 {order.warehouseName}</span>
                        )}
                        <span className="text-xs text-slate-400">{new Date(order.createdAt).toLocaleDateString('ru-RU')}</span>
                      </div>
                      {order.items.map((item, i) => (
                        <p key={i} className="text-sm text-slate-800 mt-1">
                          {item.title || item.offerId} × {item.quantity}
                          <span className="ml-2 font-medium text-slate-700">{item.price.toLocaleString('ru-RU')} ₽</span>
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ozon section */}
          {ozonOrders.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-xs font-bold text-blue-700">OZ</span>
                <div>
                  <h2 className="font-semibold text-slate-800">Ozon FBS</h2>
                  <p className="text-xs text-slate-500">{ozonOrders.length} заказов</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {ozonOrders.map((order) => (
                  <OzonOrderRow key={order.id} order={order} onRefresh={load} />
                ))}
              </div>
            </div>
          )}

          {/* YM section */}
          {ymOrders.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <span className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center text-xs font-bold text-yellow-700">YM</span>
                <div>
                  <h2 className="font-semibold text-slate-800">Яндекс Маркет FBS</h2>
                  <p className="text-xs text-slate-500">{ymOrders.length} заказов</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {ymOrders.map((order) => (
                  <YmOrderRow key={order.id} order={order} onRefresh={load} />
                ))}
              </div>
            </div>
          )}

          {/* MM section */}
          {mmOrders.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-xs font-bold text-green-700">MM</span>
                <div>
                  <h2 className="font-semibold text-slate-800">Мегамаркет FBS</h2>
                  <p className="text-xs text-slate-500">{mmOrders.length} заказов</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {mmOrders.map((order) => (
                  <MmOrderRow key={order.id} order={order} onRefresh={load} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

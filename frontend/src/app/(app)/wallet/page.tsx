'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getMe, topupWallet, getTransactions, getTopups, getMySubscription,
  getInvoices, requestInvoice, cancelInvoice, getInvoiceHtmlUrl,
  getActs, getActHtmlUrl,
} from '@/lib/api';
import { setUser, getToken } from '@/lib/auth';
import type { Transaction, Topup, SubscriptionInfo, BankInvoice, ServiceAct } from '@/lib/api';
import type { StoredUser } from '@/lib/auth';
import Link from 'next/link';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  debit: 'Списание',
  credit: 'Пополнение',
  topup: 'Пополнение',
  run: 'Запуск',
  refund: 'Возврат',
  charge: 'Запуск',
  subscription: 'Подписка',
};

function isCreditType(type: string) {
  return type === 'credit' || type === 'topup' || type === 'refund';
}

const TOPUP_STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const TOPUP_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидание',
  paid: 'Оплачено',
  completed: 'Выполнено',
  success: 'Выполнено',
  failed: 'Ошибка',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PRESET_AMOUNTS = [500, 1000, 2000, 5000];

/** Auto-submit a hidden HTML form (needed for WebPay POST redirect). */
function submitWebpayForm(formUrl: string, fields: Record<string, string>) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = formUrl;
  form.acceptCharset = 'UTF-8';
  form.style.display = 'none';

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export default function WalletPage() {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get('status');  // 'success' | 'fail' | null
  const paymentOrder = searchParams.get('order');

  const [user, setUserState] = useState<StoredUser | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState('');
  const [activeTab, setActiveTab] = useState<'transactions' | 'topups' | 'invoices' | 'acts'>('transactions');
  const [invoices, setInvoices] = useState<BankInvoice[]>([]);
  const [acts, setActs] = useState<ServiceAct[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({ plan: 'business' as 'start' | 'business', months: 1, payerName: '' });
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');

  const PLAN_NAMES: Record<string, string> = { free: 'Бесплатный', start: 'Старт', business: 'Бизнес' };
  const PLAN_PRICES: Record<string, number> = { free: 0, start: 490, business: 990 };

  const loadData = useCallback(async () => {
    try {
      const [meData, txData, topupData, subData, invData, actData] = await Promise.all([
        getMe(),
        getTransactions(),
        getTopups(),
        getMySubscription().catch(() => null),
        getInvoices().catch(() => ({ invoices: [] })),
        getActs().catch(() => ({ acts: [] })),
      ]);
      const stored: StoredUser = {
        id: meData.user.id,
        email: meData.user.email,
        balance: meData.user.balance,
        isAdmin: meData.user.is_admin,
      };
      setUser(stored);
      setUserState(stored);
      setTransactions(txData);
      setTopups(topupData);
      if (subData) setSubscription(subData.subscription);
      setInvoices(invData.invoices);
      setActs(actData.acts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // If redirected back from WebPay, switch to topups tab to show status
    if (paymentStatus) {
      setActiveTab('topups');
    }
  }, [loadData, paymentStatus]);

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    setTopupError('');
    const num = Number(amount);
    if (!num || num < 100 || num > 100000) {
      setTopupError('Сумма должна быть от 100 до 100 000 ₽');
      return;
    }
    setTopupLoading(true);
    try {
      const { formUrl, fields } = await topupWallet(num);
      // WebPay requires a form POST — build and auto-submit
      submitWebpayForm(formUrl, fields);
      // Page will navigate away; no need to reset loading state
    } catch (e) {
      setTopupError(e instanceof Error ? e.message : 'Ошибка пополнения');
      setTopupLoading(false);
    }
  }

  async function handleRequestInvoice(e: React.FormEvent) {
    e.preventDefault();
    setInvoiceError('');
    setInvoiceLoading(true);
    try {
      const { invoice } = await requestInvoice(invoiceForm.plan, invoiceForm.months, invoiceForm.payerName || undefined);
      setInvoices(prev => [invoice, ...prev]);
      setInvoiceForm({ plan: 'business', months: 1, payerName: '' });
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setInvoiceLoading(false);
    }
  }

  async function handleCancelInvoice(id: string) {
    try {
      await cancelInvoice(id);
      setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'cancelled' } : i));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function openDoc(url: string) {
    const token = getToken();
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Ошибка загрузки документа');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Кошелёк</h1>
        <p className="text-slate-500 mt-1">Управление балансом и транзакциями</p>
      </div>

      {/* Payment result banner */}
      {paymentStatus === 'success' && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800">
          <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="font-medium">Платёж отправлен</p>
            <p className="text-sm text-green-600">
              Баланс обновится автоматически после подтверждения от WebPay.
              {paymentOrder && <span className="ml-1 opacity-60">Заказ: {paymentOrder.slice(0, 8)}…</span>}
            </p>
          </div>
        </div>
      )}
      {paymentStatus === 'fail' && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800">
          <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <div>
            <p className="font-medium">Платёж не прошёл</p>
            <p className="text-sm text-red-600">Попробуйте ещё раз или используйте другую карту.</p>
          </div>
        </div>
      )}

      {/* Subscription info */}
      {!loading && subscription && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              subscription.plan === 'free' ? 'bg-slate-100' : 'bg-purple-100'
            }`}>
              <svg className={`w-5 h-5 ${subscription.plan === 'free' ? 'text-slate-400' : 'text-purple-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-slate-500">Текущий тариф</p>
              <p className="font-semibold text-slate-900">{PLAN_NAMES[subscription.plan] ?? subscription.plan}</p>
            </div>
            {subscription.plan !== 'free' && subscription.expires_at && (
              <div className="hidden sm:block border-l border-slate-200 pl-4">
                <p className="text-xs text-slate-500">Следующее списание</p>
                <p className="font-semibold text-slate-900">
                  {new Date(subscription.expires_at).toLocaleDateString('ru-RU')}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    —{' '}{PLAN_PRICES[subscription.plan] ?? 0} ₽/мес
                  </span>
                </p>
              </div>
            )}
            {subscription.plan !== 'free' && (
              <div className="hidden sm:block border-l border-slate-200 pl-4">
                <p className="text-xs text-slate-500">Лимит запусков</p>
                <p className="font-semibold text-slate-900">
                  {subscription.limits?.runsPerMonth >= 9999 ? 'Безлимит' : `${subscription.limits?.runsPerMonth}/мес`}
                </p>
              </div>
            )}
          </div>
          <Link
            href="/pricing"
            className="shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {subscription.plan === 'free' ? 'Обновить тариф' : 'Изменить тариф'}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Balance card */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 text-white">
          <p className="text-purple-200 text-sm mb-2">Текущий баланс</p>
          <p className="text-4xl font-bold mb-4">
            {loading ? '...' : `${user?.balance.toLocaleString('ru-RU') ?? '0'} ₽`}
          </p>
          <p className="text-purple-200 text-xs">{user?.email}</p>
        </div>

        {/* Topup form */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Пополнить баланс</h2>
          {topupError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {topupError}
            </div>
          )}
          <form onSubmit={handleTopup} className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className={`py-2 text-sm rounded-lg border font-medium transition-colors ${
                    amount === String(preset)
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {preset} ₽
                </button>
              ))}
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Или введите сумму (100–100 000 ₽)"
              min={100}
              max={100000}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              disabled={topupLoading || !amount}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {topupLoading ? 'Переход к оплате...' : 'Пополнить через WebPay'}
            </button>
            {/* WebPay / Priorbank badge */}
            <div className="flex items-center justify-center gap-3 pt-1">
              <span className="text-xs text-slate-400">Оплата через</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 bg-slate-50">
                <span className="w-4 h-4 rounded-sm bg-[#E30613] inline-block" />
                <span className="text-xs font-semibold text-slate-700">Приорбанк</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 bg-slate-50">
                <span className="w-4 h-4 rounded-sm bg-[#0050A0] inline-block" />
                <span className="text-xs font-semibold text-slate-700">WebPay</span>
              </span>
            </div>
          </form>
        </div>
      </div>

      {/* History tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="border-b border-slate-100">
          <div className="flex overflow-x-auto">
            {([
              { id: 'transactions', label: 'Транзакции' },
              { id: 'topups', label: 'Пополнения' },
              { id: 'invoices', label: 'Счета на оплату' },
              { id: 'acts', label: 'Акты выполненных работ' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === 'transactions' ? (
          transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Транзакций пока нет</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Тип</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Сумма</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {transactions.slice(0, 20).map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-slate-700">
                        {tx.provider_id?.startsWith('subscription')
                          ? 'Подписка'
                          : TRANSACTION_TYPE_LABELS[tx.type] || tx.type}
                        {tx.run_id && (
                          <span className="text-xs text-slate-400 ml-1">#{tx.run_id.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className={`px-5 py-3 font-medium ${
                        isCreditType(tx.type) ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {isCreditType(tx.type) ? '+' : '−'}{Number(tx.amount).toLocaleString('ru-RU')} BYN
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(tx.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === 'topups' ? (
          topups.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Пополнений пока нет</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Сумма</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Валюта</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Статус</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {topups.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {Number(t.amount).toLocaleString('ru-RU')}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{t.currency}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          TOPUP_STATUS_CLASSES[t.status] || 'bg-slate-100 text-slate-600'
                        }`}>
                          {TOPUP_STATUS_LABELS[t.status] || t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === 'invoices' ? (
          <div className="p-5 space-y-5">
            {/* Request form */}
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Запросить счёт на оплату</h3>
              <form onSubmit={handleRequestInvoice} className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Тариф</label>
                  <select
                    value={invoiceForm.plan}
                    onChange={e => setInvoiceForm(f => ({ ...f, plan: e.target.value as 'start' | 'business' }))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="start">Старт — 490 BYN/мес.</option>
                    <option value="business">Бизнес — 990 BYN/мес.</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Месяцев</label>
                  <select
                    value={invoiceForm.months}
                    onChange={e => setInvoiceForm(f => ({ ...f, months: Number(e.target.value) }))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {[1,2,3,6,12].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-slate-500 mb-1">Плательщик (необязательно)</label>
                  <input
                    type="text"
                    placeholder="ИП / ООО / ФИО"
                    value={invoiceForm.payerName}
                    onChange={e => setInvoiceForm(f => ({ ...f, payerName: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={invoiceLoading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {invoiceLoading ? 'Создание…' : 'Сформировать счёт'}
                </button>
              </form>
              {invoiceError && <p className="text-red-600 text-xs mt-2">{invoiceError}</p>}
              <p className="text-xs text-slate-400 mt-2">
                Счёт содержит реквизиты для перевода на расчётный счёт. После оплаты — сообщите нам, и доступ будет активирован.
              </p>
            </div>

            {/* Invoice list */}
            {invoices.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-4">Счетов пока нет</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Номер</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Тариф</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Сумма</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Статус</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Дата</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{inv.invoice_number}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {inv.plan === 'business' ? 'Бизнес' : 'Старт'} × {inv.months} мес.
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{Number(inv.amount).toLocaleString('ru-RU')} BYN</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            inv.status === 'paid' ? 'bg-green-100 text-green-700'
                            : inv.status === 'cancelled' ? 'bg-slate-100 text-slate-500'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                            {inv.status === 'paid' ? 'Оплачен' : inv.status === 'cancelled' ? 'Отменён' : 'Ожидает оплаты'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(inv.created_at)}</td>
                        <td className="px-4 py-3 flex gap-2">
                          <button
                            onClick={() => openDoc(getInvoiceHtmlUrl(inv.id))}
                            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                          >
                            Скачать
                          </button>
                          {inv.status === 'pending' && (
                            <button
                              onClick={() => handleCancelInvoice(inv.id)}
                              className="text-xs text-slate-400 hover:text-red-500"
                            >
                              Отменить
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Acts tab */
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-500">
              Акты выполненных работ формируются автоматически 1-го числа каждого месяца за предыдущий период.
            </p>
            {acts.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">Актов пока нет. Они появятся в начале следующего месяца.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Номер акта</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Период</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Сумма</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {acts.map(act => (
                      <tr key={act.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{act.act_number}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {new Date(act.period_from).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{Number(act.amount).toLocaleString('ru-RU')} BYN</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openDoc(getActHtmlUrl(act.id))}
                            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                          >
                            Скачать
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

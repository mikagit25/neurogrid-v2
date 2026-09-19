'use client';

import { useEffect, useState } from 'react';
import { getMe, topupWallet, getTransactions, getTopups } from '@/lib/api';
import { setUser } from '@/lib/auth';
import type { Transaction, Topup } from '@/lib/api';
import type { StoredUser } from '@/lib/auth';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  debit: 'Списание',
  credit: 'Пополнение',
  topup: 'Пополнение',
  run: 'Запуск',
  refund: 'Возврат',
};

const TOPUP_STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const TOPUP_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидание',
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

export default function WalletPage() {
  const [user, setUserState] = useState<StoredUser | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState('');
  const [activeTab, setActiveTab] = useState<'transactions' | 'topups'>('transactions');

  useEffect(() => {
    async function load() {
      try {
        const [meData, txData, topupData] = await Promise.all([
          getMe(),
          getTransactions(),
          getTopups(),
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
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
      const { redirectUrl } = await topupWallet(num);
      window.open(redirectUrl, '_blank', 'noopener,noreferrer');
      // Refresh after a short delay
      setTimeout(async () => {
        const [meData, txData, topupData] = await Promise.all([
          getMe(),
          getTransactions(),
          getTopups(),
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
      }, 3000);
    } catch (e) {
      setTopupError(e instanceof Error ? e.message : 'Ошибка пополнения');
    } finally {
      setTopupLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Кошелёк</h1>
        <p className="text-slate-500 mt-1">Управление балансом и транзакциями</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Balance card */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 text-white">
          <p className="text-purple-200 text-sm mb-2">Текущий баланс</p>
          <p className="text-4xl font-bold mb-4">
            {loading ? '...' : `${user?.balance.toLocaleString('ru-RU') ?? '0'} ₽`}
          </p>
          <p className="text-purple-200 text-xs">
            {user?.email}
          </p>
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
            {/* Preset amounts */}
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
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Или введите сумму (100–100 000 ₽)"
                min={100}
                max={100000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              type="submit"
              disabled={topupLoading || !amount}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {topupLoading ? 'Создание платежа...' : 'Пополнить через bePaid'}
            </button>
            <p className="text-xs text-slate-400 text-center">
              Платёж обрабатывается через защищённый шлюз bePaid
            </p>
          </form>
        </div>
      </div>

      {/* History tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="border-b border-slate-100">
          <div className="flex">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'transactions'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Транзакции
            </button>
            <button
              onClick={() => setActiveTab('topups')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'topups'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Пополнения
            </button>
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
                        {TRANSACTION_TYPE_LABELS[tx.type] || tx.type}
                        {tx.run_id && (
                          <span className="text-xs text-slate-400 ml-1">#{tx.run_id.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className={`px-5 py-3 font-medium ${
                        tx.type === 'charge' ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {tx.type === 'charge' ? '−' : '+'}{Number(tx.amount).toLocaleString('ru-RU')} ₽
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(tx.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
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
                        {Number(t.amount).toLocaleString('ru-RU')} {t.currency}
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
        )}
      </div>
    </div>
  );
}

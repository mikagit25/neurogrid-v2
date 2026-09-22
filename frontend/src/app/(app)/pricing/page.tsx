'use client';

import { useEffect, useState } from 'react';
import { getMySubscription, payForSubscription } from '@/lib/api';
import { getUser, setUser } from '@/lib/auth';
import Link from 'next/link';

interface SubscriptionInfo {
  plan: string;
  expires_at: string | null;
}

const PLANS = [
  {
    id: 'free',
    name: 'Бесплатно',
    price: 0,
    period: '',
    description: 'Для знакомства с сервисом',
    features: [
      '10 AI-запусков в месяц',
      'Генерация карточек товаров',
      'SEO-аудит и анализ ниш',
      '1 подключение к маркетплейсу',
    ],
    missing: [
      'Учёт остатков по складам',
      'Финансовая аналитика P&L',
      'Автопилот и автоматизации',
    ],
    highlighted: false,
  },
  {
    id: 'start',
    name: 'Старт',
    price: 490,
    period: '/мес',
    description: 'Для активных продавцов',
    features: [
      '100 AI-запусков в месяц',
      'Все сценарии включены',
      '2 подключения к маркетплейсам',
      'Учёт остатков FBO и FBS',
      'Синхронизация каждый час',
      'Цены закупки и учёт себестоимости',
    ],
    missing: ['Финансовая аналитика P&L'],
    highlighted: false,
  },
  {
    id: 'business',
    name: 'Бизнес',
    price: 990,
    period: '/мес',
    description: 'Для серьёзного бизнеса',
    features: [
      'Безлимитные AI-запуски',
      'До 10 аккаунтов маркетплейсов',
      'Учёт остатков FBO и FBS',
      'Финансовая аналитика P&L',
      'Разбивка по товарам и площадкам',
      'Автопилот и автоматизации',
      'Приоритетная поддержка',
    ],
    missing: [],
    highlighted: true,
  },
];

export default function PricingPage() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    Promise.all([
      getMySubscription(),
      import('@/lib/api').then(m => m.getMe()),
    ])
      .then(([subData, meData]) => {
        setSubscription(subData.subscription);
        setBalance(meData.user.balance);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handlePay(planId: string) {
    if (planId === 'free') return;
    const plan = PLANS.find(p => p.id === planId);
    if (!plan || plan.price === 0) return;

    if (balance < plan.price) {
      setError(`Недостаточно средств. Нужно ${plan.price} ₽, на балансе ${balance.toFixed(2)} ₽. Пополните кошелёк.`);
      return;
    }

    setError('');
    setSuccess('');
    setPaying(planId);
    try {
      const res = await payForSubscription(planId as 'start' | 'business');
      setSubscription(res.subscription);
      setBalance(res.newBalance);
      // Update cached user balance
      const stored = getUser();
      if (stored) setUser({ ...stored, balance: res.newBalance });
      setSuccess(`Тариф «${plan.name}» активирован! Следующее списание через месяц.`);
    } catch (e: any) {
      setError(e.message || 'Ошибка оплаты');
    } finally {
      setPaying(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Тарифы</h1>
        <p className="text-slate-500 mt-2">Выберите план, подходящий для вашего бизнеса</p>
        {!loading && subscription && subscription.plan !== 'free' && (
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 bg-green-50 border border-green-200 rounded-full text-sm text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Активный план: <strong>{subscription.plan === 'start' ? 'Старт' : 'Бизнес'}</strong>
            {subscription.expires_at && (
              <span className="text-green-600">до {new Date(subscription.expires_at).toLocaleDateString('ru-RU')}</span>
            )}
          </div>
        )}
      </div>

      {success && (
        <div className="max-w-5xl mx-auto flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
          <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {error && (
        <div className="max-w-5xl mx-auto p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
          {error.includes('кошелёк') && (
            <Link href="/wallet" className="ml-2 underline font-medium">Пополнить →</Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {PLANS.map(plan => {
          const isCurrent = !loading && subscription?.plan === plan.id;
          const canAfford = balance >= plan.price;
          const isLoading = paying === plan.id;

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl border-2 p-6 flex flex-col relative ${
                plan.highlighted ? 'border-purple-500 shadow-lg shadow-purple-100' : 'border-slate-200'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-purple-600 text-white text-xs font-semibold rounded-full">
                  Популярный
                </div>
              )}

              <div className="mb-5">
                <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                <p className="text-slate-500 text-sm mt-0.5">{plan.description}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-3xl font-bold text-slate-900">
                    {plan.price === 0 ? 'Бесплатно' : `${plan.price} ₽`}
                  </span>
                  {plan.period && <span className="text-slate-400 text-sm mb-1">{plan.period}</span>}
                </div>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
                {plan.missing.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-400">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {plan.id === 'free' ? (
                <button
                  disabled
                  className="mt-6 w-full py-2.5 rounded-xl font-medium text-sm bg-slate-100 text-slate-400 cursor-default"
                >
                  {isCurrent ? 'Текущий план' : 'Бесплатно'}
                </button>
              ) : isCurrent ? (
                <button
                  disabled
                  className="mt-6 w-full py-2.5 rounded-xl font-medium text-sm bg-slate-100 text-slate-400 cursor-default"
                >
                  Текущий план
                </button>
              ) : (
                <button
                  onClick={() => handlePay(plan.id)}
                  disabled={isLoading || !!paying}
                  title={!canAfford ? `Нужно ${plan.price} ₽, на балансе ${balance.toFixed(2)} ₽` : undefined}
                  className={`mt-6 w-full py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-60 ${
                    plan.highlighted
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-slate-800 hover:bg-slate-900 text-white'
                  }`}
                >
                  {isLoading ? 'Подключаем...' : `Подключить — ${plan.price} ₽/мес`}
                </button>
              )}

              {plan.id !== 'free' && !isCurrent && !canAfford && !loading && (
                <p className="mt-2 text-xs text-center text-amber-600">
                  Нужно пополнить на {(plan.price - balance).toFixed(0)} ₽{' '}
                  <Link href="/wallet" className="underline">→ Кошелёк</Link>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!loading && (
        <div className="max-w-5xl mx-auto bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 flex items-center justify-between">
          <span>
            Ваш баланс: <strong className="text-slate-900">{balance.toLocaleString('ru-RU')} ₽</strong>
            {' '}— списание происходит с баланса раз в месяц
          </span>
          <Link href="/wallet" className="text-purple-600 hover:text-purple-700 font-medium text-sm">
            Пополнить кошелёк →
          </Link>
        </div>
      )}
    </div>
  );
}

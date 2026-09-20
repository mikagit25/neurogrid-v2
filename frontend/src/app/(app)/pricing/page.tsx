'use client';

import { useEffect, useState } from 'react';
import { apiRequest as apiFetch } from '@/lib/api';

interface Subscription {
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
    cta: 'Текущий план',
    ctaDisabled: true,
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
    cta: 'Подключить',
    ctaDisabled: false,
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
    cta: 'Подключить',
    ctaDisabled: false,
    highlighted: true,
  },
];

export default function PricingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/subscriptions/me')
      .then(d => setSubscription(d.subscription))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Тарифы</h1>
        <p className="text-slate-500 mt-2">Выберите план, подходящий для вашего бизнеса</p>
        {subscription && subscription.plan !== 'free' && (
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 bg-green-50 border border-green-200 rounded-full text-sm text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Активный план: <strong>{subscription.plan === 'start' ? 'Старт' : 'Бизнес'}</strong>
            {subscription.expires_at && (
              <span className="text-green-600">до {new Date(subscription.expires_at).toLocaleDateString('ru-RU')}</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {PLANS.map(plan => {
          const isCurrent = !loading && subscription?.plan === plan.id;
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

              <button
                disabled={isCurrent || plan.ctaDisabled}
                className={`mt-6 w-full py-2.5 rounded-xl font-medium text-sm transition-colors ${
                  isCurrent
                    ? 'bg-slate-100 text-slate-400 cursor-default'
                    : plan.highlighted
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {isCurrent ? 'Текущий план' : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      <div className="max-w-5xl mx-auto bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Оплата:</strong> Для активации платного тарифа свяжитесь с нами через поддержку. Онлайн-оплата будет доступна в ближайшее время.
      </div>
    </div>
  );
}

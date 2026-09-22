'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOnboarding, dismissOnboarding, getConnections } from '@/lib/api';

const STEPS = [
  {
    id: 'welcome',
    title: 'Добро пожаловать в NeuroGrid',
    subtitle: 'Платформа для продавцов на WildBerries, Ozon, Яндекс Маркет и Мегамаркет',
    content: (
      <div className="space-y-3 mt-4">
        {[
          { icon: '🤖', title: 'AI-автоматизация', desc: 'Карточки, ответы на отзывы, инфографика, SEO — за секунды' },
          { icon: '📊', title: 'Финансовая аналитика', desc: 'P&L, маржа, прогноз — по каждому SKU и площадке' },
          { icon: '🏭', title: 'Управление складом', desc: 'Остатки FBO/FBS, закупочные цены, прогноз стоков' },
          { icon: '⚡', title: 'Автопилот', desc: 'Автоматическое репрайсинг и управление рекламой 24/7' },
        ].map(item => (
          <div key={item.title} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="text-xl flex-shrink-0">{item.icon}</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
    cta: 'Далее →',
    ctaAction: 'next' as const,
  },
  {
    id: 'connect',
    title: 'Подключите первый магазин',
    subtitle: 'NeuroGrid работает с вашими реальными данными. Начните с подключения одного маркетплейса.',
    content: (
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'WildBerries', bg: 'bg-[#CB11AB]', short: 'WB' },
            { name: 'Ozon', bg: 'bg-[#005BFF]', short: 'OZ' },
            { name: 'Яндекс Маркет', bg: 'bg-[#FFCC00]', short: 'YM', dark: true },
            { name: 'Мегамаркет', bg: 'bg-[#21A038]', short: 'MM' },
          ].map(mp => (
            <div key={mp.name} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className={`w-8 h-8 rounded-lg ${mp.bg} flex items-center justify-center text-xs font-bold ${mp.dark ? 'text-slate-900' : 'text-white'}`}>
                {mp.short}
              </div>
              <span className="text-sm font-medium text-slate-700">{mp.name}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 text-center">После подключения NeuroGrid автоматически синхронизирует товары, заказы и склад</p>
      </div>
    ),
    cta: 'Подключить магазин',
    ctaAction: 'connect' as const,
  },
  {
    id: 'explore',
    title: 'Вы готовы к работе!',
    subtitle: 'Изучите ключевые разделы платформы. Всё в боковом меню слева.',
    content: (
      <div className="mt-4 space-y-2">
        {[
          { href: '/analytics', icon: '📈', label: 'Аналитика', desc: 'Выручка, заказы, платформы' },
          { href: '/products', icon: '🛍️', label: 'Каталог', desc: 'Товары, Listing Score, цены' },
          { href: '/finance', icon: '💰', label: 'Финансы', desc: 'P&L с учётом себестоимости' },
          { href: '/scenarios', icon: '🤖', label: 'AI-сценарии', desc: 'Автоматизация контента и цен' },
          { href: '/dashboard', icon: '🏠', label: 'Дашборд', desc: 'Всё важное на одном экране' },
        ].map(item => (
          <div key={item.href} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl hover:bg-purple-50 transition-colors">
            <span className="text-lg">{item.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
    cta: 'Начать работу',
    ctaAction: 'done' as const,
  },
];

export default function OnboardingWizard() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    Promise.all([getOnboarding(), getConnections()])
      .then(([ob, conn]) => {
        if (!ob.dismissed && conn.length === 0) {
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleDismiss() {
    setDismissing(true);
    await dismissOnboarding().catch(() => {});
    setShow(false);
  }

  async function handleCta(action: 'next' | 'connect' | 'done') {
    if (action === 'next') {
      setStep(s => s + 1);
    } else if (action === 'connect') {
      await handleDismiss();
      window.location.href = '/connections';
    } else {
      await handleDismiss();
    }
  }

  if (!show) return null;

  const current = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-purple-700 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-6">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? 'bg-purple-600 w-6' : 'bg-slate-200 w-4'}`} />
              ))}
            </div>
            <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 transition-colors text-sm">
              Пропустить
            </button>
          </div>

          {/* Content */}
          <h2 className="text-xl font-bold text-slate-900">{current.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{current.subtitle}</p>
          {current.content}

          {/* CTA */}
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => handleCta(current.ctaAction)}
              disabled={dismissing}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
            >
              {dismissing ? '...' : current.cta}
            </button>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                ← Назад
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

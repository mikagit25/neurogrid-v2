'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearToken, getUser } from '@/lib/auth';

const sections = [
  {
    title: 'Управление',
    items: [
      { href: '/autopilot',   label: 'Автопилот',         icon: '🤖', desc: 'AI-анализ и запуск кампаний' },
      { href: '/scenarios',   label: 'Сценарии',           icon: '⚡', desc: 'Шаблоны автоматизаций' },
      { href: '/automations', label: 'Автоматизации',      icon: '🔁', desc: 'Активные правила' },
      { href: '/price-rules', label: 'Управление ценами',  icon: '🏷️', desc: 'Ценовые правила' },
    ],
  },
  {
    title: 'Данные',
    items: [
      { href: '/warehouse',   label: 'Склад',              icon: '🏭', desc: 'Остатки по складам' },
      { href: '/finance',     label: 'Финансы / P&L',      icon: '💰', desc: 'Выручка и выплаты' },
      { href: '/runs',        label: 'Запуски',             icon: '🕐', desc: 'История выполнений' },
    ],
  },
  {
    title: 'Настройки',
    items: [
      { href: '/connections',   label: 'Подключения',      icon: '🔗', desc: 'Магазины и API-ключи' },
      { href: '/notifications', label: 'Уведомления',      icon: '🔔', desc: 'Настройки и дайджест' },
      { href: '/wallet',        label: 'Кошелёк',          icon: '💳', desc: 'Баланс и платежи' },
      { href: '/pricing',       label: 'Тарифы',           icon: '📦', desc: 'Выбор плана' },
    ],
  },
];

export default function MorePage() {
  const router = useRouter();
  const user = getUser();

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <div className="space-y-5 pb-6">
      <h1 className="text-xl font-bold text-slate-900">Ещё</h1>

      {user && (
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-lg">
              {user.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold truncate text-sm">{user.email}</p>
            <p className="text-purple-200 text-sm mt-0.5 font-medium">
              {user.balance.toLocaleString('ru-RU')} ₽
            </p>
          </div>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
            {section.title}
          </p>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50 overflow-hidden">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                <span className="text-xl w-8 text-center shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
                <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="text-sm font-medium">Выйти из аккаунта</span>
        </button>
      </div>
    </div>
  );
}

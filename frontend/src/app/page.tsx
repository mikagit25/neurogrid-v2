'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated } from '@/lib/auth';

/* ── Data ─────────────────────────────────────────────────────────────────── */

const PLATFORMS = [
  { id: 'wb',   short: 'WB', name: 'WildBerries',    bg: 'bg-[#CB11AB]', text: 'text-white' },
  { id: 'ozon', short: 'OZ', name: 'Ozon',           bg: 'bg-[#005BFF]', text: 'text-white' },
  { id: 'ym',   short: 'YM', name: 'Яндекс Маркет', bg: 'bg-[#FFCC00]', text: 'text-slate-900' },
  { id: 'mm',   short: 'MM', name: 'Мегамаркет',     bg: 'bg-[#21A038]', text: 'text-white' },
];

const SCENARIOS = [
  { icon: '📝', title: 'Генератор карточек',    desc: 'SEO-заголовок, описание и 15+ ключевых слов под требования каждого маркетплейса.', price: '9,90 ₽', tag: 'Контент' },
  { icon: '📊', title: 'Мониторинг цен',        desc: 'Анализ позиций конкурентов по артикулу и рекомендации по репрайсингу.', price: '14,90 ₽', tag: 'Аналитика' },
  { icon: '⭐', title: 'Ответы на отзывы',      desc: 'Персонализированные ответы на любые отзывы и вопросы за 5 секунд.', price: '4,90 ₽', tag: 'Коммуникация' },
  { icon: '📦', title: 'Прогноз остатков',      desc: 'Предупредит о риске out-of-stock за 7–14 дней по скорости продаж.', price: '12,90 ₽', tag: 'Аналитика' },
  { icon: '🔍', title: 'SEO-аудит карточки',    desc: 'Проверка заполненности, ключевых слов и рекомендации по улучшению.', price: '7,90 ₽', tag: 'Контент' },
  { icon: '📸', title: 'Фото-генератор',        desc: 'FLUX AI создаёт профессиональные фото товара — белый фон, лайфстайл, студийные.', price: '29,90 ₽', tag: 'Изображения' },
  { icon: '🖼️', title: 'Инфографика',           desc: 'Готовые инфографики с характеристиками под форматы WB и Ozon за 30 секунд.', price: '19,90 ₽', tag: 'Изображения' },
  { icon: '🎬', title: 'Мульти-фото студия',    desc: 'Несколько ракурсов товара — AI объединяет в профессиональный 3D-вид.', price: '39,90 ₽', tag: 'Изображения' },
  { icon: '🔎', title: 'Анализ ниши',           desc: 'Оцениваем конкуренцию, средние цены и точки входа по ключевому слову.', price: '19,90 ₽', tag: 'Аналитика' },
];

const MODULES = [
  {
    icon: '🤖',
    title: '9 AI-сценариев',
    desc: 'Карточки, цены, отзывы, фото, инфографика, прогноз остатков, SEO-аудит, анализ ниши — запускаешь по необходимости.',
    color: 'from-purple-50 to-purple-100/50',
    border: 'border-purple-200',
  },
  {
    icon: '🏭',
    title: 'Склад FBO + FBS',
    desc: 'Остатки со всех складов маркетплейсов и своего склада в одном окне. Закупочные цены, штрих-коды, автосинхронизация.',
    color: 'from-blue-50 to-blue-100/50',
    border: 'border-blue-200',
  },
  {
    icon: '💰',
    title: 'Финансы и P&L',
    desc: 'Выручка, комиссии, логистика, штрафы — по каждому маркетплейсу и артикулу. Ваша реальная маржа с учётом закупки.',
    color: 'from-emerald-50 to-emerald-100/50',
    border: 'border-emerald-200',
  },
  {
    icon: '⚡',
    title: 'Автопилот',
    desc: 'Настраивайте триггеры: снизился рейтинг — автоответ, заканчивается склад — уведомление, новый отзыв — моментальная реакция.',
    color: 'from-amber-50 to-amber-100/50',
    border: 'border-amber-200',
  },
];

const DEMOS = [
  {
    id: 'card',
    label: 'Карточка товара',
    icon: '📝',
    tagline: 'SEO за 20 секунд',
    input: {
      title: 'Что вы вводите',
      fields: [
        { label: 'Название товара', value: 'Кроссовки мужские Air Run Pro' },
        { label: 'Категория', value: 'Обувь → Кроссовки' },
        { label: 'Особенности', value: 'лёгкая подошва EVA, дышащий верх из сетки, размеры 40–46, 5 цветов' },
        { label: 'Маркетплейс', value: 'WildBerries' },
      ],
    },
    output: {
      title: 'Что вы получаете',
      sections: [
        {
          label: 'Заголовок карточки',
          color: 'text-purple-700 bg-purple-50',
          content: 'Кроссовки мужские Air Run Pro лёгкие для бега и прогулок, дышащий верх из сетки, подошва EVA, размеры 40–46',
        },
        {
          label: 'Описание',
          color: 'text-slate-700 bg-slate-50',
          content: 'Мужские кроссовки Air Run Pro — идеальный выбор для активного образа жизни. Ультралёгкая подошва из EVA обеспечивает мягкую амортизацию при беге. Дышащий верх из перфорированной сетки поддерживает оптимальный микроклимат стопы. Доступны в 5 цветах, размерный ряд 40–46.',
        },
        {
          label: 'Ключевые слова (17 шт.)',
          color: 'text-green-700 bg-green-50',
          content: 'кроссовки мужские, спортивная обувь для бега, кроссовки дышащие, лёгкие кроссовки, кроссовки EVA подошва, обувь для фитнеса мужская…',
        },
      ],
    },
  },
  {
    id: 'finance',
    label: 'P&L аналитика',
    icon: '💰',
    tagline: 'Реальная маржа',
    input: {
      title: 'Данные из маркетплейсов',
      fields: [
        { label: 'Период', value: 'Август 2026' },
        { label: 'Маркетплейсы', value: 'WB + Ozon + Яндекс Маркет' },
        { label: 'Закупочная цена (в каталоге)', value: '850 ₽ / ед.' },
        { label: 'Артикул', value: 'AIR-RUN-PRO-BLK' },
      ],
    },
    output: {
      title: 'Финансовый результат',
      sections: [
        {
          label: 'Сводка за месяц',
          color: 'text-slate-700 bg-slate-50',
          content: 'Выручка: 142 800 ₽  |  Комиссия МП: −18 564 ₽  |  Логистика: −4 284 ₽',
        },
        {
          label: 'Валовая прибыль',
          color: 'text-emerald-700 bg-emerald-50',
          content: 'Продано: 57 ед.  |  Закупка: −48 450 ₽  |  Прибыль: 71 502 ₽  |  Маржа: 50,1%',
        },
        {
          label: 'Разбивка по площадкам',
          color: 'text-blue-700 bg-blue-50',
          content: 'WB: 89 400 ₽  ·  Ozon: 34 200 ₽  ·  Яндекс Маркет: 19 200 ₽',
        },
      ],
    },
  },
  {
    id: 'price',
    label: 'Мониторинг цен',
    icon: '📊',
    tagline: 'Анализ конкурентов',
    input: {
      title: 'Что вы вводите',
      fields: [
        { label: 'Артикул WB', value: '123456789' },
        { label: 'Ваша цена', value: '2 490 ₽' },
        { label: 'Категория', value: 'Одежда → Куртки мужские' },
        { label: 'Анализ конкурентов', value: 'ТОП-10 в категории' },
      ],
    },
    output: {
      title: 'Что вы получаете',
      table: {
        headers: ['Позиция', 'Конкурент', 'Цена', 'Рейтинг', 'Отзывы'],
        rows: [
          ['#1', 'SportStyle', '1 990 ₽', '4.8', '1 204'],
          ['#3', 'AlphaWear', '2 190 ₽', '4.7', '891'],
          ['ВЫ #7', 'Ваш товар', '2 490 ₽', '4.6', '312'],
          ['#12', 'UrbanPro', '2 690 ₽', '4.5', '178'],
        ],
        highlight: 2,
      },
      recommendation: '💡 Ваша цена на 500 ₽ выше лидера. Снижение до 2 190 ₽ прогнозируемо поднимет позицию с #7 до #3–4 и увеличит продажи на ~40%.',
    },
  },
  {
    id: 'reviews',
    label: 'Ответы на отзывы',
    icon: '⭐',
    tagline: 'Ответ за 5 секунд',
    input: {
      title: 'Что вы вводите',
      fields: [
        { label: 'Оценка покупателя', value: '★★☆☆☆  2 из 5' },
        { label: 'Текст отзыва', value: 'Качество ужасное — швы разошлись через неделю. Доставка шла 12 дней, хотя обещали 3. Разочарован.' },
        { label: 'Название товара', value: 'Рюкзак туристический TrekPro 40L' },
        { label: 'Тон ответа', value: 'Вежливый, с предложением решения' },
      ],
    },
    output: {
      title: 'Что вы получаете',
      sections: [
        {
          label: 'Готовый ответ покупателю',
          color: 'text-slate-700 bg-slate-50',
          content: 'Здравствуйте! Нам жаль, что вы столкнулись с проблемой качества и задержкой. Напишите номер заказа в личные сообщения — предложим замену или возврат средств.',
        },
        {
          label: 'Рекомендация',
          color: 'text-amber-700 bg-amber-50',
          content: '⚠️ Негативный отзыв 2/5. Связаться в течение 24 часов, предложить компенсацию, зафиксировать жалобу для контроля производства.',
        },
      ],
    },
  },
];

const PLANS = [
  {
    name: 'Бесплатно',
    price: '0',
    period: 'навсегда',
    desc: 'Попробуйте все возможности без риска',
    highlight: false,
    features: [
      '10 AI-запусков в месяц',
      '1 подключение к маркетплейсу',
      'Все 9 AI-сценариев',
      'История запусков',
      '—',
      '—',
    ],
    featureLabels: [
      'AI-запусков в месяц',
      'Подключений к маркетплейсам',
      'Доступ ко всем сценариям',
      'История запусков',
      'Управление складом FBO/FBS',
      'P&L аналитика',
    ],
    featureEnabled: [true, true, true, true, false, false],
    cta: 'Начать бесплатно',
    ctaHref: '/register',
  },
  {
    name: 'Старт',
    price: '490',
    period: 'месяц',
    desc: 'Для активных продавцов',
    highlight: false,
    features: [
      '100 AI-запусков в месяц',
      '2 подключения к маркетплейсам',
      'Все 9 AI-сценариев',
      'История запусков',
      'Склад FBO/FBS',
      '—',
    ],
    featureLabels: [
      'AI-запусков в месяц',
      'Подключений к маркетплейсам',
      'Доступ ко всем сценариям',
      'История запусков',
      'Управление складом FBO/FBS',
      'P&L аналитика',
    ],
    featureEnabled: [true, true, true, true, true, false],
    cta: 'Подключить Старт',
    ctaHref: '/register',
  },
  {
    name: 'Бизнес',
    price: '990',
    period: 'месяц',
    desc: 'Для серьёзного роста',
    highlight: true,
    features: [
      'Безлимитные запуски',
      '10 подключений к маркетплейсам',
      'Все 9 AI-сценариев',
      'История запусков',
      'Склад FBO/FBS',
      'P&L аналитика',
    ],
    featureLabels: [
      'AI-запусков в месяц',
      'Подключений к маркетплейсам',
      'Доступ ко всем сценариям',
      'История запусков',
      'Управление складом FBO/FBS',
      'P&L аналитика',
    ],
    featureEnabled: [true, true, true, true, true, true],
    cta: 'Подключить Бизнес',
    ctaHref: '/register',
  },
];

/* ── UI helpers ──────────────────────────────────────────────────────────── */

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-xl shadow-slate-200/60">
      <div className="bg-slate-100 px-4 py-3 flex items-center gap-2 border-b border-slate-200">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-amber-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <div className="flex-1 mx-4 bg-white rounded-md px-3 py-1 text-xs text-slate-400 font-mono">
          neurogrid.network
        </div>
      </div>
      <div className="bg-white">{children}</div>
    </div>
  );
}

function DemoPanel({ demo }: { demo: typeof DEMOS[0] }) {
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <AppFrame>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">{demo.icon}</span>
            <div>
              <p className="font-semibold text-slate-900 text-sm">{demo.label}</p>
              <p className="text-xs text-slate-400">{demo.input.title}</p>
            </div>
          </div>
          <div className="space-y-3">
            {demo.input.fields.map((f) => (
              <div key={f.label}>
                <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                <div className={`w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 ${f.label.includes('Особенности') || f.label.includes('отзыва') ? 'leading-relaxed' : ''}`}>
                  {f.value}
                </div>
              </div>
            ))}
          </div>
          <button className="mt-5 w-full py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Запустить
          </button>
        </div>
      </AppFrame>

      <AppFrame>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Готово · 18 сек
            </span>
            <span className="text-xs text-slate-400 ml-auto">{demo.output.title}</span>
          </div>

          {'sections' in demo.output && demo.output.sections && (
            <div className="space-y-3">
              {demo.output.sections.map((s) => (
                <div key={s.label} className={`rounded-lg p-3 ${s.color.split(' ')[1]}`}>
                  <p className={`text-xs font-semibold mb-1.5 ${s.color.split(' ')[0]}`}>{s.label}</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{s.content}</p>
                </div>
              ))}
            </div>
          )}

          {'table' in demo.output && demo.output.table && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {demo.output.table.headers.map((h) => (
                        <th key={h} className="px-2.5 py-2 text-left font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {demo.output.table.rows.map((row, i) => (
                      <tr key={i} className={i === demo.output.table!.highlight ? 'bg-purple-50' : 'bg-white'}>
                        {row.map((cell, j) => (
                          <td key={j} className={`px-2.5 py-2 ${i === demo.output.table!.highlight ? 'text-purple-700 font-semibold' : 'text-slate-700'}`}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg p-3 bg-amber-50 border border-amber-100">
                <p className="text-xs text-amber-800 leading-relaxed">{demo.output.recommendation}</p>
              </div>
            </div>
          )}
        </div>
      </AppFrame>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();
  const [activeDemo, setActiveDemo] = useState(0);

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">NeuroGrid</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-600">
            <a href="#features" className="hover:text-purple-600 transition-colors">Возможности</a>
            <a href="#demo" className="hover:text-purple-600 transition-colors">Демо</a>
            <a href="#scenarios" className="hover:text-purple-600 transition-colors">Сценарии</a>
            <a href="#pricing" className="hover:text-purple-600 transition-colors">Тарифы</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors">
              Войти
            </Link>
            <Link href="/register" className="text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-lg transition-colors">
              Начать бесплатно
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6 border border-purple-100">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            AI-платформа для продавцов маркетплейсов
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight mb-6">
            Управляйте продажами<br />
            на{' '}
            <span className="text-[#CB11AB]">WB</span>{' '}
            <span className="text-[#005BFF]">Ozon</span>{' '}
            <span className="text-amber-500">Яндекс</span>{' '}
            <span className="text-[#21A038]">Мегамаркет</span><br />
            <span className="text-purple-600">с помощью AI</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            Одна платформа: 9 AI-инструментов, управление складом FBO/FBS,
            P&L аналитика и автопилот — всё синхронизируется с вашими магазинами автоматически.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors shadow-lg shadow-purple-200">
              Попробовать бесплатно
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a href="#demo" className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors border border-slate-200">
              Смотреть демо
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { value: '9', label: 'AI-сценариев' },
            { value: '4', label: 'маркетплейса' },
            { value: 'FBO + FBS', label: 'управление складом' },
            { value: 'P&L', label: 'финансовая аналитика' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-slate-900">{s.value}</p>
              <p className="text-sm text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Platforms strip ─────────────────────────────────────────────── */}
      <section className="py-10 px-4 sm:px-6 bg-white border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold text-center mb-8">
            Подключается к 4 маркетплейсам
          </p>
          <div className="flex items-center justify-center gap-6 sm:gap-10 flex-wrap">
            {PLATFORMS.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${p.bg} flex items-center justify-center font-bold text-sm ${p.text}`}>
                  {p.short}
                </div>
                <span className="font-semibold text-slate-700">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modules / Features ──────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Всё что нужно — в одном кабинете
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Не просто набор инструментов, а единая рабочая среда для продавцов маркетплейсов.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {MODULES.map((m) => (
              <div key={m.title} className={`rounded-2xl bg-gradient-to-br ${m.color} border ${m.border} p-7`}>
                <div className="text-3xl mb-4">{m.icon}</div>
                <h3 className="font-bold text-slate-900 text-xl mb-3">{m.title}</h3>
                <p className="text-slate-600 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>

          {/* Feature details */}
          <div className="mt-12 grid sm:grid-cols-3 gap-6">
            {[
              { icon: '🔄', title: 'Автосинхронизация', desc: 'Остатки обновляются каждый час, финансы — каждые 6 часов. Данные всегда актуальны без ручных выгрузок.' },
              { icon: '🔐', title: 'Безопасность', desc: 'API-ключи шифруются AES-256-GCM и никогда не передаются третьим лицам. Работаем только на чтение.' },
              { icon: '📱', title: 'Работает с телефона', desc: 'Адаптивный интерфейс — полный контроль над магазином со смартфона в любое время.' },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-xl border border-slate-200 p-5 flex gap-4">
                <div className="text-2xl shrink-0">{f.icon}</div>
                <div>
                  <p className="font-semibold text-slate-900 mb-1">{f.title}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live Demo ───────────────────────────────────────────────────── */}
      <section id="demo" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Посмотрите, как это работает
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Реальные примеры: что вводите слева — что получаете справа. Никакой магии, только конкретный результат.
            </p>
          </div>

          <div className="flex gap-2 mb-8 flex-wrap justify-center">
            {DEMOS.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setActiveDemo(i)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeDemo === i
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{d.icon}</span>
                <span>{d.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-normal ${activeDemo === i ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>
                  {d.tagline}
                </span>
              </button>
            ))}
          </div>

          <DemoPanel demo={DEMOS[activeDemo]} />

          <p className="text-center text-sm text-slate-400 mt-6">
            Примеры выше — реальный вывод AI. Ваши товары обрабатываются с таким же качеством.
          </p>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Три шага до результата</h2>
            <p className="text-slate-500 text-lg">Первый запуск — меньше пяти минут с момента регистрации</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white font-bold text-lg flex items-center justify-center mb-4">01</div>
              <h3 className="font-semibold text-slate-900 text-lg mb-2">Подключи магазин</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-4">
                Добавь API-ключ от WildBerries, Ozon, Яндекс Маркета или Мегамаркета.
                Ключи шифруются AES-256 — мы их не видим.
              </p>
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 text-xs font-mono text-slate-500 space-y-1.5">
                {PLATFORMS.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    {p.name}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white font-bold text-lg flex items-center justify-center mb-4">02</div>
              <h3 className="font-semibold text-slate-900 text-lg mb-2">Выбери сценарий</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-4">
                9 готовых AI-инструментов. Заполни форму (обычно 3–5 полей) и нажми «Запустить».
                Списание — только при успехе.
              </p>
              <div className="space-y-2">
                {['📝 Карточка товара', '📊 Мониторинг цен', '⭐ Ответы на отзывы', '📸 Генерация фото'].map((s) => (
                  <div key={s} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">{s}</div>
                ))}
                <div className="text-xs text-slate-400 px-3">+ ещё 5 сценариев</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white font-bold text-lg flex items-center justify-center mb-4">03</div>
              <h3 className="font-semibold text-slate-900 text-lg mb-2">Получи результат</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-4">
                Через 10–30 секунд — готовый текст, таблица, изображение или инфографика.
                Склад и финансы обновляются автоматически в фоне.
              </p>
              <div className="bg-green-50 rounded-xl border border-green-100 p-3 space-y-1.5">
                {['SEO-заголовок готов', 'Описание: 1 200 символов', '17 ключевых слов', 'Синхронизация склада ✓'].map((item, i) => (
                  <div key={item} className={`flex items-center gap-2 text-xs ${i === 3 ? 'text-blue-600' : 'text-green-700'}`}>
                    <CheckIcon className="w-3.5 h-3.5 shrink-0" /> {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scenarios ───────────────────────────────────────────────────── */}
      <section id="scenarios" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">9 AI-сценариев</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Каждый — готовый инструмент. Запускаешь, получаешь результат, платишь только за использование.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SCENARIOS.map((sc) => (
              <div key={sc.title} className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-50 transition-all duration-200">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">{sc.icon}</div>
                  <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">{sc.tag}</span>
                </div>
                <h3 className="font-semibold text-slate-900 text-lg mb-2">{sc.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">{sc.desc}</p>
                <span className="text-xs font-medium bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-100">
                  {sc.price} / запуск
                </span>
              </div>
            ))}
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
              <div className="text-3xl mb-3">✨</div>
              <p className="text-slate-500 text-sm font-medium">Новые сценарии</p>
              <p className="text-slate-400 text-xs mt-1">добавляются регулярно</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Warehouse & Finance ─────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Склад и финансы под контролем
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Видите полную картину бизнеса — от остатков на каждом складе до реальной маржи по артикулу.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Warehouse */}
            <div className="bg-white rounded-2xl border border-slate-200 p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl">🏭</div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Управление складом</h3>
                  <p className="text-sm text-slate-500">FBO + FBS по всем маркетплейсам</p>
                </div>
              </div>
              <div className="space-y-3 mb-5">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#CB11AB]" />
                    <span className="text-slate-700">WB FBO — Коледино</span>
                  </div>
                  <span className="font-semibold text-slate-900">142 ед.</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#005BFF]" />
                    <span className="text-slate-700">Ozon FBO — Хоругвино</span>
                  </div>
                  <span className="font-semibold text-slate-900">87 ед.</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-slate-700">Яндекс FBY — Томилино</span>
                  </div>
                  <span className="font-semibold text-slate-900">63 ед.</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl text-sm border border-green-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-slate-700">Мой склад (FBS)</span>
                  </div>
                  <span className="font-semibold text-slate-900">215 ед.</span>
                </div>
              </div>
              <ul className="space-y-1.5 text-sm text-slate-500">
                {['Закупочная цена по каждому артикулу', 'Штрих-коды для отгрузки', 'Обновление раз в час'].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 text-blue-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Finance */}
            <div className="bg-white rounded-2xl border border-slate-200 p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">💰</div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">P&L аналитика</h3>
                  <p className="text-sm text-slate-500">Финансы по каждому маркетплейсу</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { label: 'Выручка', value: '142 800 ₽', color: 'text-slate-900', bg: 'bg-slate-50' },
                  { label: 'Комиссии МП', value: '−18 564 ₽', color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Себестоимость', value: '−48 450 ₽', color: 'text-orange-600', bg: 'bg-orange-50' },
                  { label: 'Чистая прибыль', value: '71 502 ₽', color: 'text-emerald-700', bg: 'bg-emerald-50' },
                ].map((kpi) => (
                  <div key={kpi.label} className={`${kpi.bg} rounded-xl p-3`}>
                    <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
                    <p className={`font-bold text-lg ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-1.5 text-sm text-slate-500">
                {['Комиссии, логистика и штрафы отдельно', 'Маржа по каждому артикулу', 'Сводка по всем маркетплейсам сразу'].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 text-emerald-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Прозрачные тарифы</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Начните бесплатно. Подписка открывает склад, аналитику и больше запусков.
              AI-сценарии дополнительно оплачиваются за каждый запуск.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`rounded-2xl p-7 flex flex-col ${
                plan.highlight
                  ? 'bg-gradient-to-b from-purple-600 to-purple-800 text-white shadow-xl shadow-purple-200 ring-2 ring-purple-400 ring-offset-2'
                  : 'bg-white border border-slate-200'
              }`}>
                {plan.highlight && (
                  <div className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4 self-start">
                    ⭐ Популярный
                  </div>
                )}
                <h3 className={`font-bold text-xl mb-1 ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-4 ${plan.highlight ? 'text-purple-200' : 'text-slate-500'}`}>{plan.desc}</p>
                <div className="mb-6">
                  <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                    {plan.price === '0' ? 'Бесплатно' : `${plan.price} ₽`}
                  </span>
                  {plan.price !== '0' && (
                    <span className={`text-sm ml-1 ${plan.highlight ? 'text-purple-200' : 'text-slate-500'}`}>
                      / {plan.period}
                    </span>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.featureLabels.map((label, i) => (
                    <li key={label} className="flex items-center gap-2.5 text-sm">
                      {plan.featureEnabled[i] ? (
                        <CheckIcon className={`w-4 h-4 shrink-0 ${plan.highlight ? 'text-purple-200' : 'text-purple-500'}`} />
                      ) : (
                        <XIcon className={`w-4 h-4 shrink-0 ${plan.highlight ? 'text-purple-300/50' : 'text-slate-300'}`} />
                      )}
                      <span className={
                        plan.featureEnabled[i]
                          ? (plan.highlight ? 'text-purple-100' : 'text-slate-700')
                          : (plan.highlight ? 'text-purple-300/50' : 'text-slate-400')
                      }>
                        {i === 0 ? plan.features[i] : label}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link href={plan.ctaHref} className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-white text-purple-700 hover:bg-purple-50'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* Pay-per-use note */}
          <div className="mt-8 bg-slate-50 rounded-2xl border border-slate-200 p-6">
            <div className="flex items-start gap-4">
              <div className="text-2xl shrink-0">💳</div>
              <div>
                <p className="font-semibold text-slate-900 mb-1">AI-сценарии — оплата за запуск</p>
                <p className="text-sm text-slate-500 mb-3">
                  Каждый AI-сценарий оплачивается дополнительно при запуске. Пополните баланс кошелька, списание — только при успешном результате.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SCENARIOS.slice(0, 6).map((sc) => (
                    <span key={sc.title} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-600">
                      {sc.icon} {sc.title} — <span className="font-semibold text-purple-700">{sc.price}</span>
                    </span>
                  ))}
                  <span className="text-xs text-slate-400 self-center">и ещё 3…</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Payment ─────────────────────────────────────────────────────── */}
      <section className="py-12 px-4 sm:px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-7">Безопасная оплата</p>
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-[#E30613] flex items-center justify-center">
                <span className="text-white font-extrabold text-xs">PB</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-800 text-sm leading-tight">Приорбанк</p>
                <p className="text-slate-400 text-xs">Интернет-эквайринг</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-[#0050A0] flex items-center justify-center">
                <span className="text-white font-extrabold text-xs">WP</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-800 text-sm leading-tight">WebPay</p>
                <p className="text-slate-400 text-xs">Защищённый шлюз</p>
              </div>
            </div>
            {['VISA', 'Mastercard', 'Мир'].map((c) => (
              <div key={c} className="px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="font-bold text-slate-700 text-sm">{c}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-b from-white to-purple-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Начните автоматизировать продажи сегодня
          </h2>
          <p className="text-slate-500 text-lg mb-10">
            Бесплатный тариф — навсегда. 10 AI-запусков в месяц без карты и обязательств.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-10 py-4 rounded-xl text-base transition-colors shadow-lg shadow-purple-200">
              Создать аккаунт бесплатно
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link href="/login" className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-10 py-4 rounded-xl text-base transition-colors border border-slate-200">
              Уже есть аккаунт
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-10 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">N</span>
              </div>
              <span className="font-bold text-slate-900 text-lg">NeuroGrid</span>
            </div>
            <p className="text-sm text-slate-400">AI-автоматизация для продавцов маркетплейсов</p>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <Link href="/login" className="hover:text-slate-600 transition-colors">Войти</Link>
              <Link href="/register" className="hover:text-slate-600 transition-colors">Регистрация</Link>
              <Link href="/privacy" className="hover:text-slate-600 transition-colors">Политика конфиденциальности</Link>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-400">© 2026 NeuroGrid. Все права защищены.</p>
            <p className="text-xs text-slate-400">Работает с WildBerries · Ozon · Яндекс Маркет · Мегамаркет</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

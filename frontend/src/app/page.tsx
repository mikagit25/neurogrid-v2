'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, setToken, setUser } from '@/lib/auth';
import { createDemoSession, createSupportTicket, SUPPORT_TOPICS } from '@/lib/api';

/* ── Data ──────────────────────────────────────────────────────────────────── */

const PLATFORMS = [
  { short: 'WB',  name: 'WildBerries',   bg: 'bg-[#CB11AB]', text: 'text-white' },
  { short: 'OZ',  name: 'Ozon',          bg: 'bg-[#005BFF]', text: 'text-white' },
  { short: 'YM',  name: 'Яндекс Маркет', bg: 'bg-[#FFCC00]', text: 'text-slate-900' },
  { short: 'MM',  name: 'Мегамаркет',    bg: 'bg-[#21A038]', text: 'text-white' },
];

const MODULES = [
  { icon: '🏭', title: 'Склад FBO/FBS',      desc: 'Остатки со всех складов в одном окне. AI анализирует излишки, дефицит и дисбаланс FBO/FBS.' },
  { icon: '💰', title: 'Финансы и P&L',       desc: 'Реальная маржа с учётом комиссий, логистики, штрафов и закупочной цены. AI советник по прибыльности.' },
  { icon: '📦', title: 'Заказы',              desc: 'Все заказы WB и Ozon в одном интерфейсе. AI советник выявляет узкие места и экстренные задачи.' },
  { icon: '📊', title: 'Реклама',             desc: 'Синхронизация кампаний, дейпартинг, AI-биддер. Умная оптимизация ставок по целевому DRR.' },
  { icon: '📈', title: 'Аналитика продаж',    desc: 'Тренды, топ SKU, конверсии по площадкам. AI-дайджест ежедневно в Telegram или на email.' },
  { icon: '🔔', title: 'Алерты',              desc: 'Алерты на остатки, P&L, возвраты, позиции. AI настройщик подскажет оптимальные пороги.' },
  { icon: '💱', title: 'Калькулятор юнит-экономики', desc: 'Считайте маржу, ROI, точку безубыточности. AI оценщик даёт вердикт и план оптимизации.' },
  { icon: '🔄', title: 'Возвраты',            desc: 'Учёт и анализ возвратов по SKU. Причины, тренды, рекомендации по улучшению товаров.' },
  { icon: '🔗', title: 'Автоматизации',       desc: 'Готовые сценарии запускаются по расписанию. AI диагностика выявляет сбои и проблемы.' },
  { icon: '⭐', title: 'Отзывы',              desc: 'Все отзывы в одном месте. AI генерирует персонализированные ответы за 5 секунд.' },
  { icon: '🔍', title: 'SEO и конкуренты',    desc: 'Аудит карточек, анализ ключевых слов, мониторинг позиций и цен конкурентов.' },
  { icon: '🤖', title: '9 AI-сценариев',      desc: 'Карточки, фото, инфографика, SEO-аудит, анализ ниши, прогноз остатков — на-одном-клике.' },
];

const AI_ADVISORS = [
  { module: 'Склад',         name: 'AI Анализ запасов',         desc: 'Выявляет излишки, дефицит, дисбаланс FBO/FBS. Конкретные действия на 24ч.' },
  { module: 'Активность',    name: 'AI Паттерны',               desc: 'Обнаруживает аномалии в продажах, рекламе, ценах за последние 14 дней.' },
  { module: 'Заказы',        name: 'AI Советник по фулфилменту', desc: 'Анализирует узкие места, срочные заказы, рекомендует пакетную обработку.' },
  { module: 'Автоматизации', name: 'AI Диагностика',            desc: 'Оценивает здоровье всех автоматизаций, выявляет ошибки и недоиспользование.' },
  { module: 'Алерты',        name: 'AI Настройка алертов',      desc: 'Находит шумные и молчащие правила, предлагает корректировку порогов.' },
  { module: 'Калькулятор',   name: 'AI Оценка юнит-экономики',  desc: 'Вердикт healthy/warning/loss, план оптимизации по каждому рычагу затрат.' },
  { module: 'Аналитика',     name: 'AI Ежедневный дайджест',    desc: 'Сводка по выручке, топ SKU, аномалии, точки роста — каждый день в Telegram.' },
  { module: 'Реклама',       name: 'AI Биддер',                 desc: 'Автоматически корректирует ставки под целевой DRR в режиме реального времени.' },
  { module: 'Возвраты',      name: 'AI Анализ возвратов',       desc: 'Определяет корневые причины, выявляет проблемные SKU, даёт рекомендации.' },
  { module: 'Отзывы',        name: 'AI Ответы на отзывы',       desc: 'Генерирует контекстуальные ответы под тон и проблему каждого отзыва.' },
  { module: 'Финансы',       name: 'AI Рекомендации P&L',       desc: 'Сравнивает прибыльность SKU, предупреждает о убыточных товарах.' },
  { module: 'Dashboard',     name: 'AI Дашборд',                desc: 'Персональные рекомендации каждое утро: что сделать прямо сейчас для роста.' },
];

const SCENARIOS = [
  { icon: '📝', title: 'Генератор карточек',  desc: 'SEO-заголовок, описание и 15+ ключевых слов.',  price: '9,90 ₽',  tag: 'Контент' },
  { icon: '📊', title: 'Мониторинг цен',       desc: 'Позиции конкурентов и рекомендации по цене.',  price: '14,90 ₽', tag: 'Аналитика' },
  { icon: '⭐', title: 'Ответы на отзывы',     desc: 'Персонализированный ответ за 5 секунд.',       price: '4,90 ₽',  tag: 'Коммуникация' },
  { icon: '📦', title: 'Прогноз остатков',     desc: 'Предупреждение об out-of-stock за 7–14 дней.', price: '12,90 ₽', tag: 'Аналитика' },
  { icon: '🔍', title: 'SEO-аудит карточки',   desc: 'Ключевые слова, заполненность, улучшения.',    price: '7,90 ₽',  tag: 'Контент' },
  { icon: '📸', title: 'Фото-генератор',       desc: 'FLUX AI: белый фон, лайфстайл, студийные.',   price: '29,90 ₽', tag: 'Изображения' },
  { icon: '🖼️', title: 'Инфографика',          desc: 'Инфографики для WB и Ozon за 30 секунд.',      price: '19,90 ₽', tag: 'Изображения' },
  { icon: '🎬', title: 'Мульти-фото студия',   desc: 'Несколько ракурсов — AI создаёт 3D-вид.',      price: '39,90 ₽', tag: 'Изображения' },
  { icon: '🔎', title: 'Анализ ниши',          desc: 'Конкуренция, цены, точки входа по ключу.',     price: '19,90 ₽', tag: 'Аналитика' },
];

const PLANS = [
  {
    name: 'Бесплатно',
    price: '0',
    period: 'навсегда',
    desc: 'Попробуйте без риска',
    highlight: false,
    features: [
      { label: '10 AI-запусков в месяц',            ok: true  },
      { label: '1 подключение к маркетплейсу',       ok: true  },
      { label: 'Все 9 AI-сценариев',                 ok: true  },
      { label: 'История запусков',                   ok: true  },
      { label: 'Склад FBO/FBS',                      ok: false },
      { label: 'P&L аналитика',                      ok: false },
      { label: 'AI советники (6 модулей)',            ok: false },
    ],
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
      { label: '100 AI-запусков в месяц',            ok: true  },
      { label: '2 подключения к маркетплейсам',      ok: true  },
      { label: 'Все 9 AI-сценариев',                 ok: true  },
      { label: 'История запусков',                   ok: true  },
      { label: 'Склад FBO/FBS',                      ok: true  },
      { label: 'P&L аналитика',                      ok: false },
      { label: 'AI советники (6 модулей)',            ok: false },
    ],
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
      { label: 'Безлимитные AI-запуски',             ok: true  },
      { label: '10 подключений к маркетплейсам',     ok: true  },
      { label: 'Все 9 AI-сценариев',                 ok: true  },
      { label: 'История запусков',                   ok: true  },
      { label: 'Склад FBO/FBS',                      ok: true  },
      { label: 'P&L аналитика',                      ok: true  },
      { label: 'AI советники (6 модулей)',            ok: true  },
    ],
    cta: 'Подключить Бизнес',
    ctaHref: '/register',
  },
];

const STEPS = [
  { n: '1', title: 'Подключите маркетплейсы', desc: 'WildBerries, Ozon, Яндекс Маркет — вставьте API-ключи, данные загружаются автоматически.' },
  { n: '2', title: 'Запустите AI-анализ',    desc: 'Нажмите кнопку в нужном модуле. AI анализирует ваши данные и даёт конкретные рекомендации.' },
  { n: '3', title: 'Растите быстрее',        desc: 'Следуйте рекомендациям: оптимизируйте цены, пополняйте склады, улучшайте карточки.' },
];

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');

  // Contact form state
  const [contactTopic, setContactTopic]     = useState('other');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactEmail, setContactEmail]     = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactSent, setContactSent]       = useState(false);
  const [contactError, setContactError]     = useState('');

  async function handleContact(e: React.FormEvent) {
    e.preventDefault();
    setContactError(''); setContactLoading(true);
    try {
      await createSupportTicket({ topic: contactTopic, subject: contactSubject, message: contactMessage, email: contactEmail });
      setContactSent(true);
      setContactSubject(''); setContactMessage(''); setContactEmail('');
    } catch (err: any) { setContactError(err.message || 'Ошибка отправки'); }
    finally { setContactLoading(false); }
  }

  async function handleDemo() {
    if (isAuthenticated()) {
      router.push('/dashboard');
      return;
    }
    setDemoLoading(true);
    setDemoError('');
    try {
      const { token, user } = await createDemoSession();
      const { setToken } = await import('@/lib/auth');
      setToken(token);
      setUser({
        id: user.id,
        email: user.email,
        balance: user.balance,
        isAdmin: user.is_admin ?? false,
        isDemo: user.is_demo,
        demoExpiresAt: user.demo_expires_at,
      });
      router.push('/dashboard');
    } catch (err: any) {
      setDemoError(err.message || 'Ошибка создания демо');
      setDemoLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="font-bold text-xl text-slate-900 tracking-tight">
            Neuro<span className="text-purple-600">Grid</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Возможности</a>
            <a href="#ai"       className="hover:text-slate-900 transition-colors">AI-советники</a>
            <a href="#pricing"  className="hover:text-slate-900 transition-colors">Тарифы</a>
            <a href="#contact"  className="hover:text-slate-900 transition-colors">Написать нам</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              Войти
            </Link>
            <button
              onClick={handleDemo}
              disabled={demoLoading}
              className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60"
            >
              {demoLoading ? 'Загрузка...' : 'Демо'}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-blue-50 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-purple-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
            12 AI-советников + 9 AI-сценариев
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight mb-6 tracking-tight">
            AI-платформа для<br />
            <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              продавцов маркетплейсов
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-slate-600 mb-10 leading-relaxed">
            Управляйте складом, финансами, рекламой и контентом на WB, Ozon, Яндекс Маркет и Мегамаркет — с AI-советниками в каждом модуле.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <button
              onClick={handleDemo}
              disabled={demoLoading}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-lg shadow-lg shadow-purple-200 transition-all hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
            >
              {demoLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Создаём демо-аккаунт...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Войти в живое демо
                </>
              )}
            </button>
            <Link
              href="/register"
              className="w-full sm:w-auto flex items-center justify-center px-8 py-4 bg-white border-2 border-slate-200 hover:border-purple-300 text-slate-700 rounded-xl font-semibold text-lg transition-all hover:shadow-md"
            >
              Зарегистрироваться бесплатно
            </Link>
          </div>

          {demoError && (
            <p className="text-red-600 text-sm mt-2">{demoError}</p>
          )}

          <p className="text-sm text-slate-400 mt-3">
            Демо: изолированный аккаунт с реальными данными, живёт 2 часа. Без карты.
          </p>

          {/* Stats strip */}
          <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { n: '12+', label: 'AI-советников' },
              { n: '9',   label: 'AI-сценариев' },
              { n: '4',   label: 'маркетплейса' },
              { n: '2 мин', label: 'до первого результата' },
            ].map(s => (
              <div key={s.n} className="text-center">
                <div className="text-3xl font-extrabold text-purple-600">{s.n}</div>
                <div className="text-sm text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platforms strip ────────────────────────────────────────────────── */}
      <section className="border-y border-slate-100 bg-slate-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-sm text-slate-400 mb-4">Работает с маркетплейсами</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {PLATFORMS.map(p => (
              <div key={p.short} className={`flex items-center gap-2 px-4 py-2 rounded-xl ${p.bg} ${p.text} font-semibold text-sm shadow-sm`}>
                <span className="text-base font-bold">{p.short}</span>
                <span className="font-medium">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo CTA block ─────────────────────────────────────────────────── */}
      <section className="py-16 bg-gradient-to-br from-purple-600 to-blue-700 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Посмотрите на реальный дашборд — прямо сейчас
          </h2>
          <p className="text-purple-100 text-lg mb-8 max-w-2xl mx-auto">
            Кликните «Войти в демо» — мы создадим изолированный аккаунт с 90 днями реалистичных данных, складом, финансами, рекламой и активными алертами.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8 text-sm">
            {[
              { icon: '⚡', text: 'Аккаунт создаётся за 2 секунды' },
              { icon: '🔒', text: 'Полная изоляция — только ваши данные' },
              { icon: '⏰', text: 'Сессия живёт 2 часа, без регистрации' },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-3">
                <span className="text-xl">{f.icon}</span>
                <span className="text-white/90">{f.text}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleDemo}
            disabled={demoLoading}
            className="inline-flex items-center gap-2 px-10 py-4 bg-white text-purple-700 rounded-xl font-bold text-lg hover:bg-purple-50 transition-all hover:scale-[1.02] shadow-xl disabled:opacity-60 disabled:hover:scale-100"
          >
            {demoLoading ? 'Создаём демо...' : '▶  Войти в живое демо'}
          </button>
        </div>
      </section>

      {/* ── Modules grid ───────────────────────────────────────────────────── */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Всё для управления продажами</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">12 модулей — от склада до отзывов. В каждом — AI-советник, который анализирует ваши данные.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {MODULES.map(m => (
              <div key={m.title} className="p-5 rounded-2xl border border-slate-100 hover:border-purple-200 hover:shadow-md transition-all group bg-white">
                <div className="text-3xl mb-3">{m.icon}</div>
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-purple-700 transition-colors">{m.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Advisors section ─────────────────────────────────────────────── */}
      <section id="ai" className="py-20 bg-gradient-to-br from-slate-50 to-purple-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-4">
              🤖 12 AI-советников
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">AI внутри каждого модуля</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">Не просто данные — конкретные рекомендации. Жмёте одну кнопку, получаете план действий.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AI_ADVISORS.map(a => (
              <div key={a.name} className="p-5 rounded-2xl bg-white border border-slate-100 hover:border-purple-200 hover:shadow-md transition-all">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-xs text-purple-600 font-medium uppercase tracking-wide">{a.module}</span>
                    <h3 className="font-semibold text-slate-900 text-sm mt-0.5 mb-1">{a.name}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{a.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scenarios ──────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">9 AI-сценариев по требованию</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">Запускаете по необходимости. Платите только за результат.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SCENARIOS.map(s => (
              <div key={s.title} className="p-5 rounded-2xl border border-slate-100 hover:border-purple-200 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-2xl">{s.icon}</div>
                  <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full font-medium">{s.tag}</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1.5 group-hover:text-purple-700 transition-colors">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-3">{s.desc}</p>
                <span className="text-sm font-semibold text-purple-600">{s.price} / запуск</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Как начать</h2>
            <p className="text-slate-500 text-lg">Три шага — и AI уже анализирует ваш бизнес.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map(s => (
              <div key={s.n} className="text-center">
                <div className="w-14 h-14 bg-purple-600 text-white rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg shadow-purple-200">
                  {s.n}
                </div>
                <h3 className="font-semibold text-slate-900 text-lg mb-2">{s.title}</h3>
                <p className="text-slate-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Тарифы</h2>
            <p className="text-slate-500 text-lg">Начните бесплатно, переходите когда готовы.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-6 flex flex-col ${
                  plan.highlight
                    ? 'border-purple-400 shadow-xl shadow-purple-100 bg-gradient-to-b from-purple-50 to-white relative'
                    : 'border-slate-200'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-purple-600 text-white text-xs font-semibold rounded-full">
                    Популярный
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="font-bold text-slate-900 text-xl mb-1">{plan.name}</h3>
                  <p className="text-slate-500 text-sm mb-4">{plan.desc}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                    {plan.price !== '0' && <span className="text-slate-400">₽</span>}
                    <span className="text-slate-400 ml-1">/ {plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map(f => (
                    <li key={f.label} className="flex items-center gap-3 text-sm">
                      {f.ok ? (
                        <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <span className={f.ok ? 'text-slate-700' : 'text-slate-400'}>{f.label}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.ctaHref}
                  className={`w-full text-center py-3 rounded-xl font-semibold transition-all ${
                    plan.highlight
                      ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-slate-400 mt-8">
            Оплата банковской картой, ЮKassa, Robokassa, USDT
          </p>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-purple-600 to-blue-700 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Начните прямо сейчас</h2>
          <p className="text-purple-100 text-lg mb-8">
            Войдите в демо — посмотрите на реальный дашборд с данными. Без регистрации, без карты.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleDemo}
              disabled={demoLoading}
              className="w-full sm:w-auto px-8 py-4 bg-white text-purple-700 rounded-xl font-bold text-lg hover:bg-purple-50 transition-all hover:scale-[1.02] shadow-xl disabled:opacity-60"
            >
              {demoLoading ? 'Создаём...' : '▶  Войти в демо'}
            </button>
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-4 border-2 border-white/40 text-white rounded-xl font-semibold text-lg hover:border-white hover:bg-white/10 transition-all"
            >
              Зарегистрироваться бесплатно
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contact form ───────────────────────────────────────────────────── */}
      <section id="contact" className="py-20 bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Свяжитесь с нами</h2>
            <p className="text-slate-500">Есть вопрос, предложение или нужна помощь? Напишите — ответим в течение рабочего дня.</p>
          </div>

          {contactSent ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">✓</div>
              <h3 className="text-lg font-semibold text-green-800 mb-1">Сообщение отправлено!</h3>
              <p className="text-green-700 text-sm">Мы свяжемся с вами по указанному email в ближайшее время.</p>
              <button onClick={() => setContactSent(false)} className="mt-4 text-sm text-green-600 hover:underline">
                Отправить ещё одно сообщение
              </button>
            </div>
          ) : (
            <form onSubmit={handleContact} className="bg-slate-50 border border-slate-200 rounded-2xl p-8 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Тема обращения</label>
                  <select
                    value={contactTopic}
                    onChange={e => setContactTopic(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {SUPPORT_TOPICS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ваш email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Краткое описание</label>
                <input
                  type="text"
                  value={contactSubject}
                  onChange={e => setContactSubject(e.target.value)}
                  placeholder="О чём хотите написать?"
                  required
                  maxLength={200}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Сообщение</label>
                <textarea
                  value={contactMessage}
                  onChange={e => setContactMessage(e.target.value)}
                  placeholder="Опишите ваш вопрос или предложение..."
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={5}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                />
              </div>

              {contactError && <p className="text-red-600 text-sm">{contactError}</p>}

              <button
                type="submit"
                disabled={contactLoading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
              >
                {contactLoading ? 'Отправка...' : 'Отправить сообщение'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="font-bold text-white text-lg mb-3">
                Neuro<span className="text-purple-400">Grid</span>
              </div>
              <p className="text-sm leading-relaxed">AI-платформа для продавцов WB, Ozon, Яндекс Маркет и Мегамаркет.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">Продукт</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Возможности</a></li>
                <li><a href="#ai"       className="hover:text-white transition-colors">AI-советники</a></li>
                <li><a href="#pricing"  className="hover:text-white transition-colors">Тарифы</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">Начать</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/register" className="hover:text-white transition-colors">Регистрация</Link></li>
                <li><Link href="/login"    className="hover:text-white transition-colors">Войти</Link></li>
                <li>
                  <button onClick={handleDemo} className="hover:text-white transition-colors text-left">
                    Демо-аккаунт
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">Контакты</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="https://t.me/neurogrid_support" className="hover:text-white transition-colors">Telegram поддержка</a></li>
                <li><a href="mailto:support@neurogrid.network" className="hover:text-white transition-colors">support@neurogrid.network</a></li>
                <li><a href="#contact" className="hover:text-white transition-colors">Написать нам</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <p>© {new Date().getFullYear()} NeuroGrid. Все права защищены.</p>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-white transition-colors">Политика конфиденциальности</Link>
              <Link href="/oferta"  className="hover:text-white transition-colors">Публичный договор</Link>
              <Link href="/terms"   className="hover:text-white transition-colors">Условия использования</Link>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

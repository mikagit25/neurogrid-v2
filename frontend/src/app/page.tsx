'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated } from '@/lib/auth';

const SCENARIOS = [
  {
    icon: '📝',
    title: 'Генератор карточек',
    desc: 'SEO-оптимизированные заголовки, описания и характеристики для WB и Ozon за секунды.',
    price: '9,90 ₽',
  },
  {
    icon: '📊',
    title: 'Мониторинг цен',
    desc: 'Сравнивает твои цены с конкурентами и даёт конкретные рекомендации по репрайсингу.',
    price: '14,90 ₽',
  },
  {
    icon: '⭐',
    title: 'Ответы на отзывы',
    desc: 'Генерирует персонализированные ответы на негативные отзывы — вежливо и по делу.',
    price: '4,90 ₽',
  },
  {
    icon: '📦',
    title: 'Прогноз остатков',
    desc: 'Анализирует скорость продаж и предупреждает об out-of-stock за 7–14 дней.',
    price: '12,90 ₽',
  },
  {
    icon: '🔍',
    title: 'SEO-аудит',
    desc: 'Проверяет карточку на ключевые слова, заполненность и даёт список правок.',
    price: '7,90 ₽',
  },
  {
    icon: '📸',
    title: 'Фото-генератор',
    desc: 'FLUX AI создаёт профессиональные фото товара с любым фоном и стилем.',
    price: '29,90 ₽',
  },
  {
    icon: '🖼️',
    title: 'Инфографика',
    desc: 'Готовые шаблоны инфографики для WB (1000×1000) и Ozon (1200×900) с вашими данными.',
    price: '19,90 ₽',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Подключи магазин',
    desc: 'Добавь API-ключ WildBerries или Client ID / API Key от Ozon — займёт 2 минуты.',
  },
  {
    num: '02',
    title: 'Запусти сценарий',
    desc: 'Выбери нужный AI-инструмент, заполни форму и нажми «Запустить».',
  },
  {
    num: '03',
    title: 'Получи результат',
    desc: 'Через несколько секунд — готовый текст, таблица, фото или инфографика для загрузки.',
  },
];

const STATS = [
  { value: '7', label: 'AI-сценариев' },
  { value: 'WB + Ozon', label: 'маркетплейсы' },
  { value: '< 30с', label: 'время выполнения' },
  { value: 'от 4,90 ₽', label: 'за запуск' },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">NeuroGrid</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#scenarios" className="hover:text-purple-600 transition-colors">Сценарии</a>
            <a href="#how" className="hover:text-purple-600 transition-colors">Как это работает</a>
            <a href="#pricing" className="hover:text-purple-600 transition-colors">Цены</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Войти
            </Link>
            <Link
              href="/register"
              className="text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
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
            AI-автоматизация для продавцов маркетплейсов
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight mb-6">
            Больше продаж на{' '}
            <span className="text-purple-600">WildBerries</span>{' '}
            и{' '}
            <span className="text-purple-600">Ozon</span>
            <br />с помощью AI
          </h1>
          <p className="text-lg sm:text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            7 готовых AI-сценариев: создавай карточки товаров, отвечай на отзывы, следи за ценами,
            генерируй фото и инфографику — без подрядчиков и дизайнеров.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors shadow-lg shadow-purple-200"
            >
              Попробовать бесплатно
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="#scenarios"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors border border-slate-200"
            >
              Смотреть сценарии
            </a>
          </div>
        </div>

        {/* Stats row */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-slate-900">{s.value}</p>
              <p className="text-sm text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Scenarios ───────────────────────────────────────────────────── */}
      <section id="scenarios" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">AI-сценарии</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Каждый сценарий — готовый инструмент. Запускаешь, получаешь результат, платишь только за использование.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SCENARIOS.map((sc) => (
              <div
                key={sc.title}
                className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-50 transition-all duration-200"
              >
                <div className="text-3xl mb-4">{sc.icon}</div>
                <h3 className="font-semibold text-slate-900 text-lg mb-2">{sc.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">{sc.desc}</p>
                <span className="text-xs font-medium bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-100">
                  {sc.price} / запуск
                </span>
              </div>
            ))}
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
              <div className="text-3xl mb-3">✨</div>
              <p className="text-slate-400 text-sm font-medium">Новые сценарии</p>
              <p className="text-slate-400 text-xs mt-1">добавляются регулярно</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Как это работает</h2>
            <p className="text-slate-500 text-lg">Три шага до первого результата</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-10">
            {STEPS.map((step, i) => (
              <div key={step.num} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block absolute top-6 left-12 right-0 h-px bg-slate-200 -translate-y-px" />
                )}
                <div className="w-12 h-12 rounded-xl bg-purple-600 text-white font-bold text-lg flex items-center justify-center mb-5 relative z-10">
                  {step.num}
                </div>
                <h3 className="font-semibold text-slate-900 text-xl mb-2">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Прозрачные цены</h2>
            <p className="text-slate-500 text-lg">Никаких подписок. Платишь только за то, что запускаешь.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8">
              <h3 className="font-bold text-slate-900 text-xl mb-2">Pay-as-you-go</h3>
              <p className="text-slate-500 text-sm mb-6">Пополняй баланс и трать по мере необходимости.</p>
              <ul className="space-y-3 text-sm text-slate-600">
                {[
                  'Пополнение от 100 ₽',
                  'Списание только при успешном запуске',
                  'История всех запусков и транзакций',
                  'Оплата через WebPay — Приорбанк',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-8 text-white">
              <h3 className="font-bold text-xl mb-2">Стоимость сценариев</h3>
              <p className="text-purple-200 text-sm mb-6">Фиксированная цена за каждый запуск</p>
              <ul className="space-y-2.5 text-sm">
                {SCENARIOS.map((sc) => (
                  <li key={sc.title} className="flex items-center justify-between">
                    <span className="text-purple-100">{sc.icon} {sc.title}</span>
                    <span className="font-semibold">{sc.price}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Platforms & Payment ─────────────────────────────────────────── */}
      <section className="py-14 px-4 sm:px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-400 text-sm uppercase tracking-wider font-medium mb-8">Работает с маркетплейсами</p>
          <div className="flex items-center justify-center gap-12 flex-wrap mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#CB11AB] flex items-center justify-center text-white font-bold text-sm">WB</div>
              <span className="font-semibold text-slate-700 text-lg">WildBerries</span>
            </div>
            <div className="w-px h-8 bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#005BFF] flex items-center justify-center text-white font-bold text-sm">OZ</div>
              <span className="font-semibold text-slate-700 text-lg">Ozon</span>
            </div>
          </div>

          <div className="w-full h-px bg-slate-200 mb-10" />

          <p className="text-slate-400 text-sm uppercase tracking-wider font-medium mb-8">Безопасная оплата</p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            {/* Priorbank badge */}
            <div className="flex items-center gap-3 px-5 py-3 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-[#E30613] flex items-center justify-center shrink-0">
                <span className="text-white font-extrabold text-xs tracking-tight">PB</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-800 text-sm leading-tight">Приорбанк</p>
                <p className="text-slate-400 text-xs">Интернет-эквайринг</p>
              </div>
            </div>
            {/* WebPay badge */}
            <div className="flex items-center gap-3 px-5 py-3 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-[#0050A0] flex items-center justify-center shrink-0">
                <span className="text-white font-extrabold text-xs tracking-tight">WP</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-800 text-sm leading-tight">WebPay</p>
                <p className="text-slate-400 text-xs">Защищённый шлюз</p>
              </div>
            </div>
            {/* Card badges */}
            <div className="flex items-center gap-2">
              <div className="px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="font-bold text-[#1A1F71] text-sm tracking-tight">VISA</span>
              </div>
              <div className="px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="font-bold text-slate-700 text-sm">Mastercard</span>
              </div>
              <div className="px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                <span className="font-bold text-slate-700 text-sm">Мир</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Готов автоматизировать продажи?
          </h2>
          <p className="text-slate-500 text-lg mb-10">
            Зарегистрируйся, пополни баланс от 100 ₽ и запусти первый AI-сценарий уже сегодня.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-10 py-4 rounded-xl text-base transition-colors shadow-lg shadow-purple-200"
            >
              Создать аккаунт
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-10 py-4 rounded-xl text-base transition-colors border border-slate-200"
            >
              Уже есть аккаунт
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">N</span>
            </div>
            <span className="font-semibold text-slate-700">NeuroGrid</span>
          </div>
          <p className="text-sm text-slate-400">© 2026 NeuroGrid. AI-автоматизация маркетплейсов.</p>
          <div className="flex items-center gap-5 text-sm text-slate-400">
            <Link href="/login" className="hover:text-slate-600 transition-colors">Войти</Link>
            <Link href="/register" className="hover:text-slate-600 transition-colors">Регистрация</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

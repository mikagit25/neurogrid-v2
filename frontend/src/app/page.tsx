'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated } from '@/lib/auth';

/* ── Demo data ──────────────────────────────────────────────────────────── */

const DEMOS = [
  {
    id: 'card',
    label: 'Генератор карточек',
    icon: '📝',
    tagline: 'SEO-текст за 20 секунд',
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
          content: 'Мужские кроссовки Air Run Pro — идеальный выбор для активного образа жизни. Ультралёгкая подошва из EVA обеспечивает мягкую амортизацию при беге. Дышащий верх из перфорированной сетки поддерживает оптимальный микроклимат стопы в любую погоду. Доступны в 5 цветах, размерный ряд 40–46.',
        },
        {
          label: 'Ключевые слова (17 шт.)',
          color: 'text-green-700 bg-green-50',
          content: 'кроссовки мужские, спортивная обувь для бега, кроссовки дышащие, лёгкие кроссовки 2025, кроссовки EVA подошва, обувь для фитнеса мужская…',
        },
      ],
    },
  },
  {
    id: 'reviews',
    label: 'Ответы на отзывы',
    icon: '⭐',
    tagline: 'Персональный ответ за 5 секунд',
    input: {
      title: 'Что вы вводите',
      fields: [
        { label: 'Оценка покупателя', value: '★★☆☆☆  2 из 5' },
        { label: 'Текст отзыва', value: 'Качество ужасное — швы разошлись через неделю. Доставка шла 12 дней, хотя обещали 3. Разочарован полностью, больше здесь не куплю.' },
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
          content: 'Здравствуйте! Благодарим вас за отзыв — это помогает нам становиться лучше. Нам очень жаль, что вы столкнулись с проблемой качества и задержкой доставки. Каждый случай брака мы рассматриваем индивидуально. Пожалуйста, напишите нам номер заказа в личные сообщения — мы предложим замену товара или полный возврат средств. Ваш опыт для нас важен!',
        },
        {
          label: 'Рекомендация по работе с отзывом',
          color: 'text-amber-700 bg-amber-50',
          content: '⚠️ Негативный отзыв с оценкой 2/5. Рекомендуется: связаться с покупателем в течение 24 часов, предложить компенсацию, зафиксировать жалобу о качестве шва для контроля производства.',
        },
      ],
    },
  },
  {
    id: 'price',
    label: 'Мониторинг цен',
    icon: '📊',
    tagline: 'Анализ конкурентов по артикулу',
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
      recommendation: '💡 Ваша цена на 500 ₽ выше лидера категории. Снижение до 2 190 ₽ прогнозируемо поднимет позицию с #7 до #3–4 и увеличит продажи на ~40%. Оптимальный диапазон: 2 090–2 250 ₽.',
    },
  },
];

const SCENARIOS = [
  { icon: '📝', title: 'Генератор карточек', desc: 'SEO-заголовок, описание и 15+ ключевых слов для WB и Ozon.', price: '9,90 ₽' },
  { icon: '📊', title: 'Мониторинг цен', desc: 'Сравнение с конкурентами и рекомендации по репрайсингу.', price: '14,90 ₽' },
  { icon: '⭐', title: 'Ответы на отзывы', desc: 'Персонализированные ответы на любые отзывы за 5 секунд.', price: '4,90 ₽' },
  { icon: '📦', title: 'Прогноз остатков', desc: 'Предупредит об out-of-stock за 7–14 дней по скорости продаж.', price: '12,90 ₽' },
  { icon: '🔍', title: 'SEO-аудит', desc: 'Проверка карточки на ключевые слова и заполненность.', price: '7,90 ₽' },
  { icon: '📸', title: 'Фото-генератор', desc: 'FLUX AI создаёт профессиональные фото товара с любым фоном.', price: '29,90 ₽' },
  { icon: '🖼️', title: 'Инфографика', desc: 'Готовые инфографики для WB (1000×1000) и Ozon (1200×900).', price: '19,90 ₽' },
];

const STATS = [
  { value: '7', label: 'AI-сценариев' },
  { value: 'WB + Ozon', label: 'маркетплейсы' },
  { value: '< 30с', label: 'время выполнения' },
  { value: 'от 4,90 ₽', label: 'за запуск' },
];

/* ── Small UI components ─────────────────────────────────────────────────── */

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

/* ── Mock browser / app frame ────────────────────────────────────────────── */
function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-xl shadow-slate-200/60">
      <div className="bg-slate-100 px-4 py-3 flex items-center gap-2 border-b border-slate-200">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-amber-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <div className="flex-1 mx-4 bg-white rounded-md px-3 py-1 text-xs text-slate-400 font-mono">
          neurogrid.network/dashboard
        </div>
      </div>
      <div className="bg-white">{children}</div>
    </div>
  );
}

/* ── Demo panel ─────────────────────────────────────────────────────────── */
function DemoPanel({ demo }: { demo: typeof DEMOS[0] }) {
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* Input side */}
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
                {f.label === 'Текст отзыва' || f.label === 'Особенности' ? (
                  <div className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed">
                    {f.value}
                  </div>
                ) : (
                  <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                    {f.value}
                  </div>
                )}
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

      {/* Output side */}
      <AppFrame>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Готово · 18 сек
            </span>
            <span className="text-xs text-slate-400 ml-auto">{demo.output.title}</span>
          </div>

          {demo.output.sections && (
            <div className="space-y-3">
              {demo.output.sections.map((s) => (
                <div key={s.label} className={`rounded-lg p-3 ${s.color.split(' ')[1]}`}>
                  <p className={`text-xs font-semibold mb-1.5 ${s.color.split(' ')[0]}`}>{s.label}</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{s.content}</p>
                </div>
              ))}
            </div>
          )}

          {demo.output.table && (
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
                      <tr
                        key={i}
                        className={i === demo.output.table!.highlight ? 'bg-purple-50' : 'bg-white'}
                      >
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className={`px-2.5 py-2 ${
                              i === demo.output.table!.highlight
                                ? 'text-purple-700 font-semibold'
                                : 'text-slate-700'
                            }`}
                          >
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

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();
  const [activeDemo, setActiveDemo] = useState(0);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">NeuroGrid</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#demo" className="hover:text-purple-600 transition-colors">Примеры</a>
            <a href="#scenarios" className="hover:text-purple-600 transition-colors">Сценарии</a>
            <a href="#pricing" className="hover:text-purple-600 transition-colors">Цены</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors">
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

      {/* ── Hero ───────────────────────────────────────────────────────── */}
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
            7 готовых AI-инструментов: карточки товаров, ответы на отзывы, мониторинг цен,
            прогноз остатков, SEO-аудит, фото и инфографика — за секунды, без подрядчиков.
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
              href="#demo"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors border border-slate-200"
            >
              Смотреть примеры
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-slate-900">{s.value}</p>
              <p className="text-sm text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live Demo ──────────────────────────────────────────────────── */}
      <section id="demo" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Посмотри, как это работает
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Реальные примеры: что вы вводите слева — что получаете справа. Никакой магии, только конкретный результат.
            </p>
          </div>

          {/* Tabs */}
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
                <span className={`text-xs px-2 py-0.5 rounded-full font-normal ${
                  activeDemo === i ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
                }`}>
                  {d.tagline}
                </span>
              </button>
            ))}
          </div>

          <DemoPanel demo={DEMOS[activeDemo]} />

          <p className="text-center text-sm text-slate-400 mt-6">
            Примеры выше — реальный вывод AI. Ваши товары и данные обрабатываются с таким же качеством.
          </p>
        </div>
      </section>

      {/* ── How it works (visual) ──────────────────────────────────────── */}
      <section id="how" className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Три шага до результата</h2>
            <p className="text-slate-500 text-lg">Первый запуск — меньше пяти минут с момента регистрации</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 relative">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white font-bold text-lg flex items-center justify-center mb-4">
                01
              </div>
              <h3 className="font-semibold text-slate-900 text-lg mb-2">Подключи магазин</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-4">
                Добавь API-ключ от WildBerries или Client ID + API Key от Ozon.
                Ключи шифруются AES-256, мы их не видим.
              </p>
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 text-xs font-mono text-slate-500 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  WildBerries · Seller API key
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  Ozon · Client ID + Admin key
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 relative">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white font-bold text-lg flex items-center justify-center mb-4">
                02
              </div>
              <h3 className="font-semibold text-slate-900 text-lg mb-2">Выбери сценарий</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-4">
                Открой нужный AI-инструмент, заполни форму (обычно 3–5 полей)
                и нажми «Запустить». Списание только при успехе.
              </p>
              <div className="space-y-2">
                {['📝 Генератор карточек', '⭐ Ответы на отзывы', '📊 Мониторинг цен'].map((s) => (
                  <div key={s} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">
                    {s}
                  </div>
                ))}
                <div className="text-xs text-slate-400 px-3">+ ещё 4 сценария</div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 relative">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white font-bold text-lg flex items-center justify-center mb-4">
                03
              </div>
              <h3 className="font-semibold text-slate-900 text-lg mb-2">Получи результат</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-4">
                Через 10–30 секунд — готовый текст, таблица, изображение или инфографика.
                Копируй и используй прямо в маркетплейсе.
              </p>
              <div className="bg-green-50 rounded-xl border border-green-100 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <CheckIcon className="w-3.5 h-3.5" /> SEO-заголовок готов
                </div>
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <CheckIcon className="w-3.5 h-3.5" /> Описание: 1 200 символов
                </div>
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <CheckIcon className="w-3.5 h-3.5" /> 17 ключевых слов
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-3.5 h-3.5 flex items-center justify-center">₽</span> Списано 9,90 ₽
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scenarios ──────────────────────────────────────────────────── */}
      <section id="scenarios" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">AI-сценарии</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Каждый — готовый инструмент. Запускаешь, получаешь результат, платишь только за использование.
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

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Прозрачные цены</h2>
            <p className="text-slate-500 text-lg">Никаких подписок. Платишь только за то, что запускаешь.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-8">
              <h3 className="font-bold text-slate-900 text-xl mb-2">Pay-as-you-go</h3>
              <p className="text-slate-500 text-sm mb-6">Пополняй баланс и трать по мере необходимости.</p>
              <ul className="space-y-3 text-sm text-slate-600">
                {[
                  'Пополнение от 100 ₽',
                  'Списание только при успешном запуске',
                  'История всех запусков и транзакций',
                  'Оплата через WebPay — Приорбанк',
                  'Visa, Mastercard, Мир',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckIcon className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
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
      <section className="py-14 px-4 sm:px-6 bg-white border-y border-slate-100">
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
            <div className="flex items-center gap-3 px-5 py-3 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-[#E30613] flex items-center justify-center shrink-0">
                <span className="text-white font-extrabold text-xs tracking-tight">PB</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-800 text-sm leading-tight">Приорбанк</p>
                <p className="text-slate-400 text-xs">Интернет-эквайринг</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-3 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-[#0050A0] flex items-center justify-center shrink-0">
                <span className="text-white font-extrabold text-xs tracking-tight">WP</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-800 text-sm leading-tight">WebPay</p>
                <p className="text-slate-400 text-xs">Защищённый шлюз</p>
              </div>
            </div>
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

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-b from-white to-slate-50">
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

      {/* ── Footer ─────────────────────────────────────────────────────── */}
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

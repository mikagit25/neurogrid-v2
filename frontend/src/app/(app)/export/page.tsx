'use client';

import { useState } from 'react';

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(d: number) { return new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10); }

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? '';

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

interface ExportItem {
  icon: string;
  title: string;
  desc: string;
  url: (from: string, to: string) => string;
  hasPeriod: boolean;
  category: string;
}

const EXPORTS: ExportItem[] = [
  {
    icon: '💰',
    title: 'Финансы (P&L)',
    desc: 'Выручка, комиссии, логистика, штрафы, выплата — по каждой записи',
    url: (from, to) => `${BACKEND}/api/finance/export?from=${from}&to=${to}`,
    hasPeriod: true,
    category: 'Финансы',
  },
  {
    icon: '📊',
    title: 'P&L по товарам',
    desc: 'Себестоимость, прибыль и маржа по каждому SKU',
    url: (from) => {
      const period = '30d';
      return `${BACKEND}/api/pnl/export?period=${period}&from=${from}`;
    },
    hasPeriod: false,
    category: 'Финансы',
  },
  {
    icon: '📦',
    title: 'Заказы и отгрузка',
    desc: 'Список заказов с суммами, статусами и площадками',
    url: (from, to) => `${BACKEND}/api/orders/export?from=${from}&to=${to}`,
    hasPeriod: true,
    category: 'Заказы',
  },
  {
    icon: '🛍️',
    title: 'Каталог товаров',
    desc: 'Все SKU, названия, цены, остатки, Listing Score',
    url: () => `${BACKEND}/api/products/export`,
    hasPeriod: false,
    category: 'Товары',
  },
  {
    icon: '🏭',
    title: 'Закупочные цены',
    desc: 'Себестоимость товаров из каталога склада',
    url: () => `${BACKEND}/api/warehouse/purchase-prices/export`,
    hasPeriod: false,
    category: 'Склад',
  },
  {
    icon: '🚚',
    title: 'Поставки / Заказ у поставщика',
    desc: 'Рекомендованный заказ с учётом остатков и прогноза',
    url: () => `${BACKEND}/api/supply/export`,
    hasPeriod: false,
    category: 'Склад',
  },
  {
    icon: '🔍',
    title: 'SEO — ключевые слова',
    desc: 'Позиции ключевых слов по всем отслеживаемым SKU',
    url: () => `${BACKEND}/api/seo/export/keywords`,
    hasPeriod: false,
    category: 'SEO',
  },
  {
    icon: '⭐',
    title: 'SEO — Listing Score',
    desc: 'Оценка качества карточек по каждому товару',
    url: () => `${BACKEND}/api/seo/export/scores`,
    hasPeriod: false,
    category: 'SEO',
  },
];

const PERIOD_OPTIONS = [
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
  { label: '90 дней', days: 90 },
  { label: '6 месяцев', days: 180 },
];

const CATEGORIES = ['Финансы', 'Заказы', 'Товары', 'Склад', 'SEO'];

export default function ExportPage() {
  const [periodDays, setPeriodDays] = useState(30);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const from = daysAgo(periodDays);
  const to = today();

  const filtered = activeCategory ? EXPORTS.filter(e => e.category === activeCategory) : EXPORTS;

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = filtered.filter(e => e.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {} as Record<string, ExportItem[]>);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Экспорт данных</h1>
        <p className="text-slate-500 text-sm mt-0.5">Скачайте данные в формате CSV для анализа в Excel или Google Sheets</p>
      </div>

      {/* Period + category controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs text-slate-500 mb-1.5 font-medium">Период</p>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setPeriodDays(opt.days)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${periodDays === opt.days ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1.5 font-medium">Категория</p>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setActiveCategory(null)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeCategory === null ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Все
            </button>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeCategory === cat ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date range info */}
      <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Период для отчётов с датой: <strong className="text-slate-700">{from}</strong> — <strong className="text-slate-700">{to}</strong>
      </div>

      {/* Export cards by category */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{category}</h2>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.title}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xl flex-shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  {item.hasPeriod && (
                    <p className="text-xs text-purple-500 mt-0.5">Период: {from} — {to}</p>
                  )}
                </div>
                <a
                  href={item.url(from, to)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <DownloadIcon />
                  CSV
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Unified XLS export */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Полный экспорт</h2>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-2xl flex-shrink-0">
            📊
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-purple-900">Единый XLS-файл (4 листа)</p>
            <p className="text-sm text-purple-700 mt-0.5">
              Финансы · P&L по SKU · Остатки склада · Закупочные цены — в одном Excel-файле
            </p>
            <p className="text-xs text-purple-500 mt-1">Период: {from} — {to}</p>
          </div>
          <a
            href={`${BACKEND}/api/export/full?from=${from}&to=${to}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap flex-shrink-0"
          >
            <DownloadIcon />
            Скачать XLS
          </a>
        </div>
      </div>

      {/* Excel tip */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>Совет:</strong> все файлы содержат UTF-8 BOM — открываются в Excel без кодировок. Для Google Sheets используйте «Файл → Импорт».
      </div>
    </div>
  );
}

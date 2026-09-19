'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/api';

interface RunResultProps {
  slug: string;
  result: Record<string, unknown>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
    >
      {copied ? 'Скопировано!' : 'Копировать'}
    </button>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <CopyButton text={value} />
      </div>
      <div className="p-4 bg-white">
        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{value}</pre>
      </div>
    </div>
  );
}

type TableRow = Record<string, unknown>;

function SimpleTable({ data }: { data: TableRow[] }) {
  if (!data || data.length === 0) {
    return <p className="text-slate-500 text-sm">Нет данных</p>;
  }
  const cols = Object.keys(data[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {cols.map((col) => (
              <th key={col} className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row, i) => (
            <tr key={i} className="bg-white hover:bg-slate-50">
              {cols.map((col) => (
                <td key={col} className="px-4 py-2 text-slate-700">
                  {String(row[col] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RunResult({ slug, result }: RunResultProps) {
  const data = result;

  // ---- Multi-view studio ----
  if (slug === 'multi-photo-studio') {
    const views = data.views as Array<{ id: string; label: string; url: string | null; error?: string }> | undefined;
    const note = data.note as string | undefined;

    return (
      <div className="space-y-4">
        {note && (
          <p className="text-sm text-slate-500">{note}</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          {(views ?? []).map((view) => {
            const fullUrl = view.url
              ? view.url.startsWith('http') ? view.url : `${API_URL}${view.url}`
              : null;
            return (
              <div key={view.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">{view.label}</span>
                  {fullUrl && (
                    <a
                      href={fullUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                    >
                      Скачать
                    </a>
                  )}
                </div>
                {fullUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fullUrl} alt={view.label} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="aspect-square bg-slate-100 flex items-center justify-center">
                    <p className="text-xs text-red-500 text-center px-3">{view.error ?? 'Ошибка'}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {(views ?? []).some((v) => v.url) && (
          <p className="text-xs text-slate-400">
            Нажмите «Скачать» под каждым изображением для сохранения
          </p>
        )}
      </div>
    );
  }

  // ---- Image scenarios ----
  if (slug === 'photo-generator' || slug === 'infographic-generator') {
    const imageUrl = data.imageUrl as string | undefined;
    const fullUrl = imageUrl
      ? imageUrl.startsWith('http')
        ? imageUrl
        : `${API_URL}${imageUrl}`
      : null;

    const metaKeys = Object.keys(data).filter((k) => k !== 'imageUrl');

    return (
      <div className="space-y-4">
        {fullUrl != null ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullUrl}
              alt="Результат генерации"
              className="w-full max-w-lg mx-auto block"
            />
          </div>
        ) : (
          <p className="text-slate-500 text-sm">Изображение не найдено</p>
        )}
        {metaKeys.length > 0 && (
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            <h4 className="text-sm font-medium text-slate-600 mb-2">Метаданные</h4>
            <dl className="space-y-1">
              {metaKeys.map((key) => (
                <div key={key} className="flex gap-2 text-sm">
                  <dt className="text-slate-500 min-w-[120px] capitalize">{key}:</dt>
                  <dd className="text-slate-700">{String(data[key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {fullUrl != null && (
          <a
            href={fullUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            Скачать изображение
          </a>
        )}
      </div>
    );
  }

  // ---- Text scenarios ----
  if (slug === 'card-generator') {
    const known = ['title', 'name', 'description', 'features', 'keywords'];
    return (
      <div className="space-y-4">
        {(data.title != null || data.name != null) && (
          <TextBlock label="Заголовок" value={String(data.title ?? data.name)} />
        )}
        {data.description != null && (
          <TextBlock label="Описание" value={String(data.description)} />
        )}
        {Array.isArray(data.features) && (
          <TextBlock label="Характеристики" value={(data.features as string[]).join('\n')} />
        )}
        {Array.isArray(data.keywords) && (
          <TextBlock label="Ключевые слова" value={(data.keywords as string[]).join(', ')} />
        )}
        {Object.keys(data)
          .filter((k) => !known.includes(k))
          .map((key) => (
            <TextBlock key={key} label={key} value={String(data[key])} />
          ))}
      </div>
    );
  }

  if (slug === 'seo-audit') {
    const known = ['score', 'recommendations'];
    return (
      <div className="space-y-4">
        {data.score != null && (
          <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className={`text-3xl font-bold ${
              Number(data.score) >= 80 ? 'text-green-600' :
              Number(data.score) >= 50 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {String(data.score)}
            </div>
            <div>
              <p className="font-medium text-slate-700">SEO-оценка</p>
              <p className="text-sm text-slate-500">из 100</p>
            </div>
          </div>
        )}
        {Array.isArray(data.recommendations) && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-sm font-medium text-slate-600">Рекомендации</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {(data.recommendations as string[]).map((rec, i) => (
                <li key={i} className="px-4 py-3 flex gap-2 text-sm text-slate-700">
                  <span className="text-purple-500 font-bold flex-shrink-0">{i + 1}.</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
        {Object.keys(data)
          .filter((k) => !known.includes(k))
          .map((key) => (
            <TextBlock key={key} label={key} value={
              Array.isArray(data[key])
                ? (data[key] as string[]).join('\n')
                : String(data[key])
            } />
          ))}
      </div>
    );
  }

  if (slug === 'review-drafts') {
    const drafts = data.drafts ?? data.reviews ?? data;
    if (Array.isArray(drafts)) {
      return (
        <div className="space-y-3">
          {(drafts as string[]).map((draft, i) => (
            <TextBlock key={i} label={`Ответ на отзыв ${i + 1}`} value={String(draft)} />
          ))}
        </div>
      );
    }
    return <TextBlock label="Результат" value={JSON.stringify(data, null, 2)} />;
  }

  // ---- Table scenarios ----
  if (slug === 'price-monitor') {
    const competitors = data.competitors ?? data.prices ?? data.items;
    const known = ['currentPrice', 'recommendation', 'competitors', 'prices', 'items'];
    return (
      <div className="space-y-4">
        {data.currentPrice != null && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-600">Текущая цена</p>
            <p className="text-2xl font-bold text-blue-800">{String(data.currentPrice)} ₽</p>
          </div>
        )}
        {data.recommendation != null && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-600 mb-1">Рекомендация</p>
            <p className="text-sm text-green-800">{String(data.recommendation)}</p>
          </div>
        )}
        {Array.isArray(competitors) && (
          <div>
            <h4 className="text-sm font-medium text-slate-600 mb-2">Конкуренты</h4>
            <SimpleTable data={competitors as TableRow[]} />
          </div>
        )}
        {Object.keys(data)
          .filter((k) => !known.includes(k))
          .map((key) => (
            <TextBlock key={key} label={key} value={
              Array.isArray(data[key])
                ? JSON.stringify(data[key], null, 2)
                : String(data[key])
            } />
          ))}
      </div>
    );
  }

  if (slug === 'stock-forecast') {
    const items = data.items ?? data.forecast ?? data.products;
    const known = ['summary', 'items', 'forecast', 'products'];
    return (
      <div className="space-y-4">
        {data.summary != null && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-600 mb-1">Сводка</p>
            <p className="text-sm text-amber-800">{String(data.summary)}</p>
          </div>
        )}
        {Array.isArray(items) && (
          <div>
            <h4 className="text-sm font-medium text-slate-600 mb-2">Прогноз по товарам</h4>
            <SimpleTable data={items as TableRow[]} />
          </div>
        )}
        {Object.keys(data)
          .filter((k) => !known.includes(k))
          .map((key) => (
            <TextBlock key={key} label={key} value={
              Array.isArray(data[key])
                ? JSON.stringify(data[key], null, 2)
                : String(data[key])
            } />
          ))}
      </div>
    );
  }

  // ---- Niche analysis ----
  if (slug === 'niche-analysis') {
    const analysis = data.analysis as Record<string, unknown> | undefined;
    const topCompetitors = data.topCompetitors as Array<{ name: string; brand: string; price: number; salePrice?: number; rating: number; reviews: number }> | undefined;
    const priceRange = data.priceRange as { min: number; max: number; avg: number } | undefined;
    const COMPETITION_COLORS: Record<string, string> = {
      low: 'text-green-700 bg-green-50 border-green-200',
      medium: 'text-amber-700 bg-amber-50 border-amber-200',
      high: 'text-red-700 bg-red-50 border-red-200',
    };
    const COMPETITION_LABELS: Record<string, string> = { low: 'Низкая', medium: 'Средняя', high: 'Высокая' };
    const MARGIN_LABELS: Record<string, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
    const compLevel = String(analysis?.competitionLevel ?? 'medium');

    return (
      <div className="space-y-4">
        {data.note && <p className="text-sm text-slate-500">{String(data.note)}</p>}

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {priceRange && (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-slate-800">{priceRange.avg.toLocaleString('ru-RU')} ₽</p>
                <p className="text-xs text-slate-500 mt-0.5">Средняя цена</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-sm font-semibold text-slate-700">{priceRange.min.toLocaleString('ru-RU')} – {priceRange.max.toLocaleString('ru-RU')} ₽</p>
                <p className="text-xs text-slate-500 mt-0.5">Диапазон цен</p>
              </div>
            </>
          )}
          {analysis?.competitionLevel && (
            <div className={`border rounded-xl p-3 text-center ${COMPETITION_COLORS[compLevel] ?? ''}`}>
              <p className="text-lg font-bold">{COMPETITION_LABELS[compLevel] ?? compLevel}</p>
              <p className="text-xs mt-0.5 font-medium">Конкуренция</p>
            </div>
          )}
          {analysis?.marginPotential && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-purple-700">{MARGIN_LABELS[String(analysis.marginPotential)] ?? String(analysis.marginPotential)}</p>
              <p className="text-xs text-purple-500 mt-0.5">Потенциал маржи</p>
            </div>
          )}
        </div>

        {/* AI Summary */}
        {analysis?.summary && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-medium text-blue-700 mb-1">Обзор ниши</p>
            <p className="text-sm text-blue-900">{String(analysis.summary)}</p>
          </div>
        )}

        {/* Entry price recommendation */}
        {analysis?.entryPrice && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <div className="text-center shrink-0">
              <p className="text-2xl font-bold text-green-700">{Number(analysis.entryPrice).toLocaleString('ru-RU')} ₽</p>
              <p className="text-xs text-green-600">Цена входа</p>
            </div>
            <p className="text-sm text-green-800 mt-0.5">{String(analysis.entryPriceReason ?? '')}</p>
          </div>
        )}

        {/* Strategy */}
        {analysis?.strategy && (
          <TextBlock label="Стратегия входа" value={String(analysis.strategy)} />
        )}

        {/* Opportunities & Warnings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.isArray(analysis?.opportunities) && (analysis.opportunities as string[]).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Возможности</p>
              <ul className="space-y-1">
                {(analysis.opportunities as string[]).map((o, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-green-500">✓</span>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(analysis?.warnings) && (analysis.warnings as string[]).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Риски</p>
              <ul className="space-y-1">
                {(analysis.warnings as string[]).map((w, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-amber-500">⚠</span>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Top brands */}
        {Array.isArray(analysis?.topBrands) && (
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Топ бренды</p>
            <div className="flex flex-wrap gap-2">
              {(analysis.topBrands as string[]).map((b, i) => (
                <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-medium">{b}</span>
              ))}
            </div>
          </div>
        )}

        {/* Competitor table */}
        {topCompetitors && topCompetitors.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Топ конкурентов по отзывам</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Товар</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Цена</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Рейтинг</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Отзывов</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topCompetitors.map((c, i) => (
                    <tr key={i} className="bg-white hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-800 max-w-[180px] truncate">{c.name}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-700">{(c.salePrice ?? c.price).toLocaleString('ru-RU')} ₽</td>
                      <td className="px-3 py-2 text-right text-amber-600">★ {c.rating}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{c.reviews.toLocaleString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Generic fallback ----
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">Результат</span>
        <CopyButton text={JSON.stringify(data, null, 2)} />
      </div>
      <pre className="p-4 text-sm text-slate-700 whitespace-pre-wrap font-mono overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

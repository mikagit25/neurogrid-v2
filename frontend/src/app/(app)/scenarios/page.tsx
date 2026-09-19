'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getScenarios } from '@/lib/api';
import type { Scenario } from '@/lib/api';

const PLATFORM_LABELS: Record<string, string> = {
  wb: 'WildBerries',
  ozon: 'Ozon',
};

const SLUG_ICONS: Record<string, string> = {
  'card-generator': '📝',
  'price-monitor': '📊',
  'review-drafts': '💬',
  'stock-forecast': '📦',
  'seo-audit': '🔍',
  'photo-generator': '📸',
  'infographic-generator': '🎨',
};

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getScenarios()
      .then(setScenarios)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Сценарии</h1>
        <p className="text-slate-500 mt-1">Выберите сценарий для автоматизации</p>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!loading && !error && scenarios.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500">Сценарии не найдены</p>
        </div>
      )}

      {!loading && scenarios.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((s) => (
            <Link
              key={s.id}
              href={`/scenarios/${s.slug}`}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:border-purple-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-2xl">{SLUG_ICONS[s.slug] || '⚡'}</div>
                <span className="text-lg font-bold text-purple-600">{s.price} ₽</span>
              </div>
              <h3 className="font-semibold text-slate-800 group-hover:text-purple-700 transition-colors mb-1">
                {s.title}
              </h3>
              <p className="text-sm text-slate-500 line-clamp-2 mb-3">{s.description}</p>
              {s.platforms && s.platforms.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {s.platforms.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-medium"
                    >
                      {PLATFORM_LABELS[p] || p}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

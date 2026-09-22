'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getActivity, getActivityAiPatterns, ActivityAiPatterns, ActivityAiPattern } from '@/lib/api';
import type { ActivityEvent } from '@/lib/api';

function fmtTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function PriceChangeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function ScenarioIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

const PLATFORM_LABELS: Record<string, string> = { wb: 'WB', ozon: 'Ozon', ym: 'ЯМ', mm: 'ММ' };

function EventCard({ ev }: { ev: ActivityEvent }) {
  if (ev.type === 'price_change') {
    const m = ev.meta as { old_price: number; new_price: number; reason?: string; rule_name?: string };
    const up = m.new_price > m.old_price;
    return (
      <div className="flex gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-shadow">
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <PriceChangeIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-800 truncate">{ev.title ?? ev.sku}</p>
              {ev.sku && <p className="text-xs text-slate-400">{ev.sku}{ev.platform ? ` · ${PLATFORM_LABELS[ev.platform] ?? ev.platform}` : ''}</p>}
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">{fmtTs(ev.ts)}</span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Цена изменена: <span className="line-through text-slate-400">{m.old_price} ₽</span>{' '}
            → <span className={up ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>{m.new_price} ₽</span>
            {m.rule_name && <span className="ml-2 text-xs text-slate-400">({m.rule_name})</span>}
          </p>
        </div>
      </div>
    );
  }

  if (ev.type === 'scenario_run') {
    const m = ev.meta as { status: string; cost: number; scenario_slug?: string };
    const ok = m.status === 'done';
    return (
      <div className="flex gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-shadow">
        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ScenarioIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">{ev.title ?? m.scenario_slug ?? 'Сценарий'}</p>
            <span className="text-xs text-slate-400 whitespace-nowrap">{fmtTs(ev.ts)}</span>
          </div>
          <p className="text-sm mt-1">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : m.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
              {m.status === 'done' ? 'Выполнен' : m.status === 'failed' ? 'Ошибка' : m.status}
            </span>
            {m.cost > 0 && <span className="ml-2 text-xs text-slate-400">{m.cost} кред.</span>}
          </p>
        </div>
      </div>
    );
  }

  if (ev.type === 'alert') {
    const m = ev.meta as { alert_type: string; message?: string; value?: number; threshold?: number };
    return (
      <div className="flex gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-shadow">
        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-800 truncate">{ev.title ?? ev.sku ?? 'Алерт'}</p>
              {ev.sku && <p className="text-xs text-slate-400">{ev.sku}{ev.platform ? ` · ${PLATFORM_LABELS[ev.platform] ?? ev.platform}` : ''}</p>}
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">{fmtTs(ev.ts)}</span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {m.message ?? m.alert_type}
            {m.value !== undefined && <span className="ml-1 text-slate-500">(значение: {m.value}{m.threshold !== undefined ? `, порог: ${m.threshold}` : ''})</span>}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'price_change', label: 'Цены' },
  { value: 'scenario_run', label: 'Сценарии' },
  { value: 'alert', label: 'Алерты' },
] as const;
type Filter = typeof FILTER_OPTIONS[number]['value'];

const SEVERITY_CONFIG: Record<string, { border: string; bg: string; badge: string; label: string }> = {
  critical: { border: 'border-red-200',   bg: 'bg-red-50',   badge: 'bg-red-100 text-red-700',   label: 'Критично' },
  warning:  { border: 'border-amber-200', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700', label: 'Внимание' },
  info:     { border: 'border-blue-200',  bg: 'bg-blue-50',  badge: 'bg-blue-100 text-blue-700',  label: 'Инфо' },
};

function ActivityAiPanel({ result, onClose }: { result: ActivityAiPatterns; onClose: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-violet-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h3 className="font-semibold text-slate-800">AI паттерны активности</h3>
          <span className="text-xs text-slate-400">{result.total_events} событий за 14 дней</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>

      <p className="text-sm text-slate-600">{result.summary}</p>

      {result.patterns.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Паттерны</p>
          <div className="space-y-2">
            {result.patterns.map((p, i) => {
              const cfg = SEVERITY_CONFIG[p.severity] ?? SEVERITY_CONFIG.info;
              return (
                <div key={i} className={`rounded-lg border p-3 ${cfg.border} ${cfg.bg}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${cfg.badge}`}>{cfg.label}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {result.anomalies.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Аномалии</p>
          <ul className="space-y-1">
            {result.anomalies.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-amber-500 flex-shrink-0">⚠</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.insights.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Инсайты</p>
          <ul className="space-y-1">
            {result.insights.map((ins, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-blue-400 flex-shrink-0">●</span>
                {ins}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.actions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Рекомендации</p>
          <ol className="space-y-1">
            {result.actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                {a}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-slate-400">Сформировано: {new Date(result.generated_at).toLocaleString('ru-RU')}</p>
    </div>
  );
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(50);
  const [aiResult, setAiResult] = useState<ActivityAiPatterns | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getActivity(limit)
      .then(setEvents)
      .catch(e => setError(e.message ?? 'Ошибка'))
      .finally(() => setLoading(false));
  }, [limit]);

  async function handleAiPatterns() {
    setAiLoading(true);
    setAiResult(null);
    try {
      const result = await getActivityAiPatterns();
      setAiResult(result);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка AI анализа');
    } finally {
      setAiLoading(false);
    }
  }

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  const counts = {
    price_change: events.filter(e => e.type === 'price_change').length,
    scenario_run: events.filter(e => e.type === 'scenario_run').length,
    alert: events.filter(e => e.type === 'alert').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Лента событий</h1>
          <p className="text-slate-500 text-sm mt-0.5">Изменения цен, запуски сценариев, алерты</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAiPatterns}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {aiLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : <span>🤖</span>}
            {aiLoading ? 'Анализ...' : 'AI паттерны'}
          </button>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value={50}>50 событий</option>
            <option value={100}>100 событий</option>
            <option value={200}>200 событий</option>
          </select>
        </div>
      </div>

      {aiResult && (
        <ActivityAiPanel result={aiResult} onClose={() => setAiResult(null)} />
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{counts.price_change}</p>
          <p className="text-xs text-blue-500 mt-0.5">Изменений цен</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">{counts.scenario_run}</p>
          <p className="text-xs text-purple-500 mt-0.5">Запусков AI</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{counts.alert}</p>
          <p className="text-xs text-amber-500 mt-0.5">Алертов</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {FILTER_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === opt.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {opt.label}
          </button>
        ))}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-500">Нет событий</p>
          <p className="text-slate-400 text-sm mt-1">Синхронизируйте данные или настройте алерты</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ev => (
            <EventCard key={`${ev.type}-${ev.id}`} ev={ev} />
          ))}
          {filtered.length >= limit && (
            <button onClick={() => setLimit(l => Math.min(l + 50, 200))}
              className="w-full py-3 text-sm text-purple-600 font-medium hover:text-purple-700 transition-colors">
              Загрузить ещё
            </button>
          )}
        </div>
      )}
    </div>
  );
}

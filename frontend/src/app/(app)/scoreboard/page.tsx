'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ScoreboardItem, getScoreboard, addToWatchlist, getScoreboardAi, type ScoreboardAiResult, type ScoreboardAiLaggardAction } from '@/lib/api';

const PLATFORM_LABELS: Record<string, string> = { wb: 'WB', ozon: 'Ozon' };

function ScoreMeter({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold tabular-nums" style={{ color }}>
        {Math.round(pct)}
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-base">🥇</span>;
  if (rank === 2) return <span className="text-base">🥈</span>;
  if (rank === 3) return <span className="text-base">🥉</span>;
  return <span className="text-sm font-medium text-slate-400 tabular-nums w-6 text-right">#{rank}</span>;
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M₽';
  if (n >= 1_000)     return Math.round(n / 1_000) + ' k₽';
  return n.toLocaleString('ru-RU') + ' ₽';
}

const PERIOD_OPTS = [
  { label: '7 дней',  value: '7d' },
  { label: '30 дней', value: '30d' },
  { label: '90 дней', value: '90d' },
];

const HEALTH_CONFIG = {
  excellent: { label: 'Отличный',   cls: 'bg-green-100 text-green-700' },
  good:      { label: 'Хороший',    cls: 'bg-blue-100 text-blue-700' },
  mixed:     { label: 'Смешанный',  cls: 'bg-amber-100 text-amber-700' },
  poor:      { label: 'Слабый',     cls: 'bg-red-100 text-red-700' },
  unknown:   { label: 'Нет данных', cls: 'bg-slate-100 text-slate-600' },
};

function ScoreboardAiPanel({ result, onClose }: { result: ScoreboardAiResult; onClose: () => void }) {
  const health = HEALTH_CONFIG[result.portfolio_health] ?? HEALTH_CONFIG.unknown;
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900 text-sm">AI тир-анализ портфеля</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${health.cls}`}>{health.label}</span>
            </div>
            <p className="text-xs text-slate-500">{result.total_skus} SKU · топ-{result.stars_count} = {result.stars_revenue_pct}% выручки</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed">{result.summary}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {result.stars_tips.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-green-700 mb-1.5">Звёзды — как развивать</p>
            <ul className="space-y-1">
              {result.stars_tips.map((t, i) => <li key={i} className="text-sm text-green-800 flex gap-2"><span className="flex-shrink-0">•</span>{t}</li>)}
            </ul>
          </div>
        )}
        {result.mid_tips.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-700 mb-1.5">Середина — как поднять</p>
            <ul className="space-y-1">
              {result.mid_tips.map((t, i) => <li key={i} className="text-sm text-blue-800 flex gap-2"><span className="flex-shrink-0">•</span>{t}</li>)}
            </ul>
          </div>
        )}
      </div>

      {result.laggard_actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Аутсайдеры — конкретные действия</p>
          {result.laggard_actions.map((a: ScoreboardAiLaggardAction, i: number) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-3 flex items-start gap-3">
              {a.urgency === 'high' && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0 mt-0.5">Срочно</span>}
              <div className="flex-1">
                <p className="text-xs text-slate-500 font-mono">{a.sku} · {a.title}</p>
                <p className="text-sm text-slate-700 mt-0.5">{a.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
        <p className="text-xs font-semibold text-purple-700 mb-1">Стратегия портфеля</p>
        <p className="text-sm text-purple-800">{result.overall_strategy}</p>
      </div>
    </div>
  );
}

export default function ScoreboardPage() {
  const [items, setItems]   = useState<ScoreboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [period, setPeriod] = useState('30d');
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<string>('all');
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [aiResult, setAiResult] = useState<ScoreboardAiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await getScoreboard(p);
      setItems(data.items);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  async function handleAi() {
    setAiLoading(true);
    setAiResult(null);
    try { setAiResult(await getScoreboardAi()); } catch { /* ignore */ } finally { setAiLoading(false); }
  }

  const platforms = items.map(i => i.platform).filter((p, idx, arr) => arr.indexOf(p) === idx);

  const filtered = items.filter(item => {
    if (platform !== 'all' && item.platform !== platform) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.sku.toLowerCase().includes(q) || item.title.toLowerCase().includes(q);
    }
    return true;
  });

  const topScore  = items[0]?.score ?? 0;
  const avgScore  = items.length ? Math.round(items.reduce((s, i) => s + i.score, 0) / items.length) : 0;
  const noMargin  = items.filter(i => i.margin_pct === null).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Рейтинг товаров</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Сводный балл = 40% скорость продаж + 30% маржа + 20% выручка + 10% (1 − возвраты)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAi}
            disabled={aiLoading || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {aiLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            AI анализ
          </button>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {PERIOD_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => setPeriod(o.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  period === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {aiResult && <ScoreboardAiPanel result={aiResult} onClose={() => setAiResult(null)} />}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Лидер рейтинга', value: Math.round(topScore), sub: 'Макс. балл', color: 'text-green-600' },
          { label: 'Средний балл',   value: avgScore,              sub: 'По каталогу', color: 'text-slate-900' },
          { label: 'Без себестоим.', value: noMargin,              sub: 'Маржа неизвестна', color: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию или SKU..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        {platforms.length > 1 && (
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(['all', ...platforms] as string[]).map(p => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  platform === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p === 'all' ? 'Все' : PLATFORM_LABELS[p] ?? p.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {items.length === 0 ? 'Нет данных за выбранный период.' : 'Ничего не найдено.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium w-12">#</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Товар / SKU</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">Балл</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Выручка</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Заказов</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Скорость/д.</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Маржа %</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Возвраты</th>
                <th className="px-4 py-3 text-center text-xs text-slate-400 font-medium w-8">⭐</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(item => (
                <tr key={`${item.platform}:${item.sku}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-center">
                    <RankBadge rank={item.rank} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/products/${encodeURIComponent(item.sku)}`}
                      className="font-medium text-slate-800 hover:text-purple-600 transition-colors truncate max-w-[200px] block"
                    >
                      {item.title || item.sku}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{item.sku}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{PLATFORM_LABELS[item.platform] ?? item.platform}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <ScoreMeter score={item.score} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">
                    {fmtMoney(item.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {item.qty.toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {item.daily_velocity > 0 ? item.daily_velocity.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.margin_pct != null ? (
                      <span className={`font-medium ${item.margin_pct >= 20 ? 'text-green-600' : item.margin_pct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                        {item.margin_pct}%
                      </span>
                    ) : (
                      <Link href={`/warehouse`} className="text-slate-300 text-xs hover:text-purple-500 transition-colors" title="Укажите себестоимость">
                        — указать
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.return_count > 0 ? (
                      <span className={`${item.return_rate_pct > 10 ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                        {item.return_rate_pct}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={async () => {
                        const key = `${item.platform}:${item.sku}`;
                        if (pinned.has(key)) return;
                        await addToWatchlist(item.sku, item.platform, item.title || undefined).catch(() => {});
                        setPinned(prev => { const s = new Set<string>(); prev.forEach(v => s.add(v)); s.add(key); return s; });
                      }}
                      title={pinned.has(`${item.platform}:${item.sku}`) ? 'В списке наблюдения' : 'Добавить в наблюдение'}
                      className={`p-1 rounded transition-colors ${pinned.has(`${item.platform}:${item.sku}`) ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}
                    >
                      <svg className="w-4 h-4" fill={pinned.has(`${item.platform}:${item.sku}`) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Score explanation */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2">Как считается балл</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-500">
          {[
            { label: 'Скорость продаж', pct: '40%', desc: 'Заказов в день относительно лидера' },
            { label: 'Маржа',           pct: '30%', desc: 'Процент маржи относительно лучшего товара' },
            { label: 'Выручка',         pct: '20%', desc: 'Абсолютная выручка за период' },
            { label: 'Возвраты',        pct: '10%', desc: 'Штраф: 0% возвратов = +10 баллов' },
          ].map(f => (
            <div key={f.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{f.label}</span>
                <span className="text-purple-600 font-semibold">{f.pct}</span>
              </div>
              <p className="leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

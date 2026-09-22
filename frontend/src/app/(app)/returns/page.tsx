'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  ReturnItem, ReturnStats, ReturnAnalyticsRow,
  getReturnItems, getReturnStats, getReturnAnalytics,
  updateReturnItem, createReturnItem,
  analyzeReturns, type ReturnAIAnalysis, type ReturnAIInsight,
} from '../../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-gray-100 text-gray-500',
  refunded: 'bg-green-100 text-green-700',
  resellable: 'bg-teal-100 text-teal-700',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  refunded: 'Возврат выдан',
  resellable: 'Можно продать',
};

const ACTION_LABELS: Record<string, string> = {
  resell: 'Продать повторно',
  dispose: 'Утилизировать',
  repair: 'Отремонтировать',
  supplier_claim: 'Претензия поставщику',
};

function ReturnCard({ item, onUpdated }: { item: ReturnItem; onUpdated: () => void }) {
  const [showActions, setShowActions] = useState(false);

  async function onAction(action: string) {
    await updateReturnItem(item.id, { action });
    onUpdated();
  }
  async function onStatus(status: string) {
    await updateReturnItem(item.id, { status });
    onUpdated();
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-600">{item.sku}</span>
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{item.platform.toUpperCase()}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
            {item.action && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{ACTION_LABELS[item.action] ?? item.action}</span>
            )}
          </div>
          {item.title && <p className="text-sm text-gray-700 mt-0.5">{item.title}</p>}
          {item.reason && <p className="text-xs text-gray-500 mt-0.5">Причина: {item.reason}</p>}
          {item.order_id && <p className="text-xs text-gray-400">Заказ: {item.order_id}</p>}
        </div>
        <div className="text-right">
          <div className="font-semibold">{item.qty} шт.</div>
          {item.refund_amount != null && (
            <div className="text-xs text-gray-500">{Number(item.refund_amount).toLocaleString('ru')} ₽</div>
          )}
          {item.return_date && <div className="text-xs text-gray-400">{new Date(item.return_date).toLocaleDateString('ru')}</div>}
        </div>
      </div>

      <div className="mt-3 flex gap-2 flex-wrap">
        <button onClick={() => setShowActions(s => !s)} className="text-xs text-indigo-500 hover:text-indigo-700">
          Действия
        </button>
      </div>

      {showActions && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="flex gap-2 flex-wrap">
            {item.status === 'pending' && (
              <>
                <button onClick={() => onStatus('resellable')} className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded hover:bg-teal-200">Можно продать</button>
                <button onClick={() => onStatus('refunded')} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Возврат выдан</button>
                <button onClick={() => onStatus('rejected')} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200">Отклонить</button>
              </>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <p className="text-xs text-gray-500 w-full">Планируемое действие:</p>
            {['resell', 'dispose', 'repair', 'supplier_claim'].map(a => (
              <button
                key={a}
                onClick={() => onAction(a)}
                className={`text-xs px-2 py-1 rounded ${item.action === a ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
              >
                {ACTION_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState<ReturnAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReturnAnalytics().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-10 text-center text-gray-400">Загрузка...</div>;
  if (!data.length) return <div className="py-12 text-center text-gray-400">Нет данных для анализа</div>;

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-left">Платформа</th>
            <th className="px-4 py-3 text-left">SKU</th>
            <th className="px-4 py-3 text-right">Возвратов</th>
            <th className="px-4 py-3 text-right">% возвратов</th>
            <th className="px-4 py-3 text-left">Главная причина</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">{row.platform.toUpperCase()}</span>
              </td>
              <td className="px-4 py-3">
                <div className="font-mono text-xs text-gray-600">{row.sku}</div>
                {row.title && <div className="text-xs text-gray-500 truncate max-w-48">{row.title}</div>}
              </td>
              <td className="px-4 py-3 text-right font-semibold">{row.return_count}</td>
              <td className="px-4 py-3 text-right">
                {row.return_rate != null ? (
                  <span className={Number(row.return_rate) > 10 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                    {Number(row.return_rate).toFixed(1)}%
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3 text-gray-600">{row.top_reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INSIGHT_COLORS: Record<string, string> = {
  warning: 'border-l-amber-400 bg-amber-50',
  tip:     'border-l-blue-400 bg-blue-50',
  success: 'border-l-green-400 bg-green-50',
};
const INSIGHT_ICONS: Record<string, string> = { warning: '⚠️', tip: '💡', success: '✅' };

function AIAnalysisPanel() {
  const [result, setResult] = useState<ReturnAIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    setLoading(true);
    try { setResult(await analyzeReturns()); setDone(true); }
    catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  if (!done) {
    return (
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-white font-semibold">AI-анализ возвратов</p>
          <p className="text-purple-200 text-sm mt-0.5">Выявим проблемные SKU, причины и дадим рекомендации</p>
        </div>
        <button onClick={run} disabled={loading}
          className="shrink-0 px-4 py-2 bg-white text-purple-700 rounded-xl text-sm font-semibold hover:bg-purple-50 disabled:opacity-60 transition-colors flex items-center gap-2">
          {loading ? <span className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /> : '✨'}
          {loading ? 'Анализ...' : 'Запустить'}
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-white font-semibold">✨ AI-анализ возвратов</p>
          <button onClick={() => { setDone(false); setResult(null); }}
            className="text-purple-300 hover:text-white text-xs">Обновить</button>
        </div>
        <p className="text-purple-100 text-sm">{result.summary}</p>
        {result.top_problem_sku && (
          <p className="text-purple-200 text-xs mt-1">Главная проблема: <span className="font-mono text-white">{result.top_problem_sku}</span></p>
        )}
      </div>

      {result.insights.length > 0 && (
        <div className="space-y-2">
          {result.insights.map((ins: ReturnAIInsight, i: number) => (
            <div key={i} className={`border-l-4 rounded-r-xl p-4 ${INSIGHT_COLORS[ins.type] ?? 'border-l-slate-300 bg-slate-50'}`}>
              <p className="font-medium text-slate-800 text-sm">{INSIGHT_ICONS[ins.type]} {ins.title}</p>
              <p className="text-slate-600 text-sm mt-1">{ins.text}</p>
            </div>
          ))}
        </div>
      )}

      {result.recommended_actions.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">Рекомендуемые действия</p>
          <ul className="space-y-1">
            {result.recommended_actions.map((a: string, i: number) => (
              <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">→</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ReturnsPage() {
  const [tab, setTab] = useState('returns');
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [stats, setStats] = useState<ReturnStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        getReturnItems({ status: filterStatus || undefined }),
        getReturnStats(),
      ]);
      setReturns(r);
      setStats(s);
    } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Центр возвратов</h1>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ['Всего', stats.total, ''],
            ['Ожидают', stats.pending, 'text-yellow-600'],
            ['Можно продать', stats.resellable, 'text-teal-600'],
            ['Возвращено ₽', Number(stats.total_refunded).toLocaleString('ru'), 'text-red-600'],
            ['Претензий пост.', stats.supplier_claims, 'text-purple-600'],
            ['SKU с возвратами', stats.skus_affected, 'text-blue-600'],
          ].map(([label, val, color]) => (
            <div key={label as string} className="bg-white rounded-xl border p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>{val}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[['returns', 'Возвраты'], ['analytics', 'Аналитика'], ['ai', 'AI-анализ']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'ai' && <AIAnalysisPanel />}

      {tab === 'returns' && (
        <>
          <div className="flex gap-3">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded px-3 py-2 text-sm">
              <option value="">Все статусы</option>
              <option value="pending">Ожидают</option>
              <option value="resellable">Можно продать</option>
              <option value="refunded">Возврат выдан</option>
              <option value="rejected">Отклонены</option>
            </select>
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-400">Загрузка...</div>
          ) : returns.length === 0 ? (
            <div className="py-12 text-center text-gray-400">Нет возвратов с выбранным фильтром</div>
          ) : (
            <div className="space-y-3">
              {returns.map(r => <ReturnCard key={r.id} item={r} onUpdated={load} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

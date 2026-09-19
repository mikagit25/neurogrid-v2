'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getRun } from '@/lib/api';
import type { Run } from '@/lib/api';
import RunResult from '@/components/RunResult';

const STATUS_LABELS: Record<string, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  success: 'Успешно',
  error: 'Ошибка',
};

const STATUS_CLASSES: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700',
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRun = useCallback(async () => {
    try {
      const data = await getRun(id);
      setRun(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function init() {
      const data = await loadRun();
      if (data && (data.status === 'queued' || data.status === 'running')) {
        intervalId = setInterval(async () => {
          const updated = await loadRun();
          if (updated && updated.status !== 'queued' && updated.status !== 'running') {
            if (intervalId) clearInterval(intervalId);
          }
        }, 3000);
      }
    }

    init();
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [loadRun]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !run) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
        <Link href="/runs" className="text-purple-600 hover:text-purple-700 font-medium text-sm">
          ← История запусков
        </Link>
      </div>
    );
  }

  if (!run) return null;

  const isPending = run.status === 'queued' || run.status === 'running';

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/runs" className="text-slate-500 hover:text-slate-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          {run.scenario_title || run.scenario_slug || 'Запуск'}
        </h1>
      </div>

      {/* Meta card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Статус</p>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${STATUS_CLASSES[run.status]}`}>
              {isPending && (
                <span className="w-2 h-2 rounded-full bg-current opacity-75 animate-pulse" />
              )}
              {STATUS_LABELS[run.status] || run.status}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Стоимость</p>
            <p className="text-sm font-semibold text-slate-800">
              {run.cost != null ? `${run.cost.toLocaleString('ru-RU')} ₽` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Сценарий</p>
            <p className="text-sm text-slate-700">{run.scenario_slug || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Создан</p>
            <p className="text-sm text-slate-700">{formatDate(run.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Pending state */}
      {isPending && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 flex items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-800">
              {run.status === 'queued' ? 'Ожидание в очереди...' : 'Сценарий выполняется...'}
            </p>
            <p className="text-sm text-blue-600 mt-0.5">Страница обновляется автоматически</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {run.status === 'error' && run.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-800 mb-1">Ошибка выполнения</h3>
          <p className="text-sm text-red-700">{run.error_message}</p>
        </div>
      )}

      {/* Input data */}
      {run.input_data != null && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700 text-sm">Входные данные</h2>
          </div>
          <pre className="p-4 text-xs text-slate-600 overflow-x-auto font-mono">
            {JSON.stringify(run.input_data, null, 2)}
          </pre>
        </div>
      )}

      {/* Result */}
      {run.status === 'success' && run.result != null && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Результат</h2>
          </div>
          <div className="p-5">
            <RunResult slug={run.scenario_slug || ''} result={run.result} />
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getRuns, getScenarios } from '@/lib/api';
import { getUser } from '@/lib/auth';
import type { Run, Scenario } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  success: 'Успешно',
  error: 'Ошибка',
};

const STATUS_CLASSES: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[status] || 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getUser();

  useEffect(() => {
    async function load() {
      try {
        const [runsData, scenariosData] = await Promise.all([
          getRuns(20),
          getScenarios(),
        ]);
        setRuns(runsData);
        setScenarios(scenariosData);
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Runs today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const runsToday = runs.filter((r) => new Date(r.created_at) >= today).length;

  const lastFiveRuns = runs.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Дашборд</h1>
        <p className="text-slate-500 mt-1">Добро пожаловать в NeuroGrid</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">Баланс</p>
          <p className="text-2xl font-bold text-slate-900">
            {user ? user.balance.toLocaleString('ru-RU') : '—'} ₽
          </p>
          <Link
            href="/wallet"
            className="mt-3 inline-block text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Пополнить →
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">Запусков сегодня</p>
          <p className="text-2xl font-bold text-slate-900">{runsToday}</p>
          <Link
            href="/runs"
            className="mt-3 inline-block text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            История →
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">Доступно сценариев</p>
          <p className="text-2xl font-bold text-slate-900">{scenarios.length}</p>
          <Link
            href="/scenarios"
            className="mt-3 inline-block text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Смотреть →
          </Link>
        </div>
      </div>

      {/* Recent runs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Последние запуски</h2>
          <Link href="/runs" className="text-sm text-purple-600 hover:text-purple-700 font-medium">
            Все запуски
          </Link>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : lastFiveRuns.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-500 text-sm">Запусков пока нет</p>
            <Link
              href="/scenarios"
              className="mt-3 inline-block px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
            >
              Запустить сценарий
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Сценарий</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Статус</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Стоимость</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lastFiveRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-700 font-medium">
                      {run.scenario_title || run.scenario_slug || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {run.cost != null ? `${run.cost.toLocaleString('ru-RU')} ₽` : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatDate(run.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/runs/${run.id}`}
                        className="text-purple-600 hover:text-purple-700 font-medium"
                      >
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick scenario access */}
      {scenarios.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Быстрый запуск</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scenarios.slice(0, 6).map((s) => (
              <Link
                key={s.id}
                href={`/scenarios/${s.slug}`}
                className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50/30 transition-colors group"
              >
                <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 group-hover:text-purple-700 truncate">{s.title}</p>
                  <p className="text-xs text-slate-500">{s.price} ₽</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

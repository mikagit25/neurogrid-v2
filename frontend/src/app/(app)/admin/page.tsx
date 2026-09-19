'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminGetUsers,
  adminGetRuns,
  getScenarios,
  adminRetryRun,
  adminAdjustBalance,
  adminToggleScenario,
} from '@/lib/api';
import type { AdminUser, AdminRun, Scenario } from '@/lib/api';
import { getUser } from '@/lib/auth';

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'users' | 'runs' | 'scenarios'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [runs, setRuns] = useState<AdminRun[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runsStatusFilter, setRunsStatusFilter] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Check admin
  useEffect(() => {
    const u = getUser();
    if (u && !u.isAdmin) {
      router.replace('/dashboard');
    }
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'users') {
        const data = await adminGetUsers();
        setUsers(data);
      } else if (tab === 'runs') {
        const data = await adminGetRuns(runsStatusFilter || undefined, 100);
        setRuns(data);
      } else {
        const data = await getScenarios();
        setScenarios(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [tab, runsStatusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleRetryRun(id: string) {
    setActionError('');
    setActionSuccess('');
    try {
      await adminRetryRun(id);
      setActionSuccess(`Запуск ${id.slice(0, 8)} поставлен в очередь повторно`);
      loadData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function handleAdjustBalance(userId: string, userEmail: string) {
    setActionError('');
    setActionSuccess('');
    const input = window.prompt(`Введите сумму для корректировки баланса пользователя ${userEmail}\n(положительное — пополнение, отрицательное — списание)`);
    if (!input) return;
    const amount = Number(input);
    if (isNaN(amount) || amount === 0) {
      setActionError('Некорректная сумма');
      return;
    }
    const note = window.prompt('Комментарий (необязательно):') || undefined;
    try {
      const { newBalance } = await adminAdjustBalance(userId, amount, note);
      setActionSuccess(`Баланс обновлён. Новый баланс: ${newBalance.toLocaleString('ru-RU')} ₽`);
      loadData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function handleToggleScenario(id: string, currentActive: boolean) {
    setActionError('');
    try {
      await adminToggleScenario(id, !currentActive);
      setScenarios((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !currentActive } : s))
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  const tabs = [
    { key: 'users' as const, label: 'Пользователи' },
    { key: 'runs' as const, label: 'Запуски' },
    { key: 'scenarios' as const, label: 'Сценарии' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Администрирование</h1>
        <p className="text-slate-500 mt-1">Управление платформой NeuroGrid</p>
      </div>

      {/* Feedback messages */}
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {actionSuccess}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="border-b border-slate-100">
          <div className="flex">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setActionError(''); setActionSuccess(''); }}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Runs filter */}
        {tab === 'runs' && (
          <div className="px-5 py-3 border-b border-slate-100 flex gap-2 flex-wrap">
            {['', 'queued', 'running', 'success', 'error'].map((s) => (
              <button
                key={s}
                onClick={() => setRunsStatusFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  runsStatusFilter === s
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s ? STATUS_LABELS[s] : 'Все'}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : tab === 'users' ? (
          <UsersTable users={users} onAdjustBalance={handleAdjustBalance} />
        ) : tab === 'runs' ? (
          <RunsTable runs={runs} onRetry={handleRetryRun} />
        ) : (
          <ScenariosTable scenarios={scenarios} onToggle={handleToggleScenario} />
        )}
      </div>
    </div>
  );
}

function UsersTable({
  users,
  onAdjustBalance,
}: {
  users: AdminUser[];
  onAdjustBalance: (id: string, email: string) => void;
}) {
  if (users.length === 0) {
    return <div className="p-8 text-center text-slate-500 text-sm">Пользователей нет</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Баланс</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Роль</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Регистрация</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50/50">
              <td className="px-5 py-3 text-slate-700 font-medium">{u.email}</td>
              <td className="px-5 py-3 text-slate-700">{u.balance.toLocaleString('ru-RU')} ₽</td>
              <td className="px-5 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  u.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {u.is_admin ? 'Администратор' : 'Пользователь'}
                </span>
              </td>
              <td className="px-5 py-3 text-slate-500">
                {new Date(u.created_at).toLocaleDateString('ru-RU')}
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onAdjustBalance(u.id, u.email)}
                  className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg font-medium transition-colors"
                >
                  Изменить баланс
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunsTable({
  runs,
  onRetry,
}: {
  runs: AdminRun[];
  onRetry: (id: string) => void;
}) {
  if (runs.length === 0) {
    return <div className="p-8 text-center text-slate-500 text-sm">Запусков нет</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Пользователь</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Сценарий</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Статус</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Стоимость</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Дата</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-slate-50/50">
              <td className="px-5 py-3 text-slate-500 font-mono text-xs">{run.id.slice(0, 8)}</td>
              <td className="px-5 py-3 text-slate-700">{run.user_email}</td>
              <td className="px-5 py-3 text-slate-700">{run.scenario_title}</td>
              <td className="px-5 py-3">
                <div className="space-y-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[run.status] || 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABELS[run.status] || run.status}
                  </span>
                  {run.error_message && (
                    <p className="text-xs text-red-600 max-w-xs truncate" title={run.error_message}>
                      {run.error_message}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-5 py-3 text-slate-600">
                {run.cost != null ? `${run.cost.toLocaleString('ru-RU')} ₽` : '—'}
              </td>
              <td className="px-5 py-3 text-slate-500">{formatDate(run.created_at)}</td>
              <td className="px-5 py-3 text-right">
                {run.status === 'error' && (
                  <button
                    onClick={() => onRetry(run.id)}
                    className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors"
                  >
                    Повторить
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScenariosTable({
  scenarios,
  onToggle,
}: {
  scenarios: Scenario[];
  onToggle: (id: string, currentActive: boolean) => void;
}) {
  if (scenarios.length === 0) {
    return <div className="p-8 text-center text-slate-500 text-sm">Сценариев нет</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Сценарий</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Slug</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Цена</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Платформы</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Активен</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {scenarios.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50/50">
              <td className="px-5 py-3 font-medium text-slate-800">{s.title}</td>
              <td className="px-5 py-3 text-slate-500 font-mono text-xs">{s.slug}</td>
              <td className="px-5 py-3 text-slate-700">{s.price} ₽</td>
              <td className="px-5 py-3 text-slate-500">{s.platforms?.join(', ') || '—'}</td>
              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onToggle(s.id, s.is_active !== false)}
                  className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none ${
                    s.is_active !== false ? 'bg-purple-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                      s.is_active !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

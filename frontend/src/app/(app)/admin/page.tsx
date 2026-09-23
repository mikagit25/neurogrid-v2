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
  adminGetSupportTickets,
  adminGetSupportTicket,
  adminReplySupportTicket,
  adminSetSupportStatus,
  SUPPORT_TOPICS,
} from '@/lib/api';
import type { AdminUser, AdminRun, Scenario, SupportTicket, SupportReply } from '@/lib/api';
import { getUser } from '@/lib/auth';

const TOPIC_LABEL: Record<string, string> = Object.fromEntries(SUPPORT_TOPICS.map(t => [t.value, t.label]));
const TICKET_STATUS_LABEL: Record<string, string> = { open: 'Открыто', replied: 'Отвечено', closed: 'Закрыто' };
const TICKET_STATUS_CLASS: Record<string, string> = {
  open:    'bg-amber-100 text-amber-700',
  replied: 'bg-blue-100 text-blue-700',
  closed:  'bg-gray-100 text-gray-500',
};

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

// ---- Support admin section ----
function SupportAdminSection() {
  const [tickets, setTickets]       = useState<SupportTicket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setFilter]   = useState('');
  const [selected, setSelected]     = useState<{ ticket: SupportTicket; replies: SupportReply[] } | null>(null);
  const [replyText, setReplyText]   = useState('');
  const [replying, setReplying]     = useState(false);
  const [newStatus, setNewStatus]   = useState<'open' | 'replied' | 'closed'>('replied');
  const [actionMsg, setActionMsg]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setTickets((await adminGetSupportTickets(statusFilter || undefined)).tickets); }
    catch { setTickets([]); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function openTicket(id: string) {
    const data = await adminGetSupportTicket(id);
    setSelected(data);
    setNewStatus('replied');
    setReplyText('');
    setActionMsg('');
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setReplying(true); setActionMsg('');
    try {
      await adminReplySupportTicket(selected.ticket.id, replyText, newStatus);
      setActionMsg('Ответ отправлен');
      const data = await adminGetSupportTicket(selected.ticket.id);
      setSelected(data);
      setReplyText('');
      load();
    } catch (err: any) { setActionMsg(err.message); }
    finally { setReplying(false); }
  }

  async function handleStatus(status: string) {
    if (!selected) return;
    await adminSetSupportStatus(selected.ticket.id, status);
    const data = await adminGetSupportTicket(selected.ticket.id);
    setSelected(data);
    load();
  }

  const openCount = tickets.filter(t => t.status === 'open').length;

  return (
    <div className="flex gap-4 h-[70vh]">
      {/* Ticket list */}
      <div className="w-80 flex-shrink-0 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <select
            value={statusFilter}
            onChange={e => setFilter(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Все ({tickets.length})</option>
            <option value="open">Открытые {openCount > 0 ? `(${openCount})` : ''}</option>
            <option value="replied">Отвеченные</option>
            <option value="closed">Закрытые</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {loading && <p className="text-xs text-slate-400 p-4 text-center">Загрузка...</p>}
          {!loading && tickets.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">Нет обращений</p>}
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => openTicket(t.id)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${selected?.ticket.id === t.id ? 'bg-purple-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${TICKET_STATUS_CLASS[t.status]}`}>
                  {TICKET_STATUS_LABEL[t.status]}
                </span>
                <span className="text-xs text-slate-400">{new Date(t.updated_at).toLocaleDateString('ru-RU')}</span>
              </div>
              <p className="text-sm font-medium text-slate-800 truncate">{t.subject}</p>
              <p className="text-xs text-slate-400 truncate">{t.user_email || t.guest_email} · {TOPIC_LABEL[t.topic]}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Ticket detail */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
          Выберите обращение
        </div>
      ) : (
        <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">{TOPIC_LABEL[selected.ticket.topic]} · {selected.ticket.user_email || selected.ticket.guest_email}</p>
              <h3 className="font-semibold text-slate-800 mt-0.5">{selected.ticket.subject}</h3>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {(['open', 'replied', 'closed'] as const).map(s => (
                <button key={s} onClick={() => handleStatus(s)}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${selected.ticket.status === s ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                  {TICKET_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Dialog */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Original */}
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-500">U</div>
              <div className="flex-1 bg-slate-50 rounded-xl rounded-tl-none px-3 py-2">
                <p className="text-xs text-slate-400 mb-1">{new Date(selected.ticket.created_at).toLocaleString('ru-RU')}</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.ticket.message}</p>
              </div>
            </div>

            {selected.replies.map(r => (
              <div key={r.id} className={`flex gap-2 ${r.is_admin ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${r.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'}`}>
                  {r.is_admin ? 'А' : 'U'}
                </div>
                <div className={`flex-1 rounded-xl px-3 py-2 max-w-[85%] ${r.is_admin ? 'bg-purple-50 rounded-tr-none' : 'bg-slate-50 rounded-tl-none'}`}>
                  <p className="text-xs text-slate-400 mb-1">{new Date(r.created_at).toLocaleString('ru-RU')}{r.is_admin ? ' · Поддержка' : ''}</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.message}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Reply form */}
          <form onSubmit={handleReply} className="p-3 border-t border-slate-100 space-y-2">
            {actionMsg && <p className="text-xs text-slate-500">{actionMsg}</p>}
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Написать ответ пользователю (отправится на email)..."
              rows={3}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex items-center gap-2">
              <select
                value={newStatus}
                onChange={e => setNewStatus(e.target.value as any)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
              >
                <option value="replied">→ Статус: Отвечено</option>
                <option value="closed">→ Статус: Закрыто</option>
                <option value="open">→ Статус: Открыто</option>
              </select>
              <button
                type="submit"
                disabled={replying || !replyText.trim()}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {replying ? 'Отправка...' : 'Ответить'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'users' | 'runs' | 'scenarios' | 'support'>('users');
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
      } else if (tab === 'scenarios') {
        const data = await getScenarios();
        setScenarios(data);
      } else {
        setLoading(false);
        return;
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
    { key: 'support' as const, label: 'Обращения' },
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
        ) : tab === 'support' ? (
          <SupportAdminSection />
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

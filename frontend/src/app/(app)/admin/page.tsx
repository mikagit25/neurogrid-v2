'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminGetUsers, adminSearchUsers, adminPatchUser,
  adminGetRuns, adminRetryRun, adminAdjustBalance,
  getScenarios, adminToggleScenario, adminEditScenario,
  adminGetStats, adminGetInvoices, adminMarkInvoicePaid, adminCancelInvoice, adminPreviewInvoiceHtml,
  adminGetActs, adminGenerateAct, adminPreviewActHtml,
  adminGetSupportTickets, adminGetSupportTicket, adminReplySupportTicket, adminSetSupportStatus,
  adminGetPromoCodes, adminCreatePromoCode, adminTogglePromoCode, adminDeletePromoCode,
  adminGetReferrals,
  SUPPORT_TOPICS,
} from '@/lib/api';
import type {
  AdminUser, AdminRun, Scenario, AdminStats, AdminInvoice, AdminAct,
  SupportTicket, SupportReply, PromoCode,
} from '@/lib/api';
import { getUser } from '@/lib/auth';

// ---- Constants ----

const TOPIC_LABEL: Record<string, string> = Object.fromEntries(SUPPORT_TOPICS.map(t => [t.value, t.label]));
const TICKET_STATUS_LABEL: Record<string, string> = { open: 'Открыто', replied: 'Отвечено', closed: 'Закрыто' };
const TICKET_STATUS_CLASS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  replied: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};
const RUN_STATUS_LABELS: Record<string, string> = { queued: 'В очереди', running: 'Выполняется', success: 'Успешно', error: 'Ошибка' };
const RUN_STATUS_CLASSES: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600', running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700', error: 'bg-red-100 text-red-700',
};
const INV_STATUS_LABEL: Record<string, string> = { pending: 'Ожидает', paid: 'Оплачен', cancelled: 'Отменён' };
const INV_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};
const PLAN_LABEL: Record<string, string> = { start: 'Start', business: 'Business' };

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---- Shared feedback ----
type FeedbackMsg = { type: 'ok' | 'err'; text: string };

// ============================================================
// STATS TAB
// ============================================================

function StatsTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 flex justify-center"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!stats) return <div className="p-8 text-sm text-red-600">Не удалось загрузить статистику</div>;

  const cards = [
    { label: 'Всего пользователей', value: stats.users.total, sub: `+${stats.users.new_30d} за 30 дней`, color: 'text-purple-600' },
    { label: 'Выручка всего', value: `${Number(stats.revenue.total).toLocaleString('ru-RU')} ₽`, sub: `${Number(stats.revenue.last_30d).toLocaleString('ru-RU')} ₽ за 30 дней`, color: 'text-green-600' },
    { label: 'Запуски', value: stats.runs.total, sub: `${stats.runs.errors} ошибок · ${stats.runs.last_30d} за 30 дней`, color: 'text-blue-600' },
    { label: 'Тикеты поддержки', value: stats.tickets.total, sub: `${stats.tickets.open_count} открытых`, color: 'text-amber-600' },
    { label: 'Счета (ожидают)', value: stats.invoices.pending_count, sub: 'требуют подтверждения', color: 'text-red-600' },
  ];

  return (
    <div className="p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// USERS TAB
// ============================================================

function BalanceModal({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (isNaN(n) || n === 0) { setErr('Введите ненулевую сумму'); return; }
    setLoading(true); setErr('');
    try {
      const { newBalance } = await adminAdjustBalance(user.id, n, note || undefined);
      onDone(`Баланс обновлён: ${newBalance.toLocaleString('ru-RU')} ₽`);
      onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-slate-800">Изменить баланс</h3>
        <p className="text-sm text-slate-500">{user.email}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Сумма (+ пополнение, − списание)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="например 500 или -200" required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Комментарий (необязательно)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={200}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          {err && <p className="text-red-600 text-xs">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50">Отмена</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-lg">
              {loading ? '...' : 'Применить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersTab({ onMsg }: { onMsg: (m: FeedbackMsg) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [balanceUser, setBalanceUser] = useState<AdminUser | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try { setUsers(await adminSearchUsers(q)); }
    catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSearch(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(v || undefined), 400);
  }

  async function handleBlock(u: AdminUser) {
    try {
      await adminPatchUser(u.id, { is_active: !u.is_active });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
      onMsg({ type: 'ok', text: `Пользователь ${u.email} ${!u.is_active ? 'разблокирован' : 'заблокирован'}` });
    } catch (e: any) { onMsg({ type: 'err', text: e.message }); }
  }

  async function handleAdminToggle(u: AdminUser) {
    try {
      await adminPatchUser(u.id, { is_admin: !u.is_admin });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_admin: !u.is_admin } : x));
      onMsg({ type: 'ok', text: `Роль пользователя ${u.email} обновлена` });
    } catch (e: any) { onMsg({ type: 'err', text: e.message }); }
  }

  return (
    <div>
      <div className="px-5 py-3 border-b border-slate-100">
        <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="Поиск по email..."
          className="w-full max-w-xs px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>
      {loading ? (
        <div className="p-8 flex justify-center"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">Нет пользователей</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Баланс</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Роль</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Статус</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Регистрация</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-slate-50/50 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 text-slate-700 font-medium">{u.email}</td>
                  <td className="px-5 py-3 text-slate-700">{u.balance.toLocaleString('ru-RU')} ₽</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${u.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                      {u.is_admin ? 'Администратор' : 'Пользователь'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(u.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setBalanceUser(u)}
                        className="text-xs px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg font-medium transition-colors">
                        Баланс
                      </button>
                      <button onClick={() => handleBlock(u)}
                        className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${u.is_active ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                        {u.is_active ? 'Блок' : 'Разблок'}
                      </button>
                      <button onClick={() => handleAdminToggle(u)}
                        className="text-xs px-2 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">
                        {u.is_admin ? 'Снять admin' : 'Дать admin'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {balanceUser && (
        <BalanceModal
          user={balanceUser}
          onClose={() => setBalanceUser(null)}
          onDone={text => { onMsg({ type: 'ok', text }); load(search || undefined); }}
        />
      )}
    </div>
  );
}

// ============================================================
// RUNS TAB
// ============================================================

function RunsTab({ onMsg }: { onMsg: (m: FeedbackMsg) => void }) {
  const [runs, setRuns] = useState<AdminRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRuns(await adminGetRuns(statusFilter || undefined, 100)); }
    catch { setRuns([]); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleRetry(id: string) {
    try {
      await adminRetryRun(id);
      onMsg({ type: 'ok', text: `Запуск ${id.slice(0, 8)} поставлен в очередь повторно` });
      load();
    } catch (e: any) { onMsg({ type: 'err', text: e.message }); }
  }

  return (
    <div>
      <div className="px-5 py-3 border-b border-slate-100 flex gap-2 flex-wrap">
        {(['', 'queued', 'running', 'success', 'error'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {s ? RUN_STATUS_LABELS[s] : 'Все'}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="p-8 flex justify-center"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : runs.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">Нет запусков</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">ID</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Пользователь</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Сценарий</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Статус</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Стоимость</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Дата</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {runs.map(run => (
                <tr key={run.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3 text-slate-500 font-mono text-xs">{run.id.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-slate-700">{run.user_email}</td>
                  <td className="px-5 py-3 text-slate-700">{run.scenario_title}</td>
                  <td className="px-5 py-3">
                    <div className="space-y-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RUN_STATUS_CLASSES[run.status] || 'bg-slate-100 text-slate-600'}`}>
                        {RUN_STATUS_LABELS[run.status] || run.status}
                      </span>
                      {run.error_message && <p className="text-xs text-red-600 max-w-xs truncate" title={run.error_message}>{run.error_message}</p>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{run.cost != null ? `${run.cost.toLocaleString('ru-RU')} ₽` : '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDateTime(run.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    {run.status === 'error' && (
                      <button onClick={() => handleRetry(run.id)}
                        className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors">
                        Повторить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SCENARIOS TAB
// ============================================================

function ScenariosTab({ onMsg }: { onMsg: (m: FeedbackMsg) => void }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ title: string; description: string; price: string }>({ title: '', description: '', price: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getScenarios().then(setScenarios).catch(() => setScenarios([])).finally(() => setLoading(false));
  }, []);

  async function handleToggle(id: string, current: boolean) {
    try {
      await adminToggleScenario(id, !current);
      setScenarios(prev => prev.map(s => s.id === id ? { ...s, is_active: !current } : s));
    } catch (e: any) { onMsg({ type: 'err', text: e.message }); }
  }

  function startEdit(s: Scenario) {
    setEditing(s.id);
    setEditData({ title: s.title, description: s.description || '', price: String(s.price) });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      await adminEditScenario(id, {
        title: editData.title,
        description: editData.description,
        price: Number(editData.price),
      });
      setScenarios(prev => prev.map(s => s.id === id
        ? { ...s, title: editData.title, description: editData.description, price: Number(editData.price) }
        : s));
      setEditing(null);
      onMsg({ type: 'ok', text: 'Сценарий обновлён' });
    } catch (e: any) { onMsg({ type: 'err', text: e.message }); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 flex justify-center"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (scenarios.length === 0) return <div className="p-8 text-center text-slate-500 text-sm">Нет сценариев</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Сценарий</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Slug</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Цена</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Платформы</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">Активен</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">Редакт.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {scenarios.map(s => (
            editing === s.id ? (
              <tr key={s.id} className="bg-purple-50/40">
                <td className="px-5 py-3" colSpan={3}>
                  <div className="flex flex-col gap-2">
                    <input value={editData.title} onChange={e => setEditData(d => ({ ...d, title: e.target.value }))}
                      className="px-2 py-1 border border-slate-300 rounded text-sm w-full" placeholder="Название" />
                    <textarea value={editData.description} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))}
                      rows={2} className="px-2 py-1 border border-slate-300 rounded text-sm w-full resize-none" placeholder="Описание" />
                    <input type="number" value={editData.price} onChange={e => setEditData(d => ({ ...d, price: e.target.value }))}
                      className="px-2 py-1 border border-slate-300 rounded text-sm w-28" placeholder="Цена ₽" />
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-500">{s.platforms?.join(', ') || '—'}</td>
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => saveEdit(s.id)} disabled={saving}
                      className="text-xs px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                      {saving ? '...' : 'Сохранить'}
                    </button>
                    <button onClick={() => setEditing(null)}
                      className="text-xs px-3 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">Отмена</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={s.id} className="hover:bg-slate-50/50">
                <td className="px-5 py-3 font-medium text-slate-800">{s.title}</td>
                <td className="px-5 py-3 text-slate-500 font-mono text-xs">{s.slug}</td>
                <td className="px-5 py-3 text-slate-700">{s.price} ₽</td>
                <td className="px-5 py-3 text-slate-500">{s.platforms?.join(', ') || '—'}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => handleToggle(s.id, s.is_active !== false)}
                    className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${s.is_active !== false ? 'bg-purple-600' : 'bg-slate-300'}`}>
                    <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${s.is_active !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => startEdit(s)}
                    className="text-xs px-3 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                    Изменить
                  </button>
                </td>
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// INVOICES TAB
// ============================================================

function InvoicesTab({ onMsg }: { onMsg: (m: FeedbackMsg) => void }) {
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setInvoices((await adminGetInvoices(filter || undefined)).invoices); }
    catch { setInvoices([]); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function handleMarkPaid(inv: AdminInvoice) {
    setActioning(inv.id);
    try {
      await adminMarkInvoicePaid(inv.id);
      onMsg({ type: 'ok', text: `Счёт ${inv.invoice_number} отмечен как оплаченный` });
      load();
    } catch (e: any) { onMsg({ type: 'err', text: e.message }); }
    finally { setActioning(null); }
  }

  async function handleCancel(inv: AdminInvoice) {
    if (!confirm(`Отменить счёт ${inv.invoice_number}?`)) return;
    setActioning(inv.id);
    try {
      await adminCancelInvoice(inv.id);
      onMsg({ type: 'ok', text: `Счёт ${inv.invoice_number} отменён` });
      load();
    } catch (e: any) { onMsg({ type: 'err', text: e.message }); }
    finally { setActioning(null); }
  }

  async function handlePreview(id: string) {
    try { await adminPreviewInvoiceHtml(id); }
    catch (e: any) { onMsg({ type: 'err', text: e.message }); }
  }

  return (
    <div>
      <div className="px-5 py-3 border-b border-slate-100 flex gap-2">
        {(['pending', 'paid', 'cancelled', ''] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {s === '' ? 'Все' : INV_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="p-8 flex justify-center"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : invoices.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">Счетов нет</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Номер</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Пользователь</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Тариф</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Сумма</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Статус</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Дата</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{inv.invoice_number}</td>
                  <td className="px-5 py-3 text-slate-700">{inv.user_email || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{PLAN_LABEL[inv.plan] ?? inv.plan} × {inv.months} мес.</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{Number(inv.amount).toLocaleString('ru-RU')} ₽</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${INV_STATUS_CLASS[inv.status]}`}>
                      {INV_STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(inv.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => handlePreview(inv.id)}
                        className="text-xs px-2 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                        Просмотр
                      </button>
                      {inv.status === 'pending' && (
                        <>
                          <button onClick={() => handleMarkPaid(inv)} disabled={actioning === inv.id}
                            className="text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors disabled:opacity-50">
                            Оплачен
                          </button>
                          <button onClick={() => handleCancel(inv)} disabled={actioning === inv.id}
                            className="text-xs px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors disabled:opacity-50">
                            Отменить
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ACTS TAB
// ============================================================

function ActsTab({ onMsg }: { onMsg: (m: FeedbackMsg) => void }) {
  const [acts, setActs] = useState<AdminAct[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genUserId, setGenUserId] = useState('');
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));
  const [genMonth, setGenMonth] = useState(String(new Date().getMonth() || 12));

  const load = useCallback(async () => {
    setLoading(true);
    try { setActs((await adminGetActs()).acts); }
    catch { setActs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    try {
      await adminGenerateAct(genUserId.trim(), Number(genYear), Number(genMonth));
      onMsg({ type: 'ok', text: 'Акт сформирован' });
      setGenUserId('');
      load();
    } catch (e: any) { onMsg({ type: 'err', text: e.message }); }
    finally { setGenerating(false); }
  }

  async function handlePreview(id: string) {
    try { await adminPreviewActHtml(id); }
    catch (e: any) { onMsg({ type: 'err', text: e.message }); }
  }

  return (
    <div>
      {/* Generate form */}
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-xs font-medium text-slate-600 mb-2">Сформировать акт вручную</p>
        <form onSubmit={handleGenerate} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">User ID</label>
            <input type="text" value={genUserId} onChange={e => setGenUserId(e.target.value)} required
              placeholder="uuid пользователя"
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Год</label>
            <input type="number" value={genYear} onChange={e => setGenYear(e.target.value)} min={2024} max={2030}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-24 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Месяц</label>
            <input type="number" value={genMonth} onChange={e => setGenMonth(e.target.value)} min={1} max={12}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-20 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <button type="submit" disabled={generating}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {generating ? '...' : 'Сформировать'}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : acts.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">Актов нет</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Номер</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Пользователь</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Период</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Сумма</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Создан</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {acts.map(a => (
                <tr key={a.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{a.act_number}</td>
                  <td className="px-5 py-3 text-slate-700">{a.user_email}</td>
                  <td className="px-5 py-3 text-slate-600">{fmtDate(a.period_from)} — {fmtDate(a.period_to)}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{Number(a.amount).toLocaleString('ru-RU')} ₽</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(a.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handlePreview(a.id)}
                      className="text-xs px-3 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                      Просмотр
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SUPPORT TAB (unchanged logic, refactored to standalone)
// ============================================================

function SupportTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setFilter] = useState('');
  const [selected, setSelected] = useState<{ ticket: SupportTicket; replies: SupportReply[] } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [newStatus, setNewStatus] = useState<'open' | 'replied' | 'closed'>('replied');
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setTickets((await adminGetSupportTickets(statusFilter || undefined)).tickets); }
    catch { setTickets([]); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function openTicket(id: string) {
    const data = await adminGetSupportTicket(id);
    setSelected(data); setNewStatus('replied'); setReplyText(''); setActionMsg('');
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setReplying(true); setActionMsg('');
    try {
      await adminReplySupportTicket(selected.ticket.id, replyText, newStatus);
      setActionMsg('Ответ отправлен');
      const data = await adminGetSupportTicket(selected.ticket.id);
      setSelected(data); setReplyText(''); load();
    } catch (err: any) { setActionMsg(err.message); }
    finally { setReplying(false); }
  }

  async function handleStatus(status: string) {
    if (!selected) return;
    await adminSetSupportStatus(selected.ticket.id, status);
    const data = await adminGetSupportTicket(selected.ticket.id);
    setSelected(data); load();
  }

  const openCount = tickets.filter(t => t.status === 'open').length;

  return (
    <div className="flex gap-4 h-[70vh] p-4">
      <div className="w-80 flex-shrink-0 bg-slate-50 border border-slate-200 rounded-xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <select value={statusFilter} onChange={e => setFilter(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
            <option value="">Все ({tickets.length})</option>
            <option value="open">Открытые {openCount > 0 ? `(${openCount})` : ''}</option>
            <option value="replied">Отвеченные</option>
            <option value="closed">Закрытые</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading && <p className="text-xs text-slate-400 p-4 text-center">Загрузка...</p>}
          {!loading && tickets.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">Нет обращений</p>}
          {tickets.map(t => (
            <button key={t.id} onClick={() => openTicket(t.id)}
              className={`w-full text-left px-4 py-3 hover:bg-white transition-colors ${selected?.ticket.id === t.id ? 'bg-white' : ''}`}>
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

      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">Выберите обращение</div>
      ) : (
        <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
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
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
          <form onSubmit={handleReply} className="p-3 border-t border-slate-100 space-y-2">
            {actionMsg && <p className="text-xs text-slate-500">{actionMsg}</p>}
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder="Написать ответ пользователю (отправится на email)..."
              rows={3} required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <div className="flex items-center gap-2">
              <select value={newStatus} onChange={e => setNewStatus(e.target.value as any)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
                <option value="replied">→ Отвечено</option>
                <option value="closed">→ Закрыто</option>
                <option value="open">→ Открыто</option>
              </select>
              <button type="submit" disabled={replying || !replyText.trim()}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {replying ? 'Отправка...' : 'Ответить'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Promo codes tab ──────────────────────────────────────────────────────────
function PromoCodesTab({ onMsg }: { onMsg: (m: FeedbackMsg) => void }) {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: '', description: '', reward_amount: '', max_uses: '', expires_at: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCodes((await adminGetPromoCodes()).promo_codes); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code || !form.reward_amount) return;
    setCreating(true);
    try {
      await adminCreatePromoCode({
        code: form.code.toUpperCase(),
        description: form.description || undefined,
        reward_amount: parseFloat(form.reward_amount),
        max_uses: form.max_uses ? parseInt(form.max_uses) : undefined,
        expires_at: form.expires_at || undefined,
      });
      setForm({ code: '', description: '', reward_amount: '', max_uses: '', expires_at: '' });
      onMsg({ type: 'ok', text: 'Промо-код создан' });
      await load();
    } catch (err: any) { onMsg({ type: 'err', text: err.message }); }
    finally { setCreating(false); }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Create form */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Создать промо-код</h3>
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Код *</label>
            <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="WELCOME990" maxLength={32} required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Баланс, ₽ *</label>
            <input type="number" value={form.reward_amount} onChange={e => setForm(p => ({ ...p, reward_amount: e.target.value }))}
              placeholder="990" min="1" required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500 mb-1 block">Описание</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Велком-бонус для новых клиентов"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Макс. использований</label>
            <input type="number" value={form.max_uses} onChange={e => setForm(p => ({ ...p, max_uses: e.target.value }))}
              placeholder="∞ (без лимита)" min="1"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Действителен до</label>
            <input type="date" value={form.expires_at} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div className="col-span-2 flex justify-end">
            <button type="submit" disabled={creating}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {creating ? 'Создание...' : 'Создать промо-код'}
            </button>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : codes.length === 0 ? (
          <p className="text-center py-10 text-slate-400 text-sm">Нет промо-кодов</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Код</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Описание</th>
                <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Бонус</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">Использований</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">Статус</th>
                <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium">До</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {codes.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-purple-700">{c.code}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{c.description ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">+{Number(c.reward_amount).toLocaleString('ru-RU')} ₽</td>
                  <td className="px-4 py-3 text-center text-slate-600">{c.used_count}{c.max_uses ? `/${c.max_uses}` : ''}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.is_active ? 'Активен' : 'Отключён'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500 text-xs">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString('ru-RU') : '∞'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={async () => { await adminTogglePromoCode(c.id, !c.is_active); await load(); }}
                        className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 transition-colors">
                        {c.is_active ? 'Откл.' : 'Вкл.'}
                      </button>
                      <button onClick={async () => { if (!confirm('Удалить?')) return; await adminDeletePromoCode(c.id); onMsg({ type: 'ok', text: 'Удалён' }); await load(); }}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors">
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Referrals tab ─────────────────────────────────────────────────────────────
function ReferralsTab() {
  const [referrals, setReferrals] = useState<{ referrer_email: string; referral_code: string; referred_count: number; total_earned: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetReferrals().then(d => setReferrals(d.referrals)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <h3 className="font-semibold text-slate-800 mb-4">Активные рефереры</h3>
      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : referrals.length === 0 ? (
        <p className="text-center py-10 text-slate-400 text-sm">Нет активных рефереров</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Email</th>
              <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Реф. код</th>
              <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Приглашено</th>
              <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Заработано</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {referrals.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700">{r.referrer_email}</td>
                <td className="px-4 py-3 font-mono text-purple-700 text-xs">{r.referral_code}</td>
                <td className="px-4 py-3 text-right font-semibold">{r.referred_count}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-600">{Number(r.total_earned).toLocaleString('ru-RU')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================
// PAGE
// ============================================================

type TabKey = 'stats' | 'users' | 'runs' | 'scenarios' | 'invoices' | 'acts' | 'support' | 'promo' | 'referrals';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'stats',     label: 'Метрики' },
  { key: 'users',     label: 'Пользователи' },
  { key: 'runs',      label: 'Запуски' },
  { key: 'scenarios', label: 'Сценарии' },
  { key: 'invoices',  label: 'Счета' },
  { key: 'acts',      label: 'Акты' },
  { key: 'support',   label: 'Обращения' },
  { key: 'promo',     label: '🎁 Промо-коды' },
  { key: 'referrals', label: '👥 Рефералы' },
];

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('stats');
  const [msg, setMsg] = useState<FeedbackMsg | null>(null);

  useEffect(() => {
    const u = getUser();
    if (u && !u.isAdmin) router.replace('/dashboard');
  }, [router]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Администрирование</h1>
        <p className="text-slate-500 mt-1">Управление платформой NeuroGrid</p>
      </div>

      {msg && (
        <div className={`p-3 border rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="border-b border-slate-100 overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'stats'      && <StatsTab />}
        {tab === 'users'      && <UsersTab onMsg={setMsg} />}
        {tab === 'runs'       && <RunsTab onMsg={setMsg} />}
        {tab === 'scenarios'  && <ScenariosTab onMsg={setMsg} />}
        {tab === 'invoices'   && <InvoicesTab onMsg={setMsg} />}
        {tab === 'acts'       && <ActsTab onMsg={setMsg} />}
        {tab === 'support'    && <SupportTab />}
        {tab === 'promo'      && <PromoCodesTab onMsg={setMsg} />}
        {tab === 'referrals'  && <ReferralsTab />}
      </div>
    </div>
  );
}

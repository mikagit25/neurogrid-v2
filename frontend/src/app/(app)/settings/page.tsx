'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  ApiKey, TelegramConnection, TeamMember, TeamInvitation, Webhook, BillingProfile,
  ReferralStats,
  getApiKeys, createApiKey, revokeApiKey,
  getTelegramConnection, generateTelegramToken, updateTelegramSettings, disconnectTelegram,
  getTeamMembers, inviteTeamMember, removeTeamMember, revokeTeamInvitation,
  getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook,
  getBillingProfile, updateBillingProfile, autofillBillingProfile,
  getReferralStats, applyPromoCode,
} from '../../../lib/api';

// ---- API Keys section ----
function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setKeys(await getApiKeys()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onCreate() {
    setError('');
    if (!newName.trim()) { setError('Введите название ключа'); return; }
    setCreating(true);
    try {
      const k = await createApiKey({ name: newName });
      setCreatedKey(k.key ?? null);
      setNewName('');
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  }

  async function onRevoke(id: string) {
    if (!confirm('Отозвать этот API-ключ?')) return;
    await revokeApiKey(id);
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">API-ключи</h2>
        <p className="text-sm text-gray-500 mt-0.5">Создавайте ключи для интеграции с вашими системами</p>
      </div>

      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-800 mb-1">✓ Ключ создан! Сохраните его — он больше не будет показан:</p>
          <code className="block bg-white border rounded px-3 py-2 text-sm font-mono break-all text-gray-800">{createdKey}</code>
          <button onClick={() => { navigator.clipboard.writeText(createdKey); }} className="mt-2 text-xs text-green-700 hover:text-green-900">Копировать</button>
          <button onClick={() => setCreatedKey(null)} className="ml-4 text-xs text-gray-400 hover:text-gray-600">Закрыть</button>
        </div>
      )}

      <div className="flex gap-3">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Название ключа (например: My Integration)"
          className="flex-1 border rounded px-3 py-2 text-sm"
          onKeyDown={e => e.key === 'Enter' && onCreate()}
        />
        <button onClick={onCreate} disabled={creating} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
          {creating ? 'Создаём...' : 'Создать'}
        </button>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}

      {loading ? (
        <div className="text-gray-400 text-sm">Загрузка...</div>
      ) : keys.length === 0 ? (
        <div className="text-gray-400 text-sm py-4">Нет API-ключей</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Название</th>
                <th className="px-4 py-3 text-left">Префикс</th>
                <th className="px-4 py-3 text-left">Последнее использование</th>
                <th className="px-4 py-3 text-left">Создан</th>
                <th className="px-4 py-3 text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map(k => (
                <tr key={k.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{k.key_prefix}...</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{k.last_used_at ? new Date(k.last_used_at).toLocaleString('ru') : 'Никогда'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(k.created_at).toLocaleDateString('ru')}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onRevoke(k.id)} className="text-red-400 hover:text-red-600 text-xs">Отозвать</button>
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

// ---- Telegram section ----
function TelegramSection() {
  const [conn, setConn] = useState<TelegramConnection | null | undefined>(undefined);
  const [tokenInfo, setTokenInfo] = useState<{ command: string; bot_url: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ notify_alerts: true, notify_orders: false, notify_pnl: false });

  const load = useCallback(async () => {
    try {
      const c = await getTelegramConnection();
      setConn(c);
      if (c) setSettings({ notify_alerts: c.notify_alerts, notify_orders: c.notify_orders, notify_pnl: c.notify_pnl });
    } catch { setConn(null); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onGenerate() {
    setGenerating(true);
    try {
      const info = await generateTelegramToken();
      setTokenInfo(info);
    } finally { setGenerating(false); }
  }

  async function onSaveSettings() {
    setSaving(true);
    try { await updateTelegramSettings(settings); await load(); } finally { setSaving(false); }
  }

  async function onDisconnect() {
    if (!confirm('Отключить Telegram?')) return;
    await disconnectTelegram();
    setConn(null);
    setTokenInfo(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Telegram-бот</h2>
        <p className="text-sm text-gray-500 mt-0.5">Получайте алерты и уведомления в Telegram</p>
      </div>

      {conn === undefined ? (
        <div className="text-gray-400 text-sm">Загрузка...</div>
      ) : conn && conn.is_active ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-green-800">Telegram подключён</p>
              <p className="text-sm text-green-700">
                {conn.first_name || conn.username ? `${conn.first_name ?? ''} ${conn.username ? `(@${conn.username})` : ''}` : `Chat ID: ${conn.chat_id}`}
              </p>
            </div>
            <button onClick={onDisconnect} className="ml-auto text-sm text-red-400 hover:text-red-600">Отключить</button>
          </div>

          <div className="bg-white rounded-xl border p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Уведомления:</p>
            {[
              ['notify_alerts', 'Алерты (низкий остаток, падение позиций, конкуренты)'],
              ['notify_orders', 'Новые заказы'],
              ['notify_pnl', 'Ежедневный отчёт P&L'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[key as keyof typeof settings]}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
            <button onClick={onSaveSettings} disabled={saving} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl border p-4">
            <p className="text-sm text-gray-600 mb-3">
              Для подключения Telegram-бота нажмите «Получить токен», откройте бота и отправьте команду подключения.
            </p>
            <button onClick={onGenerate} disabled={generating} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
              {generating ? 'Генерируем...' : 'Получить токен подключения'}
            </button>
          </div>

          {tokenInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800">1. Откройте бота в Telegram:</p>
              <a href={tokenInfo.bot_url} target="_blank" rel="noopener noreferrer" className="inline-block bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                Открыть @neurogrid_bot
              </a>
              <p className="text-sm font-semibold text-blue-800">2. Отправьте эту команду боту:</p>
              <code className="block bg-white border rounded px-3 py-2 text-sm font-mono break-all">{tokenInfo.command}</code>
              <button onClick={() => navigator.clipboard.writeText(tokenInfo.command)} className="text-xs text-blue-600 hover:text-blue-800">Копировать команду</button>
              <p className="text-xs text-blue-600">Токен действителен 10 минут</p>
            </div>
          )}

          {/* Bot commands reference */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Команды бота</p>
            <div className="space-y-2">
              {[
                ['/stats', 'Выручка сегодня и за 7 дней'],
                ['/stock', 'Критичные остатки (≤ 5 шт.)'],
                ['/alerts', 'Непрочитанные алерты'],
                ['/report', 'Мини P&L за 30 дней'],
                ['/status', 'Статус подключения'],
                ['/disconnect', 'Отключить бота'],
                ['/help', 'Список всех команд'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-center gap-3">
                  <code className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 font-mono text-purple-700 shrink-0">{cmd}</code>
                  <span className="text-xs text-slate-600">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Team section ----
const ROLE_LABELS: Record<string, string> = {
  analyst: 'Аналитик',
  manager: 'Менеджер',
  admin: 'Администратор',
};
const ROLE_DESC: Record<string, string> = {
  analyst: 'Только просмотр',
  manager: 'Просмотр + правила',
  admin: 'Полный доступ',
};

function TeamSection() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pending, setPending] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('analyst');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTeamMembers();
      setMembers(data.members);
      setPending(data.pending);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onInvite() {
    setError(''); setSuccess('');
    if (!email.trim()) { setError('Введите email'); return; }
    setInviting(true);
    try {
      await inviteTeamMember(email.trim(), role);
      setSuccess(`Приглашение отправлено на ${email.trim()}`);
      setEmail('');
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setInviting(false); }
  }

  async function onRemove(id: string) {
    if (!confirm('Удалить участника из команды?')) return;
    await removeTeamMember(id);
    await load();
  }

  async function onRevoke(id: string) {
    await revokeTeamInvitation(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Команда</h2>
        <p className="text-sm text-gray-500 mt-0.5">Пригласите коллег для совместной работы. Максимум 5 участников.</p>
      </div>

      {/* Invite form */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-slate-700">Пригласить участника</p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email коллеги"
            className="flex-1 min-w-48 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <select value={role} onChange={e => setRole(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l} — {ROLE_DESC[v]}</option>
            ))}
          </select>
          <button onClick={onInvite} disabled={inviting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {inviting ? 'Отправляем...' : 'Пригласить'}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">{success}</p>}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Active members */}
          {members.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Участники ({members.length})</p>
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm flex-shrink-0">
                      {(m.email[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{m.name || m.email}</p>
                      <p className="text-xs text-slate-500">{m.email} · {ROLE_LABELS[m.role] ?? m.role}</p>
                    </div>
                    <button onClick={() => onRemove(m.id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending invitations */}
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ожидают ответа ({pending.length})</p>
              <div className="space-y-2">
                {pending.map(inv => (
                  <div key={inv.id} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-sm flex-shrink-0">⏳</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{inv.email}</p>
                      <p className="text-xs text-slate-500">{ROLE_LABELS[inv.role] ?? inv.role} · до {new Date(inv.expires_at).toLocaleDateString('ru-RU')}</p>
                    </div>
                    <button onClick={() => onRevoke(inv.id)}
                      className="text-xs text-slate-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                      Отозвать
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {members.length === 0 && pending.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
              Пока нет участников команды
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Webhooks section ----
const WEBHOOK_EVENTS = [
  { id: 'run.completed', label: 'Сценарий завершён' },
  { id: 'run.failed', label: 'Сценарий упал с ошибкой' },
  { id: 'alert.fired', label: 'Алерт сработал' },
  { id: 'price.changed', label: 'Цена изменена правилом' },
  { id: 'stock.low', label: 'Низкий остаток' },
];

function WebhooksSection() {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['run.completed']);
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setHooks(await getWebhooks()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onCreate() {
    setError('');
    if (!url.trim() || !url.startsWith('http')) { setError('Введите корректный URL'); return; }
    if (!selectedEvents.length) { setError('Выберите хотя бы одно событие'); return; }
    setCreating(true);
    try {
      const wh = await createWebhook({ url: url.trim(), events: selectedEvents });
      setCreatedSecret(wh.secret);
      setUrl('');
      setSelectedEvents(['run.completed']);
      await load();
    } catch (e: any) {
      setError(e.message || 'Ошибка создания');
    } finally { setCreating(false); }
  }

  async function onToggle(wh: Webhook) {
    await updateWebhook(wh.id, { is_active: !wh.is_active });
    setHooks(hs => hs.map(h => h.id === wh.id ? { ...h, is_active: !wh.is_active } : h));
  }

  async function onDelete(id: string) {
    if (!confirm('Удалить вебхук?')) return;
    await deleteWebhook(id);
    setHooks(hs => hs.filter(h => h.id !== id));
  }

  async function onTest(id: string) {
    setTesting(id);
    try { await testWebhook(id); } catch { /* ignore */ } finally { setTesting(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Исходящие вебхуки</h2>
        <p className="text-sm text-gray-500 mt-1">NeuroGrid отправит POST-запрос на ваш URL при наступлении события</p>
      </div>

      {createdSecret && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
          <p className="text-sm font-semibold text-amber-800">Секрет для верификации подписи (сохраните сейчас — больше не покажем)</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded break-all flex-1">{createdSecret}</code>
            <button onClick={() => { navigator.clipboard.writeText(createdSecret); }}
              className="text-xs text-amber-700 border border-amber-300 px-2 py-1 rounded hover:bg-amber-100">
              Копировать
            </button>
          </div>
          <p className="text-xs text-amber-600">Заголовок: <code>X-NeuroGrid-Signature: sha256=&lt;hmac&gt;</code></p>
          <button onClick={() => setCreatedSecret(null)} className="text-xs text-amber-600 hover:text-amber-800">Закрыть</button>
        </div>
      )}

      {/* Create form */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Добавить вебхук</p>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://yourapp.com/webhook"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map(ev => (
            <label key={ev.id} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedEvents.includes(ev.id)}
                onChange={e => setSelectedEvents(sel => e.target.checked ? [...sel, ev.id] : sel.filter(s => s !== ev.id))}
                className="rounded accent-purple-600"
              />
              <span className="text-xs text-gray-600">{ev.label}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {creating ? 'Добавление...' : 'Добавить'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : hooks.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Вебхуков пока нет</div>
      ) : (
        <div className="space-y-2">
          {hooks.map(wh => (
            <div key={wh.id} className={`border rounded-xl p-4 ${wh.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{wh.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {wh.events.map(ev => (
                      <span key={ev} className="text-xs bg-purple-50 text-purple-700 border border-purple-100 rounded px-1.5 py-0.5">
                        {WEBHOOK_EVENTS.find(e => e.id === ev)?.label ?? ev}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {wh.last_fired_at ? `Последний вызов: ${new Date(wh.last_fired_at).toLocaleString('ru-RU')} · HTTP ${wh.last_status}` : 'Ещё не вызывался'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onTest(wh.id)}
                    disabled={testing === wh.id}
                    className="text-xs text-blue-600 border border-blue-200 px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {testing === wh.id ? '...' : 'Тест'}
                  </button>
                  <button
                    onClick={() => onToggle(wh)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${wh.is_active ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-green-200 text-green-700 hover:bg-green-50'}`}
                  >
                    {wh.is_active ? 'Отключить' : 'Включить'}
                  </button>
                  <button
                    onClick={() => onDelete(wh.id)}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-100 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
        <p className="font-medium text-slate-700">Верификация подписи (HMAC-SHA256)</p>
        <p>Каждый запрос содержит заголовок <code className="bg-slate-100 px-1 rounded">X-NeuroGrid-Signature: sha256=&lt;hex&gt;</code></p>
        <p>Вычислите: <code className="bg-slate-100 px-1 rounded">HMAC-SHA256(secret, body)</code> и сравните с заголовком</p>
      </div>
    </div>
  );
}

// ---- Billing Profile section ----
function BillingProfileSection() {
  const empty: Partial<BillingProfile> = {
    company_name: '', unp: '', legal_address: '', iban: '',
    bank_name: '', bic: '', contact_person: '', phone: '', billing_email: '',
  };
  const [form, setForm] = useState<Partial<BillingProfile>>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autofilling, setAutofilling] = useState<'wb' | 'ozon' | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { profile } = await getBillingProfile();
      if (profile) setForm({ ...empty, ...profile });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function set(field: keyof BillingProfile, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateBillingProfile(form);
      setSaved(true);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleAutofill(platform: 'wb' | 'ozon') {
    setAutofilling(platform); setError('');
    try {
      const { profile } = await autofillBillingProfile(platform);
      setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v)) }));
      setSaved(false);
    } catch (err: any) { setError(err.message || `Не удалось загрузить данные с ${platform.toUpperCase()}`); }
    finally { setAutofilling(null); }
  }

  const field = (label: string, key: keyof BillingProfile, placeholder?: string, hint?: string) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={key === 'billing_email' ? 'email' : 'text'}
        value={(form[key] as string) ?? ''}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );

  if (loading) return <div className="text-sm text-gray-400 py-4">Загрузка...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Реквизиты для документов</h2>
        <p className="text-sm text-gray-500 mt-0.5">Используются при формировании счётов на оплату и актов выполненных работ</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleAutofill('ozon')}
          disabled={!!autofilling}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {autofilling === 'ozon' ? 'Загрузка...' : 'Загрузить с Ozon'}
        </button>
        <button
          onClick={() => handleAutofill('wb')}
          disabled={!!autofilling}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {autofilling === 'wb' ? 'Загрузка...' : 'Загрузить с WB'}
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {saved && <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">Реквизиты сохранены</div>}

      <form onSubmit={handleSave} className="space-y-3">
        {field('Наименование организации / ИП', 'company_name', 'ООО «Компания» или ИП Иванов И.И.')}
        {field('УНП / ИНН', 'unp', '490556542')}
        {field('Юридический адрес', 'legal_address', '220000, г. Минск, ул. Ленина, 1')}
        {field('IBAN / Расчётный счёт', 'iban', 'BY...')}
        {field('Банк', 'bank_name', 'ОАО «Белинвестбанк»')}
        {field('БИК банка', 'bic', 'BLBBBY2X')}
        {field('Контактное лицо', 'contact_person', 'Иванов Иван Иванович')}
        {field('Телефон', 'phone', '+375-29-0000000')}
        {field('Email для документов', 'billing_email', 'buh@company.by', 'Если отличается от email аккаунта')}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Сохранение...' : 'Сохранить реквизиты'}
          </button>
        </div>
      </form>

      <p className="text-xs text-gray-400">
        Данные хранятся только на сервере и используются исключительно для формирования документов.
      </p>
    </div>
  );
}

// ── Referral & Promo section ──────────────────────────────────────────────────
function ReferralSection() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoInput, setPromoInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getReferralStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const referralUrl = stats
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://neurogrid.network'}/register?ref=${stats.referral_code}`
    : '';

  async function handleCopy() {
    await navigator.clipboard.writeText(referralUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleApplyPromo(e: React.FormEvent) {
    e.preventDefault();
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoMsg(null);
    try {
      const res = await applyPromoCode(promoInput.trim().toUpperCase());
      setPromoMsg({ ok: true, text: `Промо-код активирован! Начислено +${res.reward_amount} ₽` });
      setPromoInput('');
      const fresh = await getReferralStats();
      setStats(fresh);
    } catch (err: any) {
      setPromoMsg({ ok: false, text: err.message ?? 'Ошибка' });
    } finally {
      setPromoLoading(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Promo code */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Активировать промо-код</h2>
        <p className="text-sm text-slate-500 mb-4">Если у вас есть промо-код от NeuroGrid — введите его и получите баланс на счёт.</p>
        <form onSubmit={handleApplyPromo} className="flex gap-2">
          <input
            type="text"
            value={promoInput}
            onChange={e => setPromoInput(e.target.value.toUpperCase())}
            placeholder="WELCOME990"
            maxLength={32}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={promoLoading || !promoInput.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {promoLoading ? 'Проверка...' : 'Активировать'}
          </button>
        </form>
        {promoMsg && (
          <p className={`mt-2 text-sm ${promoMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{promoMsg.text}</p>
        )}
      </div>

      {/* Referral program */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Реферальная программа</h2>
          <p className="text-sm text-slate-500">Приглашайте продавцов и получайте <strong>{stats?.commission_pct ?? 15}%</strong> от каждого пополнения их баланса — зачисляется сразу на ваш счёт.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Приглашено', value: stats?.referred_count ?? 0 },
            { label: 'Заработано, ₽', value: (stats?.total_earned ?? 0).toLocaleString('ru-RU') },
            { label: 'Комиссия', value: `${stats?.commission_pct ?? 15}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Referral link */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Ваша реферальная ссылка</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={referralUrl}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-mono"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              {copied ? '✓ Скопировано' : 'Копировать'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Код: <span className="font-mono font-semibold">{stats?.referral_code}</span></p>
        </div>

        {/* How it works */}
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm font-medium text-purple-800 mb-2">Как это работает</p>
          <ol className="space-y-1.5 text-sm text-purple-700">
            <li className="flex gap-2"><span className="font-bold">1.</span> Поделитесь ссылкой с другими продавцами маркетплейсов</li>
            <li className="flex gap-2"><span className="font-bold">2.</span> Когда они зарегистрируются и пополнят баланс — вы получите {stats?.commission_pct ?? 15}%</li>
            <li className="flex gap-2"><span className="font-bold">3.</span> Бонус зачисляется автоматически и тратится на любые функции NeuroGrid</li>
          </ol>
        </div>

        {/* Recent earnings */}
        {stats && stats.recent_earnings.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-700 mb-3">Последние начисления</p>
            <div className="space-y-2">
              {stats.recent_earnings.map((e, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm text-slate-700">{e.referred_email.replace(/(.{2}).+(@.+)/, '$1***$2')}</p>
                    <p className="text-xs text-slate-400">Пополнение {Number(e.topup_amount).toLocaleString('ru-RU')} ₽ · {new Date(e.created_at).toLocaleDateString('ru-RU')}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600">+{Number(e.earned_amount).toLocaleString('ru-RU')} ₽</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('api-keys');

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Интеграции и настройки</h1>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {[
          ['api-keys', 'API-ключи'],
          ['webhooks', 'Вебхуки'],
          ['telegram', 'Telegram'],
          ['team', 'Команда'],
          ['billing', 'Реквизиты'],
          ['referral', '🎁 Реферальная'],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      <div className="max-w-2xl">
        {tab === 'api-keys'  && <ApiKeysSection />}
        {tab === 'webhooks'  && <WebhooksSection />}
        {tab === 'telegram'  && <TelegramSection />}
        {tab === 'team'      && <TeamSection />}
        {tab === 'billing'   && <BillingProfileSection />}
        {tab === 'referral'  && <ReferralSection />}
      </div>
    </div>
  );
}

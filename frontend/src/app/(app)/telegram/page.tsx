'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  TelegramConnection, TelegramConnectInfo,
  getTelegramConnection, getTelegramConnectToken,
  updateTelegramSettings, disconnectTelegram, sendTelegramTest,
} from '@/lib/api';

const NOTIF_OPTIONS: { key: keyof TelegramConnection; label: string; desc: string }[] = [
  { key: 'notify_alerts',      label: 'Алерты',              desc: 'Критические изменения: цена, остатки, рейтинг' },
  { key: 'notify_orders',      label: 'Новые заказы',        desc: 'Уведомление при поступлении FBS-заказов' },
  { key: 'notify_pnl',         label: 'Еженедельный P&L',    desc: 'Краткий отчёт по прибыли каждый понедельник' },
  { key: 'notify_low_stock',   label: 'Низкие остатки',      desc: 'Когда товара осталось меньше чем на 7 дней' },
  { key: 'notify_competitors', label: 'Изменения конкурентов', desc: 'Когда конкурент меняет цену выше порога' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-purple-600' : 'bg-slate-200'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

function TelegramIcon() {
  return (
    <svg className="w-10 h-10 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export default function TelegramPage() {
  const [conn, setConn]       = useState<TelegramConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [connectInfo, setConnectInfo] = useState<TelegramConnectInfo | null>(null);
  const [connecting, setConnecting]   = useState(false);
  const [testing, setTesting]         = useState(false);
  const [testOk, setTestOk]           = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveOk, setSaveOk]           = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await getTelegramConnection();
      setConn(c?.is_active ? c : null);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleGetToken() {
    setConnecting(true);
    setError('');
    try {
      const info = await getTelegramConnectToken();
      setConnectInfo(info);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка');
    } finally {
      setConnecting(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestOk(false);
    try {
      await sendTelegramTest();
      setTestOk(true);
      setTimeout(() => setTestOk(false), 3000);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка отправки');
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Отключить Telegram-бот? Вы перестанете получать уведомления.')) return;
    setDisconnecting(true);
    try {
      await disconnectTelegram();
      setConn(null);
      setConnectInfo(null);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleToggle(key: keyof TelegramConnection, val: boolean) {
    if (!conn) return;
    const updated = { ...conn, [key]: val };
    setConn(updated);
    setSaving(true);
    try {
      await updateTelegramSettings({ [key]: val });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 1500);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка сохранения');
      setConn(conn); // revert
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Telegram-уведомления</h1>
        <p className="text-slate-500 text-sm mt-0.5">Получайте алерты и отчёты прямо в Telegram</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}

      {/* Status card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <TelegramIcon />
          <div className="flex-1">
            {conn ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-semibold text-slate-900">Подключён</span>
                </div>
                <p className="text-sm text-slate-500">
                  {conn.first_name && `${conn.first_name}`}
                  {conn.username && ` (@${conn.username})`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Подключён {new Date(conn.connected_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      testOk
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50'
                    }`}
                  >
                    {testing ? (
                      <><span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> Отправка...</>
                    ) : testOk ? (
                      '✓ Отправлено!'
                    ) : (
                      'Тест-сообщение'
                    )}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? 'Отключение...' : 'Отключить'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-900 mb-1">Не подключён</p>
                <p className="text-sm text-slate-500">
                  Подключите Telegram-бот, чтобы получать уведомления в режиме реального времени
                </p>
                <button
                  onClick={handleGetToken}
                  disabled={connecting}
                  className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {connecting ? (
                    <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Генерация...</>
                  ) : (
                    'Подключить бот'
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Connect instructions */}
        {connectInfo && !conn && (
          <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
            <p className="text-sm font-semibold text-slate-700">Как подключить:</p>
            <ol className="space-y-3 text-sm text-slate-600 list-none">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>
                  Откройте бот:{' '}
                  <a href={connectInfo.bot_url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium">
                    {connectInfo.bot_url}
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>Отправьте следующую команду в чат бота:</span>
              </li>
            </ol>
            <div className="relative bg-slate-900 rounded-lg px-4 py-3">
              <code className="text-green-400 text-sm font-mono">{connectInfo.command}</code>
              <button
                onClick={() => navigator.clipboard.writeText(connectInfo.command)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                title="Скопировать"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-slate-400">Токен действителен 10 минут. После отправки команды обновите эту страницу.</p>
            <button
              onClick={() => { load(); setConnectInfo(null); }}
              className="text-sm text-purple-600 hover:underline"
            >
              Обновить статус
            </button>
          </div>
        )}
      </div>

      {/* Notification toggles */}
      {conn && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Что присылать</h2>
            {saving && <span className="text-xs text-slate-400">Сохранение...</span>}
            {saveOk && <span className="text-xs text-green-600">✓ Сохранено</span>}
          </div>
          <div className="space-y-4">
            {NOTIF_OPTIONS.map(opt => (
              <div key={opt.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                </div>
                <Toggle
                  checked={!!conn[opt.key]}
                  onChange={v => handleToggle(opt.key, v)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2">О боте</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Бот работает в режиме уведомлений — отвечает только на команды подключения.
          Алерты отправляются автоматически при наступлении событий: сработка правил,
          критические изменения, еженедельные отчёты.
        </p>
      </div>
    </div>
  );
}

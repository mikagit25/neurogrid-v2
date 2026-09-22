'use client';

import { useEffect, useState, useCallback } from 'react';
import { getNotifications, markNotificationRead, getDigestSettings, updateDigestSettings, getAlertEmailSettings, updateAlertEmailSettings } from '@/lib/api';
import type { Notification } from '@/lib/api';

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  automation_done:    { icon: '✅', color: 'border-green-200 bg-green-50',   label: 'Автоматизация' },
  automation_error:   { icon: '❌', color: 'border-red-200 bg-red-50',       label: 'Ошибка' },
  automation_skipped: { icon: '⏭️', color: 'border-slate-200 bg-slate-50',   label: 'Пропущено' },
  review_draft:       { icon: '⭐', color: 'border-purple-200 bg-purple-50', label: 'Черновик ответа' },
  price_report:       { icon: '📊', color: 'border-blue-200 bg-blue-50',     label: 'Отчёт по ценам' },
  stock_alert:        { icon: '⚠️', color: 'border-amber-200 bg-amber-50',   label: 'Остатки' },
  stock_ok:           { icon: '📦', color: 'border-green-200 bg-green-50',   label: 'Остатки' },
  seo_report:         { icon: '🔍', color: 'border-indigo-200 bg-indigo-50', label: 'SEO-аудит' },
  card_update:        { icon: '📝', color: 'border-purple-200 bg-purple-50', label: 'Карточки' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface ReviewMeta {
  reviewId: string;
  draft: string;
  platform: 'wb' | 'ozon';
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestSaving, setDigestSaving] = useState(false);
  const [alertEmailEnabled, setAlertEmailEnabled] = useState(true);
  const [alertEmailSaving, setAlertEmailSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, digestSettings, alertEmailSettings] = await Promise.all([
        getNotifications(),
        getDigestSettings(),
        getAlertEmailSettings(),
      ]);
      setNotifications(data);
      setDigestEnabled(digestSettings.digestEnabled);
      setAlertEmailEnabled(alertEmailSettings.alertEmailEnabled);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleDigestToggle(enabled: boolean) {
    setDigestSaving(true);
    try {
      await updateDigestSettings(enabled);
      setDigestEnabled(enabled);
    } catch { /* ignore */ }
    finally { setDigestSaving(false); }
  }

  useEffect(() => { load(); }, [load]);

  async function handleRead(id: string) {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleReadAll() {
    const unread = notifications.filter((n) => !n.is_read);
    await Promise.all(unread.map((n) => markNotificationRead(n.id)));
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const grouped = {
    unread: notifications.filter((n) => !n.is_read),
    read:   notifications.filter((n) => n.is_read),
  };

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  function NotifCard({ n }: { n: Notification }) {
    const meta = TYPE_META[n.type] ?? { icon: '🔔', color: 'border-slate-200 bg-slate-50', label: 'Уведомление' };
    const isExpanded = expanded === n.id;
    const isLong = n.text.length > 200;

    let reviewMeta: ReviewMeta | null = null;
    if (n.type === 'review_draft' && (n as any).meta) {
      try { reviewMeta = JSON.parse((n as any).meta); } catch {}
    }

    return (
      <div className={`rounded-xl border p-4 transition-all ${meta.color} ${!n.is_read ? 'shadow-sm' : 'opacity-75'}`}>
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0 mt-0.5">{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{meta.label}</span>
              <span className="text-xs text-slate-400">{formatDate(n.created_at)}</span>
              {!n.is_read && (
                <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
              )}
            </div>
            <p className={`text-sm text-slate-800 leading-relaxed whitespace-pre-line ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}>
              {n.text}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded(isExpanded ? null : n.id)}
                className="text-xs text-purple-600 hover:text-purple-700 mt-1 font-medium"
              >
                {isExpanded ? 'Свернуть' : 'Показать полностью'}
              </button>
            )}

            {/* Review draft actions */}
            {reviewMeta && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200">
                <p className="text-xs font-medium text-slate-500 mb-1.5">Черновик ответа:</p>
                <p className="text-sm text-slate-700 leading-relaxed">{reviewMeta.draft}</p>
              </div>
            )}
          </div>
          {!n.is_read && (
            <button
              onClick={() => handleRead(n.id)}
              className="shrink-0 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              ✓
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Уведомления</h1>
          <p className="text-slate-500 mt-1">Результаты автоматизаций и черновики для публикации</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleReadAll}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Отметить все как прочитанные ({unreadCount})
          </button>
        )}
      </div>

      {/* Digest settings card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-lg">📧</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Email-дайджест</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Ежедневное письмо в 8:00 — выручка, остатки склада, новые уведомления
              </p>
            </div>
          </div>
          <button
            onClick={() => handleDigestToggle(!digestEnabled)}
            disabled={digestSaving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              digestEnabled ? 'bg-purple-600' : 'bg-slate-200'
            }`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
              digestEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
        {digestEnabled && (
          <p className="text-xs text-slate-400 mt-3 ml-13">
            Дайджест отправляется на email вашего аккаунта каждое утро в 08:00
          </p>
        )}
      </div>

      {/* Alert email settings card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-lg">🔔</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Email при срабатывании алертов</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Моментальное письмо когда срабатывает алерт: мало стока, падение цены, позиции и т.д.
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              setAlertEmailSaving(true);
              try {
                await updateAlertEmailSettings(!alertEmailEnabled);
                setAlertEmailEnabled(e => !e);
              } catch { /* ignore */ }
              finally { setAlertEmailSaving(false); }
            }}
            disabled={alertEmailSaving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              alertEmailEnabled ? 'bg-amber-500' : 'bg-slate-200'
            }`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
              alertEmailEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
        {alertEmailEnabled && (
          <p className="text-xs text-slate-400 mt-3">
            Письмо придёт сразу при срабатывании — не дожидаясь утреннего дайджеста
          </p>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="text-5xl mb-4">🔔</div>
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Уведомлений пока нет</h2>
          <p className="text-slate-400 text-sm">Они появятся когда агенты завершат работу</p>
          <a href="/automations" className="mt-4 inline-block text-sm text-purple-600 hover:text-purple-700 font-medium">
            Настроить автоматизации →
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.unread.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Новые · {grouped.unread.length}
              </h2>
              {grouped.unread.map((n) => <NotifCard key={n.id} n={n} />)}
            </div>
          )}
          {grouped.read.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                Прочитанные · {grouped.read.length}
              </h2>
              {grouped.read.map((n) => <NotifCard key={n.id} n={n} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

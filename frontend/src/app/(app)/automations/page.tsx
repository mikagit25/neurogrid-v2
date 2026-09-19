'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAutomations, getConnections, upsertAutomation, updateAutomation,
  deleteAutomation, triggerAutomation,
} from '@/lib/api';
import type { Automation, Connection } from '@/lib/api';

const SCENARIO_META: Record<string, { icon: string; title: string; desc: string; needsConnection: boolean }> = {
  'review-drafts':     { icon: '⭐', title: 'Ответы на отзывы',   desc: 'Каждый час забирает новые отзывы, генерирует ответы и публикует или складывает в очередь.',    needsConnection: true },
  'card-generator':    { icon: '📝', title: 'Генератор карточек',  desc: 'Забирает товары из каталога, генерирует SEO-описания и обновляет карточки автоматически.',       needsConnection: true },
  'price-monitor':     { icon: '📊', title: 'Мониторинг цен',      desc: 'Ежедневно анализирует цены конкурентов и присылает отчёт с рекомендациями.',                    needsConnection: true },
  'stock-forecast':    { icon: '📦', title: 'Прогноз остатков',    desc: 'Ежедневно считает скорость продаж и предупреждает об out-of-stock за 7–14 дней.',               needsConnection: true },
  'seo-audit':         { icon: '🔍', title: 'SEO-аудит',           desc: 'Еженедельно проверяет все карточки и присылает список с конкретными правками.',                  needsConnection: true },
  'photo-generator':   { icon: '📸', title: 'Фото-генератор',      desc: 'Генерация фото запускается вручную — укажи параметры и получи результат.',                      needsConnection: false },
  'infographic-generator': { icon: '🖼️', title: 'Инфографика',    desc: 'Генерация инфографики запускается вручную — укажи параметры и получи результат.',               needsConnection: false },
};

const SCHEDULE_LABELS: Record<string, string> = {
  hourly: 'Каждый час',
  daily:  'Раз в день',
  weekly: 'Раз в неделю',
};

const STATUS_CLASSES: Record<string, string> = {
  success: 'text-green-600 bg-green-50',
  error:   'text-red-600 bg-red-50',
  skipped: 'text-slate-500 bg-slate-100',
};
const STATUS_LABELS: Record<string, string> = {
  success: 'Успешно',
  error:   'Ошибка',
  skipped: 'Пропущено',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [autos, conns] = await Promise.all([getAutomations(), getConnections()]);
      setAutomations(autos);
      setConnections(conns);
    } catch {
      setError('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function getAutomation(slug: string) {
    return automations.find((a) => a.scenario_slug === slug);
  }

  async function handleToggle(slug: string, enabled: boolean) {
    setSaving(slug);
    setError('');
    try {
      const existing = getAutomation(slug);
      const conn = connections[0];
      if (existing) {
        const updated = await updateAutomation(existing.id, { enabled });
        setAutomations((prev) => prev.map((a) => a.id === existing.id ? updated : a));
      } else {
        const created = await upsertAutomation({
          scenarioSlug: slug,
          connectionId: conn?.id ?? null,
          enabled,
          schedule: 'daily',
          auto_apply: false,
        });
        setAutomations((prev) => [...prev, created]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(null);
    }
  }

  async function handleChange(id: string, field: 'schedule' | 'auto_apply' | 'connection_id', value: string | boolean) {
    setSaving(id);
    setError('');
    try {
      let updated: Automation;
      if (field === 'connection_id') {
        // Re-upsert with new connection
        const existing = automations.find((a) => a.id === id)!;
        updated = await upsertAutomation({
          scenarioSlug: existing.scenario_slug,
          connectionId: value as string || null,
          enabled: existing.enabled,
          schedule: existing.schedule,
          auto_apply: existing.auto_apply,
        });
        setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, ...updated } : a));
      } else {
        updated = await updateAutomation(id, { [field]: value });
        setAutomations((prev) => prev.map((a) => a.id === id ? updated : a));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(null);
    }
  }

  async function handleRun(id: string) {
    setRunning(id);
    setError('');
    try {
      await triggerAutomation(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запуска');
    } finally {
      setTimeout(() => setRunning(null), 2000);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить автоматизацию?')) return;
    try {
      await deleteAutomation(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Автоматизации</h1>
        <p className="text-slate-500 mt-1">Агенты работают сами — подключи магазин и включи нужные сценарии</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {connections.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          ⚠️ Сначала подключи магазин на странице{' '}
          <a href="/connections" className="underline font-medium">Подключения</a> — агентам нужен доступ к WB или Ozon.
        </div>
      )}

      <div className="grid gap-5">
        {Object.entries(SCENARIO_META).map(([slug, meta]) => {
          const auto = getAutomation(slug);
          const isEnabled = auto?.enabled ?? false;
          const isSaving = saving === slug || saving === auto?.id;
          const isManualOnly = !meta.needsConnection;

          return (
            <div
              key={slug}
              className={`bg-white rounded-2xl border transition-all ${
                isEnabled ? 'border-purple-200 shadow-sm shadow-purple-50' : 'border-slate-200'
              }`}
            >
              <div className="p-5 flex items-start gap-4">
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
                  isEnabled ? 'bg-purple-50' : 'bg-slate-50'
                }`}>
                  {meta.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-slate-900">{meta.title}</h3>
                    {auto?.last_run_status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASSES[auto.last_run_status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABELS[auto.last_run_status] ?? auto.last_run_status}
                      </span>
                    )}
                    {isManualOnly && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Только вручную</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">{meta.desc}</p>
                  {auto?.last_run_at && (
                    <p className="text-xs text-slate-400 mt-1">Последний запуск: {formatDate(auto.last_run_at)}</p>
                  )}
                </div>

                {/* Toggle */}
                {!isManualOnly && (
                  <button
                    disabled={isSaving || connections.length === 0}
                    onClick={() => handleToggle(slug, !isEnabled)}
                    className={`relative shrink-0 w-12 h-6 rounded-full transition-colors ${
                      isEnabled ? 'bg-purple-600' : 'bg-slate-200'
                    } disabled:opacity-40`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      isEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                )}
              </div>

              {/* Settings row — shown when enabled */}
              {isEnabled && auto && !isManualOnly && (
                <div className="px-5 pb-5 border-t border-slate-50 pt-4 flex flex-wrap gap-4 items-center">
                  {/* Connection picker */}
                  {connections.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 font-medium">Магазин:</label>
                      <select
                        value={auto.connection_id ?? ''}
                        onChange={(e) => handleChange(auto.id, 'connection_id', e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      >
                        <option value="">— не выбран —</option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.display_name} ({c.platform.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Schedule */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-medium">Расписание:</label>
                    <select
                      value={auto.schedule}
                      onChange={(e) => handleChange(auto.id, 'schedule', e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      {Object.entries(SCHEDULE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>

                  {/* Auto-apply */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={auto.auto_apply}
                      onChange={(e) => handleChange(auto.id, 'auto_apply', e.target.checked)}
                      className="w-4 h-4 rounded accent-purple-600"
                    />
                    <span className="text-sm text-slate-600">Авто-публикация</span>
                    <span className="text-xs text-slate-400">(без одобрения)</span>
                  </label>

                  <div className="flex items-center gap-2 ml-auto">
                    {/* Manual run */}
                    <button
                      onClick={() => handleRun(auto.id)}
                      disabled={running === auto.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
                    >
                      {running === auto.id ? (
                        <>
                          <span className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                          Запускается…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Запустить сейчас
                        </>
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(auto.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      title="Удалить автоматизацию"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-sm text-slate-500 space-y-1">
        <p className="font-medium text-slate-700">Как это работает</p>
        <p>• Включи агента тумблером → он встанет в расписание и запустится автоматически</p>
        <p>• <strong>Авто-публикация выкл.</strong> — агент готовит результат, ты видишь его в уведомлениях и публикуешь одним нажатием</p>
        <p>• <strong>Авто-публикация вкл.</strong> — агент сам публикует ответы и обновляет карточки без участия пользователя</p>
        <p>• Кнопка «Запустить сейчас» запускает агента немедленно вне расписания</p>
      </div>
    </div>
  );
}

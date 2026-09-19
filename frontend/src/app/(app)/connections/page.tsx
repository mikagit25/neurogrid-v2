'use client';

import { useEffect, useState } from 'react';
import { getConnections, createConnection } from '@/lib/api';
import type { Connection } from '@/lib/api';

const PLATFORM_LABELS: Record<string, string> = {
  wb: 'WildBerries',
  ozon: 'Ozon',
};

const STATUS_CLASSES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-slate-100 text-slate-600',
  error: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Активно',
  inactive: 'Неактивно',
  error: 'Ошибка',
};

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [platform, setPlatform] = useState<'wb' | 'ozon'>('wb');
  const [displayName, setDisplayName] = useState('');
  const [wbApiKey, setWbApiKey] = useState('');
  const [wbStatsKey, setWbStatsKey] = useState('');
  const [wbAdvertKey, setWbAdvertKey] = useState('');
  const [ozonClientId, setOzonClientId] = useState('');
  const [ozonApiKey, setOzonApiKey] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  async function loadConnections() {
    try {
      const data = await getConnections();
      setConnections(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConnections();
  }, []);

  function resetForm() {
    setPlatform('wb');
    setDisplayName('');
    setWbApiKey('');
    setWbStatsKey('');
    setWbAdvertKey('');
    setOzonClientId('');
    setOzonApiKey('');
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (platform === 'wb' && !wbApiKey.trim()) {
      setFormError('Введите API-ключ WildBerries');
      return;
    }
    if (platform === 'ozon' && (!ozonClientId.trim() || !ozonApiKey.trim())) {
      setFormError('Введите Client ID и API-ключ Ozon');
      return;
    }

    setFormLoading(true);
    try {
      const data: Record<string, string> = { platform, ...(displayName.trim() && { displayName: displayName.trim() }) };
      if (platform === 'wb') {
        data.apiKey = wbApiKey.trim();
        if (wbStatsKey.trim()) data.statisticsApiKey = wbStatsKey.trim();
        if (wbAdvertKey.trim()) data.advertApiKey = wbAdvertKey.trim();
      } else {
        data.clientId = ozonClientId.trim();
        data.apiKey = ozonApiKey.trim();
      }
      await createConnection(data);
      resetForm();
      setShowForm(false);
      setLoading(true);
      await loadConnections();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Ошибка создания подключения');
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Подключения</h1>
          <p className="text-slate-500 mt-1">Управление доступом к маркетплейсам</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setFormError(''); }}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
        >
          {showForm ? 'Отмена' : '+ Добавить подключение'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Новое подключение</h2>
          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPlatform('wb')}
                className={`py-3 px-4 rounded-lg border-2 font-medium text-sm transition-colors ${
                  platform === 'wb'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                WildBerries
              </button>
              <button
                type="button"
                onClick={() => setPlatform('ozon')}
                className={`py-3 px-4 rounded-lg border-2 font-medium text-sm transition-colors ${
                  platform === 'ozon'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Ozon
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Отображаемое название
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Мой магазин WB"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {platform === 'wb' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    API-ключ WB <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={wbApiKey}
                    onChange={(e) => setWbApiKey(e.target.value)}
                    placeholder="eyJ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Ключ статистики (необязательно)
                  </label>
                  <input
                    type="password"
                    value={wbStatsKey}
                    onChange={(e) => setWbStatsKey(e.target.value)}
                    placeholder="eyJ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Ключ рекламы (необязательно)
                  </label>
                  <input
                    type="password"
                    value={wbAdvertKey}
                    onChange={(e) => setWbAdvertKey(e.target.value)}
                    placeholder="eyJ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </>
            )}

            {platform === 'ozon' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Client ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={ozonClientId}
                    onChange={(e) => setOzonClientId(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    API-ключ Ozon <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={ozonApiKey}
                    onChange={(e) => setOzonApiKey(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {formLoading ? 'Сохранение...' : 'Добавить подключение'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Connections list */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : connections.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm">Подключений пока нет</p>
            <p className="text-slate-400 text-xs mt-1">Добавьте подключение для использования сценариев</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {connections.map((c) => (
              <div key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                    c.platform === 'wb' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {c.platform === 'wb' ? 'WB' : 'OZ'}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{c.display_name}</p>
                    <p className="text-xs text-slate-500">
                      {PLATFORM_LABELS[c.platform]} · Проверено: {formatDate(c.last_verified_at)}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  STATUS_CLASSES[c.status] || 'bg-slate-100 text-slate-600'
                }`}>
                  {STATUS_LABELS[c.status] || c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

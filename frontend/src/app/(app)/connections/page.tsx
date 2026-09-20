'use client';

import { useEffect, useState } from 'react';
import { getConnections, createConnection } from '@/lib/api';
import type { Connection } from '@/lib/api';

const PLATFORM_LABELS: Record<string, string> = {
  wb: 'WildBerries',
  ozon: 'Ozon',
  ym: 'Яндекс Маркет',
  mm: 'Мегамаркет',
};

const PLATFORM_SHORT: Record<string, string> = {
  wb: 'WB',
  ozon: 'OZ',
  ym: 'YM',
  mm: 'MM',
};

const PLATFORM_COLORS: Record<string, string> = {
  wb: 'bg-[#CB11AB]/10 text-[#CB11AB]',
  ozon: 'bg-blue-100 text-blue-700',
  ym: 'bg-yellow-100 text-yellow-700',
  mm: 'bg-green-100 text-green-700',
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

type Platform = 'wb' | 'ozon' | 'ym' | 'mm';

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

function HintLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 underline underline-offset-2"
    >
      {children}
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
      <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [platform, setPlatform] = useState<Platform>('wb');
  const [displayName, setDisplayName] = useState('');
  // WB
  const [wbApiKey, setWbApiKey] = useState('');
  const [wbStatsKey, setWbStatsKey] = useState('');
  // Ozon
  const [ozonClientId, setOzonClientId] = useState('');
  const [ozonApiKey, setOzonApiKey] = useState('');
  // Yandex Market
  const [ymApiToken, setYmApiToken] = useState('');
  const [ymCampaignId, setYmCampaignId] = useState('');
  const [ymBusinessId, setYmBusinessId] = useState('');
  // Megamarket
  const [mmToken, setMmToken] = useState('');
  const [mmMerchantId, setMmMerchantId] = useState('');

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

  useEffect(() => { loadConnections(); }, []);

  function resetForm() {
    setPlatform('wb');
    setDisplayName('');
    setWbApiKey(''); setWbStatsKey('');
    setOzonClientId(''); setOzonApiKey('');
    setYmApiToken(''); setYmCampaignId(''); setYmBusinessId('');
    setMmToken(''); setMmMerchantId('');
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (platform === 'wb' && !wbApiKey.trim()) {
      setFormError('Введите API-ключ WildBerries'); return;
    }
    if (platform === 'ozon' && (!ozonClientId.trim() || !ozonApiKey.trim())) {
      setFormError('Введите Client ID и API-ключ Ozon'); return;
    }
    if (platform === 'ym' && (!ymApiToken.trim() || !ymCampaignId.trim() || !ymBusinessId.trim())) {
      setFormError('Введите OAuth-токен, ID кампании и ID бизнеса'); return;
    }
    if (platform === 'mm' && (!mmToken.trim() || !mmMerchantId.trim())) {
      setFormError('Введите API-токен и ID продавца'); return;
    }

    setFormLoading(true);
    try {
      const data: Record<string, string> = {
        platform,
        ...(displayName.trim() && { displayName: displayName.trim() }),
      };
      if (platform === 'wb') {
        data.apiKey = wbApiKey.trim();
        if (wbStatsKey.trim()) data.statisticsApiKey = wbStatsKey.trim();
      } else if (platform === 'ozon') {
        data.clientId = ozonClientId.trim();
        data.apiKey = ozonApiKey.trim();
      } else if (platform === 'ym') {
        data.apiToken = ymApiToken.trim();
        data.campaignId = ymCampaignId.trim();
        data.businessId = ymBusinessId.trim();
      } else if (platform === 'mm') {
        data.token = mmToken.trim();
        data.merchantId = mmMerchantId.trim();
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

  const placeholders: Record<Platform, string> = {
    wb: 'Мой магазин WB',
    ozon: 'Мой магазин Ozon',
    ym: 'Мой магазин Яндекс',
    mm: 'Мой магазин Мегамаркет',
  };

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

            {/* Platform selector */}
            <div className="grid grid-cols-2 gap-3">
              {(['wb', 'ozon', 'ym', 'mm'] as Platform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`py-3 px-4 rounded-lg border-2 font-medium text-sm transition-colors ${
                    platform === p
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>

            {/* Display name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Название магазина
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={placeholders[platform]}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* WildBerries fields */}
            {platform === 'wb' && (
              <>
                <InfoBox>
                  Ключи создаются в личном кабинете WB:{' '}
                  <HintLink href="https://seller.wildberries.ru/supplier-settings/access-to-new-api">
                    Настройки → Доступ к API
                  </HintLink>
                  . Нажмите «Создать новый токен» и выберите права:{' '}
                  <strong>Контент</strong> + <strong>Аналитика</strong> + <strong>Отзывы и вопросы</strong>.
                </InfoBox>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    API-ключ (токен) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={wbApiKey}
                    onChange={(e) => setWbApiKey(e.target.value)}
                    placeholder="eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9…"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Права: <strong>Контент</strong>, <strong>Аналитика</strong>, <strong>Отзывы и вопросы</strong>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Токен статистики{' '}
                    <span className="text-slate-400 font-normal">(если создали отдельно)</span>
                  </label>
                  <input
                    type="password"
                    value={wbStatsKey}
                    onChange={(e) => setWbStatsKey(e.target.value)}
                    placeholder="eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9…"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Отдельный токен с правом «Аналитика». Если не заполнено — используется основной токен.
                  </p>
                </div>
              </>
            )}

            {/* Ozon fields */}
            {platform === 'ozon' && (
              <>
                <InfoBox>
                  Ключи создаются в личном кабинете Ozon Seller:{' '}
                  <HintLink href="https://seller.ozon.ru/app/settings/api-keys">
                    Настройки → API ключи
                  </HintLink>
                  . Нажмите «Создать ключ», тип — <strong>Admin</strong>.
                  Client ID находится там же, в шапке страницы.
                </InfoBox>
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
                  <p className="mt-1 text-xs text-slate-400">Числовой ID — виден в шапке страницы API ключей</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    API-ключ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={ozonApiKey}
                    onChange={(e) => setOzonApiKey(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-slate-400">Тип ключа: <strong>Admin</strong></p>
                </div>
              </>
            )}

            {/* Yandex Market fields */}
            {platform === 'ym' && (
              <>
                <InfoBox>
                  Токен создаётся в кабинете Яндекс Маркет:{' '}
                  <HintLink href="https://partner.market.yandex.ru/settings/api">
                    Настройки → API
                  </HintLink>
                  . ID кампании — в URL личного кабинета (числа после /campaigns/). ID бизнеса — в разделе «Настройки бизнеса».
                </InfoBox>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    OAuth-токен <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={ymApiToken}
                    onChange={(e) => setYmApiToken(e.target.value)}
                    placeholder="y0_AgAAAA…"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      ID кампании <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={ymCampaignId}
                      onChange={(e) => setYmCampaignId(e.target.value)}
                      placeholder="12345678"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      ID бизнеса <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={ymBusinessId}
                      onChange={(e) => setYmBusinessId(e.target.value)}
                      placeholder="87654321"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Megamarket fields */}
            {platform === 'mm' && (
              <>
                <InfoBox>
                  Токен создаётся в личном кабинете Мегамаркет:{' '}
                  <HintLink href="https://partner.megamarket.ru/settings/api">
                    Профиль → API-доступ
                  </HintLink>
                  . ID продавца (Merchant ID) виден в шапке кабинета.
                </InfoBox>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    API-токен <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={mmToken}
                    onChange={(e) => setMmToken(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    ID продавца (Merchant ID) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={mmMerchantId}
                    onChange={(e) => setMmMerchantId(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </>
            )}

            {/* Security note */}
            <div className="flex items-start gap-2 text-xs text-slate-400 pt-1">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Ключи хранятся в зашифрованном виде (AES-256) и не передаются третьим лицам.
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {formLoading ? 'Проверка и сохранение...' : 'Подключить'}
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
            <p className="text-slate-400 text-xs mt-1">Добавьте API-ключ магазина, чтобы использовать сценарии</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {connections.map((c) => (
              <div key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                    PLATFORM_COLORS[c.platform] || 'bg-slate-100 text-slate-600'
                  }`}>
                    {PLATFORM_SHORT[c.platform] || c.platform.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{c.display_name}</p>
                    <p className="text-xs text-slate-500">
                      {PLATFORM_LABELS[c.platform] || c.platform} · Проверено: {formatDate(c.last_verified_at)}
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

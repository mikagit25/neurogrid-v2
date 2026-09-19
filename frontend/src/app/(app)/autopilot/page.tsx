'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import ImageUpload from '@/components/ImageUpload';
import { getConnections, analyzeProduct, analyzeBatch, executeAutopilot } from '@/lib/api';
import type { Connection, AutopilotPlan, AutopilotAction, AutopilotSession, PhotoEnhancement } from '@/lib/api';
import { useEffect } from 'react';

// ---- Types ----

interface ProductInput {
  name: string;
  description: string;
  photoUrls: string[]; // up to 5
  platform: 'wb' | 'ozon';
}

interface ProductSlot {
  input: ProductInput;
  plan: AutopilotPlan | null;
  error: string;
}

type WizardStep = 'input' | 'analyzing' | 'plan' | 'executing' | 'done';

const PRICING_LABELS: Record<string, string> = {
  competitive: 'Конкурентная — следить за ценами конкурентов',
  margin: 'По марже — цена = себестоимость × (1 + маржа)',
  fixed: 'Фиксированная — ручные границы min/max',
};

const ACTION_ICONS: Record<string, string> = {
  'card-generator': '📝',
  'multi-photo-studio': '📸',
  'infographic-generator': '🖼️',
  'review-drafts': '💬',
  'price-monitor': '📊',
  'seo-audit': '🔍',
  'stock-forecast': '📦',
};

function emptyProduct(): ProductInput {
  return { name: '', description: '', photoUrls: ['', '', '', '', ''], platform: 'wb' };
}

// ---- Session result component ----

function SessionResults({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<AutopilotSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function poll() {
      const { getAutopilotSession } = await import('@/lib/api');
      try {
        const s = await getAutopilotSession(sessionId);
        setSession(s);
        if (s.status === 'running') {
          setTimeout(poll, 3000);
        }
      } catch {
        setTimeout(poll, 5000);
      } finally {
        setLoading(false);
      }
    }
    poll();
  }, [sessionId]);

  if (loading && !session) {
    return (
      <div className="flex items-center gap-3 py-6">
        <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-500">Загрузка результатов...</span>
      </div>
    );
  }
  if (!session) return null;

  const runEntries = Object.entries(session.runs ?? {});

  return (
    <div className="space-y-3">
      {runEntries.map(([type, run]) => {
        const icon = ACTION_ICONS[type] ?? '⚙️';
        const isRunning = run.status === 'queued' || run.status === 'running';
        const isDone = run.status === 'success';
        const isError = run.status === 'error';

        return (
          <div key={type} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{icon}</span>
              <span className="font-medium text-slate-800 text-sm capitalize">{type.replace(/-/g, ' ')}</span>
              <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                isDone ? 'bg-green-100 text-green-700' :
                isError ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {isDone ? 'Готово' : isError ? 'Ошибка' : isRunning ? 'Выполняется...' : run.status}
              </span>
            </div>

            {isDone && run.result && (
              <div className="mt-2 space-y-2">
                {run.result.imageUrl ? (
                  <div>
                    <img
                      src={String(run.result.imageUrl)}
                      alt="result"
                      className="w-full max-w-sm rounded-lg border border-slate-200"
                    />
                    <a
                      href={String(run.result.imageUrl)}
                      download
                      className="mt-1 inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
                    >
                      Скачать
                    </a>
                  </div>
                ) : null}
                {run.result.title ? (
                  <div className="bg-slate-50 rounded-lg p-3 text-sm">
                    <p className="font-medium text-slate-800">{String(run.result.title)}</p>
                  </div>
                ) : null}
                {run.result.description ? (
                  <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
                    {String(run.result.description).slice(0, 300)}
                    {String(run.result.description).length > 300 ? '...' : ''}
                  </div>
                ) : null}
                <Link
                  href={`/runs/${run.runId}`}
                  className="text-xs text-purple-600 hover:underline"
                >
                  Полный результат →
                </Link>
              </div>
            )}

            {isError && run.errorMessage && (
              <p className="text-xs text-red-600 mt-1">{run.errorMessage}</p>
            )}
          </div>
        );
      })}

      {session.status === 'done' && runEntries.length === 0 && (
        <p className="text-sm text-slate-500">Агенты настроены. Контентные задачи не запрашивались.</p>
      )}
    </div>
  );
}

// ---- Main wizard ----

export default function AutopilotPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [step, setStep] = useState<WizardStep>('input');
  const [batchMode, setBatchMode] = useState(false);
  const [slots, setSlots] = useState<ProductSlot[]>([
    { input: emptyProduct(), plan: null, error: '' },
  ]);
  const [activePlanIdx, setActivePlanIdx] = useState(0);
  const [pricingEnabled, setPricingEnabled] = useState(false);
  const [pricingStrategy, setPricingStrategy] = useState<'competitive' | 'margin' | 'fixed'>('competitive');
  const [pricingConfig, setPricingConfig] = useState({ minPrice: '', maxPrice: '', margin: '30', costPrice: '' });
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getConnections().then((conns) => {
      setConnections(conns);
      const raw = sessionStorage.getItem('autopilot_prefill');
      if (raw) {
        sessionStorage.removeItem('autopilot_prefill');
        try {
          const prefill = JSON.parse(raw) as { name: string; description: string; photoUrls: string[]; platform: string; connectionId: string };
          setSlots([{
            input: {
              name: prefill.name,
              description: prefill.description,
              photoUrls: [...prefill.photoUrls, '', '', '', ''].slice(0, 5),
              platform: (prefill.platform as 'wb' | 'ozon') ?? 'wb',
            },
            plan: null,
            error: '',
          }]);
          const conn = conns.find((c) => c.id === prefill.connectionId);
          if (conn) setConnectionId(conn.id);
        } catch { /* ignore malformed */ }
      }
    }).catch(() => {});
  }, []);

  // Auto-detect platform from connection
  const selectedConn = connections.find((c) => c.id === connectionId);
  const platform: 'wb' | 'ozon' = (selectedConn?.platform ?? 'wb') as 'wb' | 'ozon';

  function updateSlotInput(idx: number, patch: Partial<ProductInput>) {
    setSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, input: { ...s.input, ...patch } } : s))
    );
  }

  function updatePhotoUrl(slotIdx: number, photoIdx: number, url: string) {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== slotIdx) return s;
        const photoUrls = [...s.input.photoUrls];
        photoUrls[photoIdx] = url;
        return { ...s, input: { ...s.input, photoUrls } };
      })
    );
  }

  function toggleAction(slotIdx: number, actionType: string) {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== slotIdx || !s.plan) return s;
        const actions = s.plan.actions.map((a) =>
          a.type === actionType ? { ...a, enabled: !a.enabled } : a
        );
        return { ...s, plan: { ...s.plan, actions } };
      })
    );
  }

  function togglePhotoEnhancement(slotIdx: number, enhIdx: number) {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== slotIdx || !s.plan?.photoEnhancements) return s;
        const photoEnhancements = s.plan.photoEnhancements.map((e, j) =>
          j === enhIdx ? { ...e, enabled: !e.enabled } : e
        );
        return { ...s, plan: { ...s.plan, photoEnhancements } };
      })
    );
  }

  async function handleAnalyze() {
    const activeSlots = batchMode ? slots : [slots[0]];
    for (const s of activeSlots) {
      if (!s.input.name.trim()) {
        setError('Введите название товара');
        return;
      }
    }
    setError('');
    setStep('analyzing');

    const normalizePlan = (plan: AutopilotPlan): AutopilotPlan => ({
      ...plan,
      photoEnhancements: (plan.photoEnhancements ?? []).map((e) => ({
        ...e,
        enabled: e.recommended,
      })),
    });

    try {
      if (activeSlots.length === 1) {
        const s0 = activeSlots[0].input;
        const plan = normalizePlan(await analyzeProduct({
          productName: s0.name,
          description: s0.description,
          photoUrls: s0.photoUrls.filter(Boolean),
          platform,
        }));
        setSlots((prev) => [{ ...prev[0], plan, error: '' }, ...prev.slice(1)]);
      } else {
        const plans = await analyzeBatch(
          activeSlots.map((s) => ({
            productName: s.input.name,
            description: s.input.description,
            photoUrls: s.input.photoUrls.filter(Boolean),
            platform,
          }))
        );
        setSlots((prev) =>
          prev.map((s, i) => {
            const p = plans[i];
            if (!p || 'error' in p) return { ...s, error: ('error' in (p ?? {})) ? (p as any).error : 'Ошибка анализа' };
            return { ...s, plan: normalizePlan(p as AutopilotPlan), error: '' };
          })
        );
        // Set pricing recommendation from first slot
        const firstPlan = plans.find((p) => p && !('error' in p)) as AutopilotPlan | undefined;
        if (firstPlan?.pricing?.recommended) {
          setPricingStrategy(firstPlan.pricing.recommended);
        }
      }

      const firstPlan = slots[0].plan;
      if (firstPlan?.pricing?.recommended) {
        setPricingStrategy(firstPlan.pricing.recommended);
      }

      setStep('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка анализа');
      setStep('input');
    }
  }

  async function handleExecute() {
    setError('');
    setStep('executing');
    const ids: string[] = [];

    for (const s of slots) {
      if (!s.plan) continue;
      try {
        const { sessionId } = await executeAutopilot({
          product: {
            name: s.plan.detected.name || s.input.name,
            description: s.input.description,
            photoUrls: s.input.photoUrls.filter(Boolean),
            platform,
            characteristics: s.plan.detected.characteristics,
          },
          connectionId: connectionId || null,
          actions: s.plan.actions,
          photoEnhancements: (s.plan.photoEnhancements ?? []).filter((e) => e.enabled),
          pricingRule: pricingEnabled
            ? {
                name: `Правило для ${s.plan.detected.name || s.input.name}`,
                strategy: pricingStrategy,
                config: {
                  minPrice: pricingConfig.minPrice ? Number(pricingConfig.minPrice) : undefined,
                  maxPrice: pricingConfig.maxPrice ? Number(pricingConfig.maxPrice) : undefined,
                  margin: pricingConfig.margin ? Number(pricingConfig.margin) : undefined,
                  costPrice: pricingConfig.costPrice ? Number(pricingConfig.costPrice) : undefined,
                },
                enabled: true,
              }
            : null,
        });
        ids.push(sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка запуска');
        setStep('plan');
        return;
      }
    }

    setSessionIds(ids);
    setStep('done');
  }

  // ---- Render ----

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🤖</span>
          <h1 className="text-2xl font-bold text-slate-900">Автопилот</h1>
        </div>
        <p className="text-slate-500">
          Загрузите фото и описание товара — ИИ сам составит карточку, создаст фото, настроит агентов и ценообразование
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Step 1: Input */}
      {(step === 'input' || step === 'analyzing') && (
        <div className="space-y-5">
          {/* Batch toggle */}
          <div className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl">
            <button
              onClick={() => setBatchMode(false)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${!batchMode ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Один товар
            </button>
            <button
              onClick={() => setBatchMode(true)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${batchMode ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Пакет товаров
            </button>
          </div>

          {/* Connection */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Маркетплейс и подключение
            </label>
            {connections.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Нет подключений.{' '}
                <Link href="/connections" className="font-medium underline">Добавить →</Link>
              </p>
            ) : (
              <select
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">— Без подключения (только генерация) —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} ({c.platform === 'wb' ? 'WildBerries' : 'Ozon'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Product slots */}
          {(batchMode ? slots : [slots[0]]).map((slot, idx) => (
            <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              {batchMode && (
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">Товар #{idx + 1}</h3>
                  {idx > 0 && (
                    <button
                      onClick={() => setSlots((p) => p.filter((_, i) => i !== idx))}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Название товара <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={slot.input.name}
                  onChange={(e) => updateSlotInput(idx, { name: e.target.value })}
                  placeholder="Например: Кожаная сумка через плечо"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Описание / характеристики
                  <span className="text-slate-400 font-normal ml-1">(необязательно — ИИ определит из фото)</span>
                </label>
                <textarea
                  value={slot.input.description}
                  onChange={(e) => updateSlotInput(idx, { description: e.target.value })}
                  placeholder="Материал: натуральная кожа. Размер: 30×20 см. Цвет: коричневый..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">
                  Фотографии товара
                  <span className="text-slate-400 font-normal ml-1">(до 5 штук с разных ракурсов)</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {slot.input.photoUrls.map((url, pi) => (
                    <ImageUpload
                      key={pi}
                      value={url}
                      onChange={(newUrl) => updatePhotoUrl(idx, pi, newUrl)}
                      label={pi === 0 ? 'Фото 1 — главное' : `Фото ${pi + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}

          {batchMode && slots.length < 10 && (
            <button
              onClick={() => setSlots((p) => [...p, { input: emptyProduct(), plan: null, error: '' }])}
              className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-purple-400 hover:text-purple-600 transition-colors"
            >
              + Добавить ещё товар
            </button>
          )}

          <button
            onClick={handleAnalyze}
            disabled={step === 'analyzing'}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {step === 'analyzing' ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ИИ анализирует товар...
              </>
            ) : (
              '✨ Анализировать и составить план'
            )}
          </button>
        </div>
      )}

      {/* Step 2: Plan */}
      {step === 'plan' && (
        <div className="space-y-5">
          {/* Plan tabs for batch */}
          {batchMode && slots.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {slots.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActivePlanIdx(i)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activePlanIdx === i ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                  }`}
                >
                  {s.plan?.detected.name || s.input.name || `Товар ${i + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* Detected product info */}
          {slots[activePlanIdx]?.plan && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{slots[activePlanIdx].plan!.detected.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{slots[activePlanIdx].plan!.detected.category}</p>
                  {slots[activePlanIdx].plan!.detected.characteristics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {slots[activePlanIdx].plan!.detected.characteristics.slice(0, 5).map((c, i) => (
                        <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions checklist */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Что сделает Автопилот</h2>
              <p className="text-xs text-slate-500 mt-0.5">Включите или отключите нужные действия</p>
            </div>
            <div className="divide-y divide-slate-50">
              {(slots[activePlanIdx]?.plan?.actions ?? []).map((action) => (
                <label
                  key={action.type}
                  className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={action.enabled}
                    onChange={() => toggleAction(activePlanIdx, action.type)}
                    className="mt-0.5 h-4 w-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base">{ACTION_ICONS[action.type] ?? '⚙️'}</span>
                      <span className="text-sm font-medium text-slate-800">{action.title}</span>
                      {action.agentType && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                          Агент · {action.schedule === 'daily' ? 'ежедневно' : action.schedule === 'hourly' ? 'каждый час' : 'еженедельно'}
                        </span>
                      )}
                      {action.recommended && !action.agentType && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Рекомендуется</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* AI-suggested photo enhancements */}
          {(slots[activePlanIdx]?.plan?.photoEnhancements?.length ?? 0) > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">✨ Дополнительные виды Studio</h2>
                <p className="text-xs text-slate-500 mt-0.5">ИИ предлагает эти виды специально для вашего товара</p>
              </div>
              <div className="divide-y divide-slate-50">
                {(slots[activePlanIdx].plan!.photoEnhancements ?? []).map((enh: PhotoEnhancement, idx: number) => (
                  <label
                    key={idx}
                    className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={enh.enabled}
                      onChange={() => togglePhotoEnhancement(activePlanIdx, idx)}
                      className="mt-0.5 h-4 w-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{enh.label}</span>
                        {enh.recommended && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">ИИ рекомендует</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{enh.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Pricing automation */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <label className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={pricingEnabled}
                onChange={(e) => setPricingEnabled(e.target.checked)}
                className="h-4 w-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">💰 Автоматизация ценообразования</p>
                <p className="text-xs text-slate-500">
                  {slots[activePlanIdx]?.plan?.pricing.reason ?? 'Правило для автоматического управления ценой'}
                </p>
              </div>
            </label>

            {pricingEnabled && (
              <div className="px-5 pb-5 space-y-3 border-t border-slate-100">
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Стратегия</label>
                  <select
                    value={pricingStrategy}
                    onChange={(e) => setPricingStrategy(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-purple-500"
                  >
                    {Object.entries(PRICING_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Минимальная цена (₽)</label>
                    <input
                      type="number"
                      value={pricingConfig.minPrice}
                      onChange={(e) => setPricingConfig((p) => ({ ...p, minPrice: e.target.value }))}
                      placeholder="1000"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Максимальная цена (₽)</label>
                    <input
                      type="number"
                      value={pricingConfig.maxPrice}
                      onChange={(e) => setPricingConfig((p) => ({ ...p, maxPrice: e.target.value }))}
                      placeholder="5000"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  {pricingStrategy === 'margin' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Себестоимость (₽)</label>
                        <input
                          type="number"
                          value={pricingConfig.costPrice}
                          onChange={(e) => setPricingConfig((p) => ({ ...p, costPrice: e.target.value }))}
                          placeholder="500"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Целевая маржа (%)</label>
                        <input
                          type="number"
                          value={pricingConfig.margin}
                          onChange={(e) => setPricingConfig((p) => ({ ...p, margin: e.target.value }))}
                          placeholder="30"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('input')}
              className="px-5 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm"
            >
              Назад
            </button>
            <button
              onClick={handleExecute}
              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              🚀 Запустить Автопилот
              {batchMode && slots.filter((s) => s.plan).length > 1 && (
                <span className="text-sm opacity-80">
                  ({slots.filter((s) => s.plan).length} товаров)
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Executing / Done */}
      {(step === 'executing' || step === 'done') && (
        <div className="space-y-5">
          {step === 'executing' && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 flex items-center gap-4">
              <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div>
                <p className="font-semibold text-purple-900">Автопилот запущен</p>
                <p className="text-sm text-purple-700 mt-0.5">Создаю карточки, фото и настраиваю агентов...</p>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-900">Автопилот настроен!</p>
                <p className="text-sm text-green-700 mt-0.5">Агенты работают, результаты появляются ниже</p>
              </div>
            </div>
          )}

          {sessionIds.map((id, i) => (
            <div key={id} className="space-y-2">
              {batchMode && sessionIds.length > 1 && (
                <h3 className="font-medium text-slate-700 text-sm">Товар #{i + 1}</h3>
              )}
              <SessionResults sessionId={id} />
            </div>
          ))}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep('input');
                setSlots([{ input: emptyProduct(), plan: null, error: '' }]);
                setSessionIds([]);
                setActivePlanIdx(0);
                setBatchMode(false);
              }}
              className="px-5 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm"
            >
              Новый товар
            </button>
            <Link
              href="/automations"
              className="px-5 py-2.5 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 transition-colors text-sm"
            >
              Управление агентами →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

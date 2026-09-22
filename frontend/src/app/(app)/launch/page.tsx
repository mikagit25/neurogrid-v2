'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  LaunchCampaign, LaunchStep, AiLaunchPlan, AiLaunchStep,
  getLaunchCampaigns, createLaunchCampaign, updateLaunchCampaign,
  deleteLaunchCampaign, updateLaunchStep,
  getAiLaunchPlan, applyAiLaunchPlan,
} from '../../../lib/api';

const STEP_ICONS: Record<string, string> = {
  listing_update: '📝',
  price_discount: '🏷️',
  ad_boost: '📣',
  seo_optimization: '🔍',
  review_request: '⭐',
  self_purchase: '🛒',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-blue-100 text-blue-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
};

const STEP_STATUS_COLORS: Record<string, string> = {
  pending: 'border-gray-200 bg-white',
  in_progress: 'border-blue-300 bg-blue-50',
  done: 'border-green-300 bg-green-50',
  skipped: 'border-gray-100 bg-gray-50 opacity-60',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 bg-red-50',
  medium: 'text-amber-600 bg-amber-50',
  low: 'text-slate-500 bg-slate-100',
};

function progressOf(steps: LaunchStep[]) {
  const done = steps.filter(s => s.status === 'done').length;
  return steps.length ? Math.round((done / steps.length) * 100) : 0;
}

function CampaignCard({ campaign, onRefresh }: { campaign: LaunchCampaign; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);
  const [applyingAi, setApplyingAi] = useState(false);
  const [aiPlan, setAiPlan] = useState<AiLaunchPlan | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [showAiPreview, setShowAiPreview] = useState(false);

  async function onStepStatus(step: LaunchStep, nextStatus: string) {
    setUpdatingStep(step.id);
    try { await updateLaunchStep(step.id, { status: nextStatus }); onRefresh(); }
    finally { setUpdatingStep(null); }
  }

  async function onCampaignStatus(status: string) {
    await updateLaunchCampaign(campaign.id, { status } as any);
    onRefresh();
  }

  async function onDelete() {
    if (!confirm('Удалить кампанию запуска?')) return;
    await deleteLaunchCampaign(campaign.id);
    onRefresh();
  }

  async function onGenerateAiPlan() {
    setGeneratingAi(true);
    try {
      const result = await getAiLaunchPlan({
        productName: campaign.name,
        platform: campaign.platform,
        sku: campaign.sku,
        targetPosition: campaign.target_position ?? undefined,
        targetSales: campaign.target_sales ?? undefined,
        budget: campaign.budget ?? undefined,
      });
      setAiPlan(result.plan);
      setShowAiPreview(true);
    } catch (e: any) {
      alert('Ошибка генерации: ' + e.message);
    } finally {
      setGeneratingAi(false);
    }
  }

  async function onApplyAiPlan() {
    if (!aiPlan) return;
    setApplyingAi(true);
    try {
      await applyAiLaunchPlan(campaign.id, aiPlan.steps);
      setShowAiPreview(false);
      setAiPlan(null);
      onRefresh();
    } catch (e: any) {
      alert('Ошибка применения: ' + e.message);
    } finally {
      setApplyingAi(false);
    }
  }

  const pct = progressOf(campaign.steps ?? []);
  const steps = campaign.steps ?? [];

  return (
    <>
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[campaign.status] ?? STATUS_COLORS.draft}`}>
                  {campaign.status === 'draft' ? 'Черновик' : campaign.status === 'active' ? 'Активна' : campaign.status === 'paused' ? 'Пауза' : 'Завершена'}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100">{campaign.platform.toUpperCase()}</span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">SKU: <span className="font-mono">{campaign.sku}</span></p>
              {campaign.notes && <p className="text-xs text-gray-400 mt-1">{campaign.notes}</p>}
              <div className="flex gap-4 mt-1 text-xs text-gray-400">
                {campaign.target_position && <span>Цель: топ-{campaign.target_position}</span>}
                {campaign.budget && <span>Бюджет: {Number(campaign.budget).toLocaleString('ru-RU')} ₽</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-indigo-600">{pct}%</div>
              <div className="text-xs text-gray-400">{steps.filter(s => s.status === 'done').length}/{steps.length} шагов</div>
            </div>
          </div>

          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-2 bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex gap-2 mt-3 flex-wrap items-center">
            {campaign.status === 'draft' && (
              <button onClick={() => onCampaignStatus('active')} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded hover:bg-indigo-700">
                Запустить
              </button>
            )}
            {campaign.status === 'active' && (
              <button onClick={() => onCampaignStatus('paused')} className="bg-yellow-500 text-white text-xs px-3 py-1.5 rounded hover:bg-yellow-600">
                Пауза
              </button>
            )}
            {campaign.status === 'paused' && (
              <button onClick={() => onCampaignStatus('active')} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded hover:bg-indigo-700">
                Возобновить
              </button>
            )}
            {campaign.status !== 'completed' && (
              <button onClick={() => onCampaignStatus('completed')} className="bg-green-600 text-white text-xs px-3 py-1.5 rounded hover:bg-green-700">
                Завершить
              </button>
            )}
            <button
              onClick={onGenerateAiPlan}
              disabled={generatingAi}
              className="flex items-center gap-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded hover:bg-purple-100 disabled:opacity-50 transition-colors"
            >
              {generatingAi ? (
                <>
                  <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  Генерация...
                </>
              ) : '✨ AI-план'}
            </button>
            <button onClick={() => setExpanded(e => !e)} className="ml-auto text-indigo-500 hover:text-indigo-700 text-xs">
              {expanded ? 'Скрыть шаги' : `Шаги (${steps.length})`}
            </button>
            <button onClick={onDelete} className="text-red-400 hover:text-red-600 text-xs">Удалить</button>
          </div>
        </div>

        {expanded && steps.length > 0 && (
          <div className="border-t px-5 pb-5 pt-4 space-y-3">
            {steps.map((step, idx) => {
              const meta = step.meta as Record<string, any> | undefined;
              return (
                <div key={step.id} className={`border rounded-lg p-3 ${STEP_STATUS_COLORS[step.status] ?? STEP_STATUS_COLORS.pending}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{STEP_ICONS[step.type] ?? '•'}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{idx + 1}. {step.title}</span>
                        {step.status === 'done' && <span className="text-green-600 text-xs">✓ Выполнено</span>}
                        {step.status === 'in_progress' && <span className="text-blue-600 text-xs animate-pulse">● В процессе</span>}
                        {step.status === 'skipped' && <span className="text-gray-400 text-xs">Пропущено</span>}
                        {meta?.priority && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLORS[meta.priority] ?? ''}`}>{meta.priority}</span>
                        )}
                        {meta?.day_start && meta?.day_end && (
                          <span className="text-xs text-gray-400">День {meta.day_start}–{meta.day_end}</span>
                        )}
                      </div>
                      {step.description && <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>}
                      {meta?.expected_result && (
                        <p className="text-xs text-green-600 mt-0.5">→ {meta.expected_result}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {step.status === 'pending' && (
                        <>
                          <button
                            onClick={() => onStepStatus(step, 'in_progress')}
                            disabled={updatingStep === step.id}
                            className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 disabled:opacity-50"
                          >Начать</button>
                          <button
                            onClick={() => onStepStatus(step, 'skipped')}
                            disabled={updatingStep === step.id}
                            className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded hover:bg-gray-200"
                          >Пропустить</button>
                        </>
                      )}
                      {step.status === 'in_progress' && (
                        <button
                          onClick={() => onStepStatus(step, 'done')}
                          disabled={updatingStep === step.id}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 disabled:opacity-50"
                        >Выполнено</button>
                      )}
                      {(step.status === 'done' || step.status === 'skipped') && (
                        <button
                          onClick={() => onStepStatus(step, 'pending')}
                          disabled={updatingStep === step.id}
                          className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded hover:bg-gray-200"
                        >Сбросить</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Plan preview modal */}
      {showAiPreview && aiPlan && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAiPreview(false)}>
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">AI-план запуска</h3>
                <p className="text-xs text-slate-500 mt-0.5">{campaign.name}</p>
              </div>
              <button onClick={() => setShowAiPreview(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                <p className="text-sm text-purple-800">{aiPlan.summary}</p>
              </div>

              <div className="space-y-2">
                {aiPlan.steps.map((step, i) => (
                  <div key={i} className="flex gap-3 p-3 border border-slate-100 rounded-xl">
                    <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                      {step.step_order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{step.title}</span>
                        <span className="text-xs text-slate-400">День {step.day_start}–{step.day_end}</span>
                        {step.priority === 'high' && (
                          <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">высокий приоритет</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                      {step.expected_result && (
                        <p className="text-xs text-green-600 mt-0.5">→ {step.expected_result}</p>
                      )}
                    </div>
                    <span className="text-lg flex-shrink-0">{STEP_ICONS[step.type] ?? '•'}</span>
                  </div>
                ))}
              </div>

              {aiPlan.key_risks?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">Ключевые риски</p>
                  <ul className="space-y-0.5">
                    {aiPlan.key_risks.map((r, i) => (
                      <li key={i} className="text-xs text-amber-700">• {r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onApplyAiPlan}
                  disabled={applyingAi}
                  className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {applyingAi ? 'Применяем...' : 'Применить план'}
                </button>
                <button
                  onClick={() => setShowAiPreview(false)}
                  className="px-4 py-2.5 text-slate-500 hover:text-slate-700 text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NewCampaignForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', platform: 'wb', sku: '', target_sales: '', target_position: '', budget: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiPlan, setAiPlan] = useState<AiLaunchPlan | null>(null);
  const [showAiPreview, setShowAiPreview] = useState(false);

  async function onCreate(useAi = false) {
    setError('');
    if (!form.name || !form.sku) { setError('Укажите название и SKU'); return; }

    if (useAi) {
      setGeneratingAi(true);
      try {
        const result = await getAiLaunchPlan({
          productName: form.name,
          platform: form.platform,
          sku: form.sku,
          targetPosition: form.target_position ? Number(form.target_position) : undefined,
          targetSales: form.target_sales ? Number(form.target_sales) : undefined,
          budget: form.budget ? Number(form.budget) : undefined,
        });
        setAiPlan(result.plan);
        setShowAiPreview(true);
      } catch (e: any) { setError('Ошибка AI: ' + e.message); }
      finally { setGeneratingAi(false); }
      return;
    }

    setSaving(true);
    try {
      await createLaunchCampaign({
        name: form.name, platform: form.platform, sku: form.sku,
        target_sales: form.target_sales ? Number(form.target_sales) : undefined,
        target_position: form.target_position ? Number(form.target_position) : undefined,
        budget: form.budget ? Number(form.budget) : undefined,
        notes: form.notes || undefined,
      });
      setOpen(false);
      setForm({ name: '', platform: 'wb', sku: '', target_sales: '', target_position: '', budget: '', notes: '' });
      onCreated();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function onCreateWithAiPlan() {
    if (!aiPlan) return;
    setSaving(true);
    try {
      const campaign = await createLaunchCampaign({
        name: form.name, platform: form.platform, sku: form.sku,
        target_sales: form.target_sales ? Number(form.target_sales) : undefined,
        target_position: form.target_position ? Number(form.target_position) : undefined,
        budget: form.budget ? Number(form.budget) : undefined,
        notes: form.notes || undefined,
      });
      await applyAiLaunchPlan(campaign.id, aiPlan.steps);
      setOpen(false);
      setShowAiPreview(false);
      setAiPlan(null);
      setForm({ name: '', platform: 'wb', sku: '', target_sales: '', target_position: '', budget: '', notes: '' });
      onCreated();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors text-sm">
      + Новая кампания запуска
    </button>
  );

  return (
    <>
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Новая кампания запуска</h3>
          <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">✨ AI-план доступен</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Название товара</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Запуск кроссовок, Весна 2026" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Платформа</label>
            <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="border rounded px-3 py-2 text-sm w-full">
              <option value="wb">Wildberries</option>
              <option value="ozon">Ozon</option>
              <option value="ym">Яндекс Маркет</option>
              <option value="mm">Мегамаркет</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">SKU / артикул</label>
            <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Артикул" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Цель: продажи/день</label>
            <input type="number" value={form.target_sales} onChange={e => setForm(f => ({ ...f, target_sales: e.target.value }))} placeholder="100" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Цель: позиция в поиске</label>
            <input type="number" value={form.target_position} onChange={e => setForm(f => ({ ...f, target_position: e.target.value }))} placeholder="Топ 20" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Бюджет на запуск (₽)</label>
            <input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="50000" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Заметки</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Доп. информация" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => onCreate(true)}
            disabled={generatingAi || saving}
            className="flex items-center gap-1.5 bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            {generatingAi ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Генерация плана...
              </>
            ) : '✨ Создать с AI'}
          </button>
          <button
            onClick={() => onCreate(false)}
            disabled={saving || generatingAi}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Создаём...' : 'Создать с шаблоном'}
          </button>
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-700 text-sm px-4 py-2">Отмена</button>
        </div>
      </div>

      {/* AI plan preview */}
      {showAiPreview && aiPlan && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAiPreview(false)}>
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b">
              <h3 className="font-semibold text-slate-800">AI создал план запуска</h3>
              <p className="text-xs text-slate-500 mt-0.5">{form.name} · {form.platform.toUpperCase()}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                <p className="text-sm text-purple-800">{aiPlan.summary}</p>
              </div>

              <div className="space-y-2">
                {aiPlan.steps.map((step: AiLaunchStep, i: number) => (
                  <div key={i} className="flex gap-3 p-3 border border-slate-100 rounded-xl">
                    <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                      {step.step_order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{step.title}</span>
                        <span className="text-xs text-slate-400">День {step.day_start}–{step.day_end}</span>
                        {step.priority === 'high' && (
                          <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">высокий</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                      {step.expected_result && (
                        <p className="text-xs text-green-600 mt-0.5">→ {step.expected_result}</p>
                      )}
                    </div>
                    <span className="text-lg flex-shrink-0">{STEP_ICONS[step.type] ?? '•'}</span>
                  </div>
                ))}
              </div>

              {aiPlan.key_risks?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">Ключевые риски</p>
                  <ul className="space-y-0.5">
                    {aiPlan.key_risks.map((r: string, i: number) => (
                      <li key={i} className="text-xs text-amber-700">• {r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onCreateWithAiPlan}
                  disabled={saving}
                  className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-purple-700 disabled:opacity-50"
                >
                  {saving ? 'Создаём...' : 'Создать кампанию с этим планом'}
                </button>
                <button onClick={() => setShowAiPreview(false)} className="px-4 text-slate-500 hover:text-slate-700 text-sm">
                  Назад
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function LaunchPage() {
  const [campaigns, setCampaigns] = useState<LaunchCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try { setCampaigns(await getLaunchCampaigns()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = campaigns.filter(c => filter === 'all' || c.status === filter);
  const active = campaigns.filter(c => c.status === 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Запуск товаров</h1>
          <p className="text-sm text-gray-500 mt-0.5">Пошаговые планы с AI-поддержкой для успешного вывода новинок</p>
        </div>
        {active > 0 && <span className="bg-blue-100 text-blue-700 text-sm font-medium px-3 py-1 rounded-full">{active} активных</span>}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[['all', 'Все'], ['draft', 'Черновики'], ['active', 'Активные'], ['completed', 'Завершённые']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400">Загрузка...</div>
      ) : (
        <div className="space-y-4">
          <NewCampaignForm onCreated={load} />
          {filtered.length === 0 && campaigns.length > 0 && (
            <div className="text-center py-8 text-gray-400">Нет кампаний с выбранным фильтром</div>
          )}
          {filtered.length === 0 && campaigns.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border">
              <div className="text-4xl mb-3">🚀</div>
              <p className="text-slate-600 font-medium">Запустите первый товар с AI</p>
              <p className="text-slate-400 text-sm mt-1">Нажмите «+ Новая кампания запуска» и выберите «Создать с AI»</p>
            </div>
          )}
          {filtered.map(c => <CampaignCard key={c.id} campaign={c} onRefresh={load} />)}
        </div>
      )}
    </div>
  );
}

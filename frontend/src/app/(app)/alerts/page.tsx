'use client';

import { useEffect, useState } from 'react';
import {
  getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule,
  getAlertEvents, markAlertEventRead, markAllAlertEventsRead,
  getCustomAlertRules, createCustomAlertRule, updateCustomAlertRule, deleteCustomAlertRule,
  getAlertsAiTune, AlertsAiTune, AlertAiNoisyRule, AlertAiMissing,
  type AlertRule, type AlertEvent, type CustomAlertRule, type CustomRuleType, type ComparisonOp,
} from '@/lib/api';

const ALERT_TYPES = [
  { value: 'low_stock',       label: 'Низкий остаток',          hint: 'Порог: остаток (шт)' },
  { value: 'pnl_negative',    label: 'SKU в минус по P&L',      hint: 'Порог: не нужен' },
  { value: 'sales_drop',      label: 'Падение продаж',          hint: 'Порог: % снижения' },
  { value: 'high_returns',    label: 'Высокие возвраты/штрафы', hint: 'Порог: % от выручки' },
  { value: 'competitor_price', label: 'Цена конкурента ниже',   hint: 'Скоро' },
  { value: 'position_drop',   label: 'Вылет из топа',           hint: 'Скоро' },
];
const COMING_SOON = ['competitor_price', 'position_drop'];

const CUSTOM_RULE_TYPES: Array<{ value: CustomRuleType; label: string; hint: string; defaultThreshold: string }> = [
  { value: 'stock_low',        label: 'Низкий остаток',      hint: 'Алерт когда остаток (шт) меньше порога',         defaultThreshold: '10' },
  { value: 'price_change',     label: 'Изменение цены',      hint: 'Алерт при изменении цены на % и более',          defaultThreshold: '10' },
  { value: 'rating_drop',      label: 'Падение рейтинга',    hint: 'Алерт когда рейтинг упадёт ниже порога',          defaultThreshold: '4' },
  { value: 'drr_high',         label: 'ДРР слишком высокий', hint: 'Алерт когда ДРР превысит порог (%)',              defaultThreshold: '30' },
  { value: 'no_sales',         label: 'Нет продаж',          hint: 'Алерт если не было продаж за N дней (порог = N)', defaultThreshold: '7' },
  { value: 'review_rate_low',  label: 'Низкий рейтинг',      hint: 'Аналог rating_drop (скоро)',                      defaultThreshold: '4' },
];

const COMPARISON_OPS: Array<{ value: ComparisonOp; label: string }> = [
  { value: 'lt',         label: '< меньше' },
  { value: 'lte',        label: '≤ не более' },
  { value: 'gt',         label: '> больше' },
  { value: 'gte',        label: '≥ не менее' },
  { value: 'change_pct', label: '± изм. на %' },
];

function typeLabel(type: string) { return ALERT_TYPES.find(t => t.value === type)?.label ?? type; }
function typeIcon(type: string) {
  switch (type) {
    case 'low_stock': case 'stock_low':   return '📦';
    case 'pnl_negative':                  return '📉';
    case 'sales_drop': case 'no_sales':   return '⬇️';
    case 'high_returns':                  return '↩️';
    case 'competitor_price': case 'price_change': return '🏷️';
    case 'position_drop': case 'rating_drop': return '🔽';
    case 'drr_high':                      return '💸';
    default:                              return '🔔';
  }
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'только что';
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

// ─── Custom Rules Tab ──────────────────────────────────────────────────────

function CustomRulesTab() {
  const [rules, setRules] = useState<CustomAlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    rule_type: CustomRuleType;
    threshold: string;
    comparison: ComparisonOp;
    platform: string;
    sku: string;
  }>({ name: '', rule_type: 'stock_low', threshold: '10', comparison: 'lt', platform: '', sku: '' });

  async function load() {
    setLoading(true);
    try { setRules(await getCustomAlertRules()); } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function selectType(rt: CustomRuleType) {
    const info = CUSTOM_RULE_TYPES.find(t => t.value === rt);
    setForm(f => ({ ...f, rule_type: rt, threshold: info?.defaultThreshold ?? '10' }));
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.threshold) return;
    setSaving(true);
    try {
      const condition: Record<string, unknown> = {};
      if (form.platform) condition.platform = form.platform;
      if (form.sku) condition.sku = form.sku;
      const rule = await createCustomAlertRule({
        name: form.name.trim(),
        rule_type: form.rule_type,
        condition,
        threshold: Number(form.threshold),
        comparison: form.comparison,
      });
      setRules(prev => [rule, ...prev]);
      setShowForm(false);
      setForm({ name: '', rule_type: 'stock_low', threshold: '10', comparison: 'lt', platform: '', sku: '' });
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  async function toggleEnabled(rule: CustomAlertRule) {
    const updated = await updateCustomAlertRule(rule.id, { enabled: !rule.enabled });
    setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить правило?')) return;
    await deleteCustomAlertRule(id);
    setRules(prev => prev.filter(r => r.id !== id));
  }

  const typeInfo = CUSTOM_RULE_TYPES.find(t => t.value === form.rule_type);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Настраиваемые условия мониторинга с произвольным порогом</p>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Новое правило
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border-2 border-purple-300 p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">Новое правило мониторинга</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Тип условия</label>
              <select value={form.rule_type} onChange={e => selectType(e.target.value as CustomRuleType)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
                {CUSTOM_RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {typeInfo && <p className="text-xs text-slate-400 mt-1">{typeInfo.hint}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Название правила</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Например: Критический сток WB"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Сравнение</label>
              <select value={form.comparison} onChange={e => setForm(f => ({ ...f, comparison: e.target.value as ComparisonOp }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
                {COMPARISON_OPS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Порог</label>
              <input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Платформа (опц.)</label>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">Все платформы</option>
                <option value="wb">Wildberries</option>
                <option value="ozon">Ozon</option>
                <option value="ym">Яндекс Маркет</option>
                <option value="mm">Мегамаркет</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">SKU (опц.)</label>
              <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="Конкретный артикул"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.threshold}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
              {saving ? 'Сохранение...' : 'Создать правило'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
              Отмена
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rules.length === 0 && !showForm ? (
        <div className="bg-white rounded-xl border border-slate-100 py-14 text-center">
          <div className="text-4xl mb-3">⚙️</div>
          <p className="text-slate-500 text-sm mb-3">Нет пользовательских правил. Создайте первое!</p>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors">
            Создать правило
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {rules.map(rule => {
              const info = CUSTOM_RULE_TYPES.find(t => t.value === rule.rule_type);
              const compOp = COMPARISON_OPS.find(o => o.value === rule.comparison);
              return (
                <div key={rule.id} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="text-xl shrink-0">{typeIcon(rule.rule_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{rule.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {info?.label} · {compOp?.label} {rule.threshold}
                      {rule.condition?.platform && ` · ${String(rule.condition.platform).toUpperCase()}`}
                      {rule.condition?.sku && ` · ${rule.condition.sku}`}
                      {rule.fire_count > 0 && ` · Сработало ${rule.fire_count} раз`}
                    </p>
                    {rule.last_fired_at && (
                      <p className="text-xs text-orange-500 mt-0.5">Последний раз: {timeAgo(rule.last_fired_at)}</p>
                    )}
                  </div>
                  <button onClick={() => toggleEnabled(rule)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${rule.enabled ? 'bg-purple-600' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <button onClick={() => handleDelete(rule.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const ALERT_HEALTH_CONFIG: Record<string, { bg: string; border: string; text: string; label: string; icon: string }> = {
  good:           { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  label: 'Всё хорошо',       icon: '✅' },
  noisy:          { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  label: 'Шумные правила',   icon: '🔔' },
  undermonitored: { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   label: 'Мало мониторинга', icon: '👁' },
  unconfigured:   { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-600',  label: 'Не настроено',     icon: '⚙️' },
};

function AlertsAiPanel({ result, onClose }: { result: AlertsAiTune; onClose: () => void }) {
  const hcfg = ALERT_HEALTH_CONFIG[result.health] ?? ALERT_HEALTH_CONFIG.unconfigured;
  return (
    <div className="bg-white rounded-xl border border-violet-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h3 className="font-semibold text-slate-800">AI настройка алертов</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>

      <div className={`flex items-center gap-3 p-3 rounded-xl border ${hcfg.bg} ${hcfg.border}`}>
        <span className="text-xl">{hcfg.icon}</span>
        <div>
          <p className={`font-semibold text-sm ${hcfg.text}`}>{hcfg.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{result.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-slate-800">{result.total_rules}</p>
          <p className="text-xs text-slate-500">Правил</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className={`text-xl font-bold ${result.total_events_30d > 50 ? 'text-amber-600' : 'text-slate-800'}`}>{result.total_events_30d}</p>
          <p className="text-xs text-slate-500">Событий за 30 дней</p>
        </div>
      </div>

      {result.noisy_rules.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Шумные правила</p>
          <div className="space-y-2">
            {result.noisy_rules.map((r, i) => (
              <div key={i} className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                <p className="text-sm font-medium text-slate-800">{r.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.issue}</p>
                <p className="text-xs text-amber-700 mt-1">→ {r.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.silent_rules.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Молчащие правила</p>
          <div className="space-y-2">
            {result.silent_rules.map((r, i) => (
              <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800">{r.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.issue}</p>
                <p className="text-xs text-blue-600 mt-1">→ {r.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.missing_suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide">Рекомендуем добавить</p>
          <div className="space-y-1">
            {result.missing_suggestions.map((m, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-red-400 flex-shrink-0 mt-0.5">+</span>
                <span><strong>{m.type}</strong> — {m.reason}{m.suggested_threshold != null ? ` (порог: ${m.suggested_threshold})` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.threshold_adjustments.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Настройка порогов</p>
          <div className="space-y-2">
            {result.threshold_adjustments.map((t, i) => (
              <div key={i} className="text-sm text-slate-700 flex gap-2">
                <span className="text-violet-500">→</span>
                <span><strong>{t.name}:</strong> {t.current_threshold} → {t.suggested_threshold} ({t.reason})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.actions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Действия</p>
          <ol className="space-y-1">
            {result.actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                {a}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-slate-400">Сформировано: {new Date(result.generated_at).toLocaleString('ru-RU')}</p>
    </div>
  );
}

export default function AlertsPage() {
  const [tab, setTab] = useState<'events' | 'rules' | 'custom'>('events');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newType, setNewType] = useState('low_stock');
  const [newName, setNewName] = useState('');
  const [newThreshold, setNewThreshold] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([getAlertRules(), getAlertEvents(100)]);
      setRules(r);
      setEvents(e.events);
      setUnread(e.unread_count);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(rule: AlertRule) {
    const updated = await updateAlertRule(rule.id, { is_active: !rule.is_active });
    setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить правило?')) return;
    await deleteAlertRule(id);
    setRules(prev => prev.filter(r => r.id !== id));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const threshold = newThreshold ? Number(newThreshold) : undefined;
      const rule = await createAlertRule({ type: newType, name: newName.trim(), threshold });
      setRules(prev => [...prev, rule]);
      setShowNew(false);
      setNewName(''); setNewThreshold('');
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  async function handleMarkRead(id: string) {
    await markAlertEventRead(id);
    setEvents(prev => prev.map(e => e.id === id ? { ...e, is_read: true } : e));
    setUnread(u => Math.max(0, u - 1));
  }

  async function handleMarkAll() {
    await markAllAlertEventsRead();
    setEvents(prev => prev.map(e => ({ ...e, is_read: true })));
    setUnread(0);
  }

  const [aiTune, setAiTune] = useState<AlertsAiTune | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  async function handleAiTune() {
    setAiLoading(true);
    setAiTune(null);
    try {
      const result = await getAlertsAiTune();
      setAiTune(result);
    } catch (e: any) {
      alert(e.message ?? 'Ошибка AI анализа');
    } finally {
      setAiLoading(false);
    }
  }

  const typeHint = ALERT_TYPES.find(t => t.value === newType)?.hint;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Алерты</h1>
          <p className="text-sm text-slate-500 mt-0.5">Уведомления о важных событиях в ваших магазинах</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleAiTune}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {aiLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : <span>🤖</span>}
            {aiLoading ? 'Анализ...' : 'AI настройка'}
          </button>
          {tab === 'rules' && (
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить правило
            </button>
          )}
          {tab === 'events' && unread > 0 && (
            <button onClick={handleMarkAll} className="text-sm text-purple-600 hover:text-purple-700 font-medium">
              Прочитать все ({unread})
            </button>
          )}
        </div>
      </div>

      {aiTune && (
        <AlertsAiPanel result={aiTune} onClose={() => setAiTune(null)} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          ['events', 'История'],
          ['rules', 'Правила'],
          ['custom', 'Мои правила'],
        ] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {l}
            {v === 'events' && unread > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                {unread > 99 ? '99' : unread}
              </span>
            )}
            {v === 'rules' && <span className="ml-1.5 text-slate-400 font-normal">{rules.length}</span>}
          </button>
        ))}
      </div>

      {/* Custom tab doesn't use the shared loading state */}
      {tab === 'custom' && <CustomRulesTab />}

      {tab !== 'custom' && loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'events' ? (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {events.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">🔔</div>
              <p className="text-slate-500 text-sm">Нет событий. Алерты появятся здесь когда сработают правила.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {events.map(ev => (
                <div key={ev.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${!ev.is_read ? 'bg-purple-50/40' : ''}`}>
                  <span className="text-xl mt-0.5 shrink-0">{typeIcon(ev.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!ev.is_read ? 'font-medium text-slate-800' : 'text-slate-600'}`}>{ev.message}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-400">{timeAgo(ev.triggered_at)}</span>
                      {ev.platform && (
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          ev.platform === 'wb' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>{ev.platform}</span>
                      )}
                      <span className="text-xs text-slate-400">{typeLabel(ev.type)}</span>
                    </div>
                  </div>
                  {!ev.is_read && (
                    <button onClick={() => handleMarkRead(ev.id)}
                      className="shrink-0 text-xs text-purple-600 hover:text-purple-700 font-medium">✓</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'rules' ? (
        <div className="space-y-3">
          {showNew && (
            <div className="bg-white rounded-xl border-2 border-purple-300 p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">Новое правило</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Тип алерта</label>
                  <select value={newType} onChange={e => setNewType(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
                    {ALERT_TYPES.filter(t => !COMING_SOON.includes(t.value)).map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {typeHint && <p className="text-xs text-slate-400 mt-1">{typeHint}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Название</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="Например: Критический остаток WB"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                {newType !== 'pnl_negative' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Порог</label>
                    <input type="number" value={newThreshold} onChange={e => setNewThreshold(e.target.value)}
                      placeholder={newType === 'low_stock' ? '10' : newType === 'sales_drop' ? '30' : '15'}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={saving || !newName.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Сохранение...' : 'Создать'}
                </button>
                <button onClick={() => { setShowNew(false); setNewName(''); setNewThreshold(''); }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {rules.length === 0 && !showNew ? (
            <div className="bg-white rounded-xl border border-slate-100 py-16 text-center">
              <div className="text-4xl mb-3">⚙️</div>
              <p className="text-slate-500 text-sm mb-4">Нет правил. Создайте первое!</p>
              <button onClick={() => setShowNew(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors">
                Добавить правило
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {rules.map(rule => {
                  const info = ALERT_TYPES.find(t => t.value === rule.type);
                  return (
                    <div key={rule.id} className="flex items-center gap-4 px-4 py-3.5">
                      <span className="text-xl">{typeIcon(rule.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{rule.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {info?.label}
                          {rule.threshold != null && ` · Порог: ${rule.threshold}`}
                          {rule.platform && ` · ${rule.platform.toUpperCase()}`}
                        </p>
                      </div>
                      <button onClick={() => handleToggle(rule)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${rule.is_active ? 'bg-purple-600' : 'bg-slate-200'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <button onClick={() => handleDelete(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Скоро появятся</p>
            <div className="flex gap-2 flex-wrap">
              {COMING_SOON.map(t => {
                const info = ALERT_TYPES.find(x => x.value === t)!;
                return (
                  <span key={t} className="flex items-center gap-1.5 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                    {typeIcon(t)} {info.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

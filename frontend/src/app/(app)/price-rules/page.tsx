'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPricingRules, savePricingRule, deletePricingRule,
  applyPricingRuleNow, getPricingHistory, getConnections,
  optimizePrice, type PriceOptimizeResult,
} from '@/lib/api';
import type { PricingRule, PriceChangeLog, Connection } from '@/lib/api';

const STRATEGY_LABELS: Record<string, string> = {
  fixed: 'Фиксированная цена',
  margin: 'Наценка от себестоимости',
  competitive: 'Ниже текущей цены',
  dynamic: 'Динамика (вых./будни)',
  competitor_based: 'По цене конкурента (умный репрайсер)',
};

const PLATFORM_BADGE: Record<string, string> = {
  wb: 'bg-pink-50 text-pink-700 border-pink-200',
  ozon: 'bg-blue-50 text-blue-700 border-blue-200',
  ym: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  mm: 'bg-green-50 text-green-700 border-green-200',
};

function fmt(n: number) { return Number(n).toLocaleString('ru-RU'); }

// ---- Rule form modal ----
function RuleModal({
  rule,
  connections,
  onSave,
  onClose,
}: {
  rule: Partial<PricingRule> | null;
  connections: Connection[];
  onSave: (r: PricingRule) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [connectionId, setConnectionId] = useState(rule?.connection_id ?? '');
  const [sku, setSku] = useState(rule?.sku ?? '');
  const [strategy, setStrategy] = useState<'margin' | 'competitive' | 'fixed' | 'dynamic' | 'competitor_based'>((rule?.strategy as any) ?? 'margin');
  const [config, setConfig] = useState<Record<string, string>>({
    fixedPrice: String(rule?.config?.fixedPrice ?? ''),
    margin: String(rule?.config?.margin ?? '30'),
    discount: String(rule?.config?.discount ?? '5'),
    weekendMultiplier: String(rule?.config?.weekendMultiplier ?? '1.1'),
    competitorMode: String(rule?.config?.competitorMode ?? 'undercut'),
    competitorPct: String(rule?.config?.competitorPct ?? '2'),
    minPrice: String(rule?.config?.minPrice ?? ''),
    maxPrice: String(rule?.config?.maxPrice ?? ''),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setConf(key: string, val: string) {
    setConfig((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!name.trim() || !connectionId) { setError('Укажите название и подключение'); return; }
    setSaving(true); setError('');
    try {
      const cfg: Record<string, unknown> = { minPrice: config.minPrice ? Number(config.minPrice) : undefined, maxPrice: config.maxPrice ? Number(config.maxPrice) : undefined };
      if (strategy === 'fixed') cfg.fixedPrice = Number(config.fixedPrice);
      if (strategy === 'margin') cfg.margin = Number(config.margin);
      if (strategy === 'competitive') cfg.discount = Number(config.discount);
      if (strategy === 'dynamic') cfg.weekendMultiplier = Number(config.weekendMultiplier);
      if (strategy === 'competitor_based') { cfg.competitorMode = config.competitorMode; cfg.competitorPct = Number(config.competitorPct); }

      const saved = await savePricingRule({
        id: rule?.id,
        name,
        connectionId: connectionId || null,
        sku: sku || null,
        strategy,
        config: cfg,
        enabled: rule?.enabled ?? true,
      } as any);
      onSave(saved);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setSaving(false); }
  }

  const InputField = ({ label, k, placeholder = '' }: { label: string; k: string; placeholder?: string }) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type="number" value={config[k]} onChange={(e) => setConf(k, e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{rule?.id ? 'Редактировать правило' : 'Новое правило'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Название</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Конкурентная цена WB"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Подключение</label>
          <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
            <option value="">Выберите магазин</option>
            {connections.map((c) => <option key={c.id} value={c.id}>{c.display_name} ({c.platform.toUpperCase()})</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">SKU (пусто = все товары)</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Артикул товара"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Стратегия</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as any)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
            {Object.entries(STRATEGY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {strategy === 'fixed' && <InputField label="Целевая цена (₽)" k="fixedPrice" />}
        {strategy === 'margin' && <InputField label="Наценка (%)" k="margin" placeholder="30" />}
        {strategy === 'competitive' && <InputField label="Скидка от текущей цены (%)" k="discount" placeholder="5" />}
        {strategy === 'dynamic' && <InputField label="Коэффициент в выходные" k="weekendMultiplier" placeholder="1.1" />}
        {strategy === 'competitor_based' && (
          <div className="space-y-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-xs text-blue-700 font-medium">Использует цены конкурентов из раздела SEO → Конкуренты</p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Режим</label>
              <select value={config.competitorMode} onChange={(e) => setConf('competitorMode', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="match">Повторить цену конкурента</option>
                <option value="undercut">Дешевле конкурента на N%</option>
                <option value="above">Дороже конкурента на N%</option>
              </select>
            </div>
            {config.competitorMode !== 'match' && (
              <InputField label="Разница (%)" k="competitorPct" placeholder="2" />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <InputField label="Мин. цена (₽)" k="minPrice" />
          <InputField label="Макс. цена (₽)" k="maxPrice" />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
            Отмена
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm">
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- History drawer ----
function HistoryDrawer({ ruleId, ruleName, onClose }: { ruleId: string; ruleName: string; onClose: () => void }) {
  const [history, setHistory] = useState<PriceChangeLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPricingHistory(ruleId).then(setHistory).catch(() => {}).finally(() => setLoading(false));
  }, [ruleId]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">История изменений</h2>
            <p className="text-sm text-slate-500">{ruleName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : history.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">Правило ещё не применялось</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl text-sm">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PLATFORM_BADGE[h.platform] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {h.platform.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{h.title || h.sku}</p>
                    <p className="text-xs text-slate-400">{h.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-medium">
                      <span className="text-slate-400 line-through mr-1">{fmt(h.old_price)}</span>
                      <span className={Number(h.new_price) > Number(h.old_price) ? 'text-green-600' : 'text-red-500'}>
                        {fmt(h.new_price)} ₽
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">{new Date(h.applied_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- AI Price Optimizer tab ----
const STRATEGY_RU: Record<string, string> = {
  premium:      'Премиум',
  competitive:  'Конкурентная',
  penetration:  'Проникновение',
  value:        'Ценность',
};

function OptimizerTab() {
  const [sku, setSku]           = useState('');
  const [platform, setPlatform] = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<PriceOptimizeResult | null>(null);
  const [error, setError]       = useState('');

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!sku.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await optimizePrice(sku.trim(), platform || undefined);
      setResult(r);
    } catch (err: any) {
      setError(err.message ?? 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleAnalyze} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <p className="text-sm text-slate-500">Введите SKU — AI проанализирует цены конкурентов, маржу и продажи и предложит оптимальную цену.</p>
        <div className="flex gap-3">
          <input
            value={sku} onChange={e => setSku(e.target.value)}
            placeholder="SKU товара"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
          />
          <select
            value={platform} onChange={e => setPlatform(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            <option value="">Все площадки</option>
            <option value="wb">WildBerries</option>
            <option value="ozon">Ozon</option>
          </select>
          <button
            type="submit" disabled={loading || !sku.trim()}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Анализ...
              </span>
            ) : 'Оптимизировать'}
          </button>
        </div>
      </form>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>}

      {result && (
        <div className="space-y-4">
          {/* Current state */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400 font-medium mb-3 uppercase tracking-wide">Текущее состояние</p>
            <p className="font-semibold text-slate-900 mb-3">{result.title}</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Средняя цена (30д)', value: result.current_price ? `${result.current_price.toLocaleString('ru-RU')} ₽` : '—' },
                { label: 'Себестоимость',       value: result.purchase_price ? `${result.purchase_price.toLocaleString('ru-RU')} ₽` : '—' },
                { label: 'Текущая маржа',        value: result.margin_pct != null ? `${result.margin_pct}%` : '—' },
              ].map(k => (
                <div key={k.label} className="text-center bg-slate-50 rounded-lg py-3">
                  <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                  <p className="text-lg font-bold text-slate-900">{k.value}</p>
                </div>
              ))}
            </div>
            {result.competitors.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-slate-400 mb-2">Конкуренты</p>
                <div className="flex flex-wrap gap-2">
                  {result.competitors.map((c, i) => (
                    <span key={i} className="px-3 py-1 bg-slate-100 rounded-full text-xs text-slate-600">
                      {c.name ?? c.platform}: <span className="font-semibold">{c.last_price.toLocaleString('ru-RU')} ₽</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI Suggestion */}
          {result.suggestion ? (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-purple-500 font-semibold uppercase tracking-wide">AI Рекомендация</p>
                <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                  {STRATEGY_RU[result.suggestion.strategy] ?? result.suggestion.strategy}
                </span>
              </div>

              <div className="flex items-end gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Рекомендуемая цена</p>
                  <p className="text-4xl font-bold text-purple-700">
                    {result.suggestion.suggested_price.toLocaleString('ru-RU')} ₽
                  </p>
                </div>
                <div className="pb-1 text-sm text-slate-500">
                  диапазон: {result.suggestion.price_range.min.toLocaleString('ru-RU')} — {result.suggestion.price_range.max.toLocaleString('ru-RU')} ₽
                </div>
                {result.suggestion.expected_margin_pct != null && (
                  <div className="pb-1 ml-auto">
                    <p className="text-xs text-slate-400 mb-0.5">Ожидаемая маржа</p>
                    <p className={`text-xl font-bold ${result.suggestion.expected_margin_pct >= 20 ? 'text-green-600' : result.suggestion.expected_margin_pct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                      {result.suggestion.expected_margin_pct}%
                    </p>
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">{result.suggestion.reasoning}</p>

              {result.suggestion.caution && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <span className="text-amber-500 mt-0.5">⚠</span>
                  <p className="text-xs text-amber-700">{result.suggestion.caution}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
              <p className="text-sm text-slate-500">AI не смог сформировать предложение. Возможно, недостаточно данных.</p>
              {result.raw && <pre className="text-xs text-slate-400 mt-2 whitespace-pre-wrap">{result.raw}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main page ----
export default function PriceRulesPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [history, setHistory] = useState<PriceChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<Partial<PricingRule> | null | false>(false);
  const [historyRule, setHistoryRule] = useState<PricingRule | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [tab, setTab] = useState<'rules' | 'history' | 'optimizer'>('rules');
  const [applyMsg, setApplyMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, h] = await Promise.all([getPricingRules(), getConnections(), getPricingHistory()]);
      setRules(r);
      setConnections(c);
      setHistory(h);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(rule: PricingRule) {
    try {
      const updated = await savePricingRule({ ...rule, enabled: !rule.enabled } as any);
      setRules((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить правило?')) return;
    await deletePricingRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleApply(rule: PricingRule) {
    setApplying(rule.id); setApplyMsg('');
    try {
      const res = await applyPricingRuleNow(rule.id);
      setApplyMsg(`Правило «${rule.name}»: изменено ${res.applied}, пропущено ${res.skipped}`);
      await load();
    } catch (e) { setApplyMsg(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setApplying(null); }
  }

  const connMap: Record<string, Connection> = Object.fromEntries(connections.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      {editRule !== false && (
        <RuleModal
          rule={editRule}
          connections={connections}
          onSave={(saved) => { setRules((prev) => { const idx = prev.findIndex((r) => r.id === saved.id); return idx >= 0 ? prev.map((r) => r.id === saved.id ? saved : r) : [...prev, saved]; }); setEditRule(false); }}
          onClose={() => setEditRule(false)}
        />
      )}
      {historyRule && (
        <HistoryDrawer ruleId={historyRule.id} ruleName={historyRule.name} onClose={() => setHistoryRule(null)} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Управление ценами</h1>
          <p className="text-slate-500 mt-1">Правила автоматической коррекции цен, применяются каждые 6 часов</p>
        </div>
        <button onClick={() => setEditRule({})}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors text-sm">
          + Новое правило
        </button>
      </div>

      {applyMsg && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm">{applyMsg}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { v: 'rules',     l: `Правила (${rules.length})` },
          { v: 'history',   l: `История (${history.length})` },
          { v: 'optimizer', l: '✨ AI-оптимизатор' },
        ] as { v: 'rules' | 'history' | 'optimizer'; l: string }[]).map(({ v, l }) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'optimizer' ? (
        <OptimizerTab />
      ) : loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : tab === 'rules' ? (
        rules.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
            <div className="text-5xl mb-4">💰</div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Нет правил ценообразования</h2>
            <p className="text-slate-500 text-sm mb-6">Создайте правило — система будет автоматически корректировать цены каждые 6 часов</p>
            <button onClick={() => setEditRule({})}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl text-sm transition-colors">
              Создать правило
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-50">
            {rules.map((rule) => {
              const conn = connMap[rule.connection_id ?? ''];
              return (
                <div key={rule.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">{rule.name}</p>
                      {conn && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PLATFORM_BADGE[conn.platform] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {conn.display_name}
                        </span>
                      )}
                      {rule.sku && (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200 font-mono">
                          {rule.sku}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{STRATEGY_LABELS[rule.strategy] ?? rule.strategy}</p>
                    {rule.last_applied_at && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Последнее применение: {new Date(rule.last_applied_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setHistoryRule(rule)}
                      className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors">
                      📋 История
                    </button>
                    <button onClick={() => handleApply(rule)} disabled={applying === rule.id}
                      className="px-3 py-1.5 border border-purple-200 text-purple-700 hover:bg-purple-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                      {applying === rule.id ? '...' : '▶ Применить'}
                    </button>
                    <button onClick={() => setEditRule(rule)}
                      className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors">
                      ✏ Изменить
                    </button>
                    <button
                      onClick={() => handleToggle(rule)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${rule.enabled ? 'bg-purple-600' : 'bg-slate-200'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${rule.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <button onClick={() => handleDelete(rule.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* History tab */
        history.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-sm">
            История изменений цен пуста
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Товар</th>
                    <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">Правило</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Было</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Стало</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Изменение</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-500 font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {history.map((h) => {
                    const delta = Number(h.new_price) - Number(h.old_price);
                    const pct = Number(h.old_price) > 0 ? Math.round((delta / Number(h.old_price)) * 100) : 0;
                    return (
                      <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 truncate max-w-[180px]">{h.title || h.sku}</p>
                          <p className="text-xs text-slate-400">
                            <span className={`inline-block px-1.5 rounded text-xs font-medium ${PLATFORM_BADGE[h.platform] ?? ''}`}>{h.platform.toUpperCase()}</span>
                            {' '}{h.sku}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs max-w-[140px] truncate">{h.rule_name ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{fmt(h.old_price)} ₽</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(h.new_price)} ₽</td>
                        <td className={`px-4 py-3 text-right font-medium ${delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {delta > 0 ? '+' : ''}{fmt(delta)} ₽ ({pct > 0 ? '+' : ''}{pct}%)
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-400">
                          {new Date(h.applied_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

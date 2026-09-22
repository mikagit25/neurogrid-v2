'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { calculateUnitEconomics, getCalcAiAdvice, type UnitEconInput, type UnitEconResult, type CalcAiAdvice } from '@/lib/api';

const PLATFORM_COMMISSIONS: Record<string, number> = {
  wb:   19,
  ozon: 15,
  ym:   10,
  mm:   8,
};

function NumberInput({
  label, value, onChange, suffix = '₽', min = 0, max, hint,
}: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; min?: number; max?: number; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-purple-400 focus-within:border-transparent">
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step="any"
          placeholder="0"
          className="flex-1 px-3 py-2.5 text-sm text-slate-900 outline-none bg-white"
        />
        <span className="px-3 text-sm text-slate-400 bg-slate-50 border-l border-slate-200 h-full flex items-center">{suffix}</span>
      </div>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function MetricRow({ label, value, color = 'slate', highlight = false }: {
  label: string; value: string; color?: string; highlight?: boolean;
}) {
  const colorMap: Record<string, string> = {
    green:  'text-green-700',
    red:    'text-red-600',
    amber:  'text-amber-600',
    purple: 'text-purple-700',
    slate:  'text-slate-700',
  };
  return (
    <div className={`flex justify-between items-center py-2 ${highlight ? 'border-t border-slate-200 pt-3 mt-1' : ''}`}>
      <span className={`text-sm ${highlight ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-sm font-semibold ${colorMap[color] ?? colorMap.slate}`}>{value}</span>
    </div>
  );
}

function GaugeBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function calcNetProfit(price: number, form: UnitEconInput): number {
  const fee = price * (form.commissionPct / 100);
  const returnCost = price * (form.returnRatePct / 100);
  return price - fee - form.cogs - form.logistics - returnCost - (form.adSpendPerUnit ?? 0);
}

function BreakEvenChart({ form }: { form: UnitEconInput }) {
  const W = 640, H = 160, PAD_L = 48, PAD_R = 16, PAD_T = 10, PAD_B = 28;
  const cW = W - PAD_L - PAD_R;
  const cH = H - PAD_T - PAD_B;

  const bePrice = useMemo(() => {
    const d = 1 - form.commissionPct / 100 - form.returnRatePct / 100;
    if (d <= 0) return form.sellingPrice * 2;
    return (form.cogs + form.logistics + (form.adSpendPerUnit ?? 0)) / d;
  }, [form]);

  const base = form.sellingPrice > 0 ? form.sellingPrice : bePrice;
  const lo = base * 0.6;
  const hi = base * 1.5;
  const steps = 40;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const price = lo + (i / steps) * (hi - lo);
    return { price, profit: calcNetProfit(price, form) };
  });

  const profits = points.map(p => p.profit);
  const maxP = Math.max(...profits, 1);
  const minP = Math.min(...profits, -1);
  const range = maxP - minP;

  const xPos = (i: number) => PAD_L + (i / steps) * cW;
  const yPos = (v: number) => PAD_T + cH - ((v - minP) / range) * cH;
  const zero = yPos(0);

  const polyline = points.map((p, i) => `${xPos(i)},${yPos(p.profit)}`).join(' ');
  const bePx = PAD_L + ((bePrice - lo) / (hi - lo)) * cW;

  const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  const fmtK = (n: number) => Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}к` : String(Math.round(n));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-900">График безубыточности</p>
        <span className="text-xs text-slate-500">
          Точка БУ: <span className="font-semibold text-amber-600">{fmt(bePrice)} ₽</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
        {/* Zero line */}
        {zero >= PAD_T && zero <= H - PAD_B && (
          <line x1={PAD_L} y1={zero} x2={W - PAD_R} y2={zero} stroke="#e2e8f0" strokeWidth="1" />
        )}
        {/* Y labels */}
        {[0, 0.5, 1].map(frac => {
          const v = minP + frac * range;
          const y = yPos(v);
          return (
            <text key={frac} x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
              {fmtK(v)}
            </text>
          );
        })}
        {/* Profit/loss fill areas */}
        <clipPath id="above-zero">
          <rect x={PAD_L} y={PAD_T} width={cW} height={zero - PAD_T} />
        </clipPath>
        <clipPath id="below-zero">
          <rect x={PAD_L} y={zero} width={cW} height={H - PAD_B - zero} />
        </clipPath>
        <polyline points={polyline} fill="none" stroke="#22c55e" strokeWidth="2" clipPath="url(#above-zero)" />
        <polyline points={polyline} fill="none" stroke="#ef4444" strokeWidth="2" clipPath="url(#below-zero)" />
        {/* Break-even marker */}
        {bePx >= PAD_L && bePx <= W - PAD_R && (
          <>
            <line x1={bePx} y1={PAD_T} x2={bePx} y2={H - PAD_B} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3,2" />
            <text x={bePx + 3} y={PAD_T + 11} fontSize="9" fill="#f59e0b" fontWeight="600">БУ</text>
          </>
        )}
        {/* Current price marker */}
        {form.sellingPrice > 0 && (() => {
          const px = PAD_L + ((form.sellingPrice - lo) / (hi - lo)) * cW;
          if (px < PAD_L || px > W - PAD_R) return null;
          return <line x1={px} y1={PAD_T} x2={px} y2={H - PAD_B} stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="3,2" />;
        })()}
        {/* X-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const price = lo + frac * (hi - lo);
          const x = PAD_L + frac * cW;
          return (
            <text key={frac} x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {fmt(price)}
            </text>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-green-500 inline-block" />Прибыль</span>
        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-red-500 inline-block" />Убыток</span>
        <span className="flex items-center gap-1"><span className="w-4 h-0.5 border-t border-dashed border-amber-500 inline-block" />Точка БУ</span>
        {form.sellingPrice > 0 && <span className="flex items-center gap-1"><span className="w-4 h-0.5 border-t border-dashed border-purple-600 inline-block" />Текущая цена</span>}
      </div>
    </div>
  );
}

function SensitivityTable({ form }: { form: UnitEconInput }) {
  if (!form.sellingPrice) return null;
  const deltas = [-0.30, -0.20, -0.10, 0, 0.10, 0.20, 0.30];
  const rows = deltas.map(d => {
    const price = form.sellingPrice * (1 + d);
    const profit = calcNetProfit(price, form);
    const margin = price > 0 ? (profit / price) * 100 : 0;
    return { delta: d, price, profit, margin };
  });
  const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <p className="px-5 pt-4 pb-2 text-sm font-semibold text-slate-900">Чувствительность к цене</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">Изменение</th>
              <th className="px-4 py-2 text-right text-xs text-slate-500 font-medium">Цена</th>
              <th className="px-4 py-2 text-right text-xs text-slate-500 font-medium">Прибыль/ед</th>
              <th className="px-4 py-2 text-right text-xs text-slate-500 font-medium">Маржа</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(r => (
              <tr key={r.delta} className={r.delta === 0 ? 'bg-purple-50' : 'hover:bg-slate-50'}>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold ${r.delta > 0 ? 'text-green-600' : r.delta < 0 ? 'text-red-500' : 'text-purple-700'}`}>
                    {r.delta === 0 ? 'Текущая' : `${r.delta > 0 ? '+' : ''}${Math.round(r.delta * 100)}%`}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">{fmt(r.price)} ₽</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${r.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {r.profit >= 0 ? '+' : ''}{fmt(r.profit)} ₽
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold ${r.margin >= 15 ? 'text-green-700' : r.margin >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                  {r.margin.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PRESETS = [
  { label: 'Одежда WB',    values: { sellingPrice: 2490, cogs: 600, logistics: 180, commissionPct: 19, returnRatePct: 30, adSpendPerUnit: 150 } },
  { label: 'Электроника',  values: { sellingPrice: 4990, cogs: 2800, logistics: 120, commissionPct: 8, returnRatePct: 5, adSpendPerUnit: 200 } },
  { label: 'Косметика',    values: { sellingPrice: 890, cogs: 200, logistics: 60, commissionPct: 15, returnRatePct: 8, adSpendPerUnit: 80 } },
  { label: 'Игрушки',      values: { sellingPrice: 1290, cogs: 350, logistics: 90, commissionPct: 12, returnRatePct: 10, adSpendPerUnit: 60 } },
];

const VERDICT_CONFIG: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  healthy:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  icon: '✅' },
  warning:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  icon: '⚠️' },
  critical: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: '🔶' },
  loss:     { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    icon: '❌' },
};

function CalcAiPanel({ advice, onClose }: { advice: CalcAiAdvice; onClose: () => void }) {
  const vcfg = VERDICT_CONFIG[advice.verdict] ?? VERDICT_CONFIG.warning;
  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${vcfg.bg} ${vcfg.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{vcfg.icon}</span>
          <div>
            <p className={`font-semibold text-base ${vcfg.text}`}>{advice.verdict_label}</p>
            <p className="text-xs text-slate-500">AI оценка юнит-экономики</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>

      <p className="text-sm text-slate-700">{advice.summary}</p>

      {advice.main_issues.length > 0 && (
        <ul className="space-y-1">
          {advice.main_issues.map((issue, i) => (
            <li key={i} className="flex gap-2 text-sm text-red-700">
              <span className="flex-shrink-0 text-red-400">●</span>{issue}
            </li>
          ))}
        </ul>
      )}

      {advice.optimizations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Как улучшить</p>
          <div className="space-y-2">
            {advice.optimizations.map((o, i) => (
              <div key={i} className="bg-white/70 rounded-lg border border-white p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-slate-800 capitalize">{o.lever}</p>
                  <span className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded font-medium">+{o.potential}</span>
                </div>
                <p className="text-xs text-slate-600">{o.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white/70 rounded-lg p-3 border border-white">
        <p className="text-xs font-semibold text-slate-500 mb-1">Ценообразование</p>
        <p className="text-sm text-slate-700">{advice.pricing_advice}</p>
      </div>

      <p className="text-xs text-slate-400">{advice.benchmark}</p>
    </div>
  );
}

export default function CalculatorPage() {
  const [form, setForm] = useState<UnitEconInput>({
    sellingPrice: 0,
    cogs: 0,
    logistics: 0,
    commissionPct: 15,
    returnRatePct: 10,
    adSpendPerUnit: 0,
    monthlyVolume: 100,
  });
  const [result, setResult] = useState<UnitEconResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiAdvice, setAiAdvice] = useState<CalcAiAdvice | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const set = useCallback((key: keyof UnitEconInput, value: number) => {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(null);
    setAiAdvice(null);
  }, []);

  async function handleCalculate() {
    if (!form.sellingPrice || form.sellingPrice <= 0) { setError('Укажите цену продажи'); return; }
    setLoading(true); setError('');
    try {
      setResult(await calculateUnitEconomics(form));
    } catch (e: any) {
      setError(e.message || 'Ошибка расчёта');
    } finally { setLoading(false); }
  }

  async function handleAiAdvice() {
    if (!result) return;
    setAiLoading(true);
    setAiAdvice(null);
    try {
      const advice = await getCalcAiAdvice({
        ...form,
        netMarginPct: result.netMarginPct,
        grossMarginPct: result.grossMarginPct,
        netProfit: result.netProfit,
        roiPct: result.roiPct,
        monthlyProfit: result.monthlyProfit,
      });
      setAiAdvice(advice);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка AI анализа');
    } finally {
      setAiLoading(false);
    }
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    setForm((f) => ({ ...f, ...preset.values }));
    setResult(null);
    setAiAdvice(null);
  }

  const marginColor = result
    ? result.netMarginPct >= 20 ? 'bg-green-500'
    : result.netMarginPct >= 10 ? 'bg-amber-500'
    : result.netMarginPct >= 0  ? 'bg-orange-500'
    : 'bg-red-500'
    : 'bg-slate-200';

  const marginTextColor = result
    ? result.netMarginPct >= 20 ? 'green'
    : result.netMarginPct >= 10 ? 'amber'
    : result.netMarginPct >= 0  ? 'amber'
    : 'red'
    : 'slate';

  return (
    <div className="space-y-6 pb-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Юнит-экономика</h1>
        <p className="text-slate-500 text-sm mt-0.5">Рассчитайте реальную прибыль с каждого товара с учётом всех расходов</p>
      </div>

      {/* Presets */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Быстрые пресеты</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:border-purple-300 hover:bg-purple-50 text-slate-700 rounded-lg transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input panel */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-900">Доходы</p>
            <NumberInput label="Цена продажи (покупатель платит)" value={form.sellingPrice} onChange={(v) => set('sellingPrice', v)} hint="Финальная цена в карточке товара" />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-900">Расходы</p>
            <NumberInput label="Себестоимость (COGS)" value={form.cogs} onChange={(v) => set('cogs', v)} hint="Закупочная цена + упаковка" />
            <NumberInput label="Логистика (доставка на склад)" value={form.logistics} onChange={(v) => set('logistics', v)} hint="Стоимость доставки на FBO/FBS" />
            <NumberInput label="Комиссия маркетплейса" value={form.commissionPct} onChange={(v) => set('commissionPct', v)} suffix="%" min={0} max={100}>
            </NumberInput>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PLATFORM_COMMISSIONS).map(([p, c]) => (
                <button
                  key={p}
                  onClick={() => set('commissionPct', c)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${form.commissionPct === c ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                >
                  {p.toUpperCase()} {c}%
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-900">Дополнительные расходы</p>
            <NumberInput label="Процент возвратов" value={form.returnRatePct} onChange={(v) => set('returnRatePct', v)} suffix="%" min={0} max={100} hint="Типично: одежда 30–40%, электроника 5–10%" />
            <NumberInput label="Реклама на единицу (CPO)" value={form.adSpendPerUnit} onChange={(v) => set('adSpendPerUnit', v)} hint="Рекламные расходы ÷ кол-во заказов" />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-900">Прогноз (необязательно)</p>
            <NumberInput label="Ожидаемые продажи в месяц" value={form.monthlyVolume ?? 0} onChange={(v) => set('monthlyVolume', v)} suffix="шт." hint="Для расчёта ежемесячной и годовой прибыли" />
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {loading ? 'Считаем...' : 'Рассчитать'}
          </button>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        </div>

        {/* Results panel */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Main metric */}
              <div className={`rounded-2xl p-5 text-center ${result.netProfit >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
                <p className="text-white/80 text-sm font-medium mb-1">Прибыль с единицы</p>
                <p className="text-white text-4xl font-bold">{result.netProfit >= 0 ? '+' : ''}{result.netProfit.toLocaleString('ru-RU')} ₽</p>
                <p className="text-white/70 text-sm mt-1">
                  Маржа: {result.netMarginPct >= 0 ? '+' : ''}{result.netMarginPct}%  ·  ROI: {result.roiPct >= 0 ? '+' : ''}{result.roiPct}%
                </p>
                {result.monthlyProfit != null && (
                  <p className="text-white/80 text-sm mt-2 font-medium">
                    ~{result.monthlyProfit.toLocaleString('ru-RU')} ₽/мес  ·  ~{result.annualProfit?.toLocaleString('ru-RU')} ₽/год
                  </p>
                )}
              </div>

              {/* Margin gauge */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-900">Чистая маржинальность</p>
                  <span className={`text-sm font-bold ${result.netMarginPct >= 15 ? 'text-green-600' : result.netMarginPct >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                    {result.netMarginPct}%
                  </span>
                </div>
                <GaugeBar pct={result.netMarginPct} color={marginColor} />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>0% (убыток)</span>
                  <span className="text-green-600">20%+ (отлично)</span>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-sm font-semibold text-slate-900 mb-3">Разбивка расходов</p>
                <MetricRow label="Цена продажи" value={`${form.sellingPrice.toLocaleString('ru-RU')} ₽`} />
                <MetricRow label="Комиссия маркетплейса" value={`−${result.marketplaceFee.toLocaleString('ru-RU')} ₽`} color="red" />
                <MetricRow label="Себестоимость" value={`−${form.cogs.toLocaleString('ru-RU')} ₽`} color="red" />
                <MetricRow label="Логистика" value={`−${form.logistics.toLocaleString('ru-RU')} ₽`} color="red" />
                <MetricRow label="Возвраты (расчётно)" value={`−${result.returnCost.toLocaleString('ru-RU')} ₽`} color="red" />
                <MetricRow label="Реклама (CPO)" value={`−${result.adSpend.toLocaleString('ru-RU')} ₽`} color="red" />
                <MetricRow label="Итого расходов" value={`${result.totalCosts.toLocaleString('ru-RU')} ₽`} color="slate" highlight />
                <MetricRow label="Валовая прибыль" value={`${result.grossProfit >= 0 ? '+' : ''}${result.grossProfit.toLocaleString('ru-RU')} ₽`} color={result.grossProfit >= 0 ? 'green' : 'red'} />
                <MetricRow label="Чистая прибыль" value={`${result.netProfit >= 0 ? '+' : ''}${result.netProfit.toLocaleString('ru-RU')} ₽`} color={result.netProfit >= 0 ? 'green' : 'red'} highlight />
              </div>

              {/* Insight */}
              <div className={`rounded-xl p-4 text-sm ${result.netMarginPct >= 15 ? 'bg-green-50 border border-green-200 text-green-800' : result.netMarginPct >= 5 ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                {result.netMarginPct >= 20 && '✅ Отличная экономика. Товар прибыльный и устойчивый.'}
                {result.netMarginPct >= 10 && result.netMarginPct < 20 && '⚠️ Приемлемая маржа, но попробуйте снизить логистику или рекламные расходы для роста до 20%+.'}
                {result.netMarginPct >= 0 && result.netMarginPct < 10 && '⚠️ Маржа низкая — товар чувствителен к любым изменениям. Оптимизируйте закупочную цену и рекламу.'}
                {result.netMarginPct < 0 && '❌ Товар убыточен. Нужно повысить цену продажи, снизить себестоимость или уменьшить расходы.'}
              </div>

              {/* AI Advice button */}
              {!aiAdvice && (
                <button
                  onClick={handleAiAdvice}
                  disabled={aiLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {aiLoading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : <span>🤖</span>}
                  {aiLoading ? 'Анализ экономики...' : 'AI оценка — что улучшить?'}
                </button>
              )}

              {aiAdvice && (
                <CalcAiPanel advice={aiAdvice} onClose={() => setAiAdvice(null)} />
              )}

              <Link href="/niche" className="flex items-center justify-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-700 hover:bg-purple-100 transition-colors">
                <span>🔍</span>
                <span>Исследовать нишу для этого товара →</span>
              </Link>
            </>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">🧮</div>
              <p className="font-semibold text-slate-700 mb-1">Введите параметры товара</p>
              <p className="text-sm text-slate-400">Результат появится здесь после расчёта</p>
            </div>
          )}
        </div>
      </div>

      {/* Break-even + sensitivity — shown as soon as price is entered */}
      {form.sellingPrice > 0 && (
        <div className="space-y-4">
          <BreakEvenChart form={form} />
          <SensitivityTable form={form} />
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useMemo } from 'react';
import { getPnl, getAbcAnalysis, getPnlCsvUrl, addToWatchlist, getGoalProgress, getFinanceGoalsList, upsertFinanceGoal, getPnlAiDiagnostic, type PnlSkuRow, type PnlSummary, type AbcItem, type AbcResult, type FinanceGoal, type GoalProgress, type PnlAiDiagnostic, type PnlAiSkuAdvice } from '@/lib/api';

const PERIODS = [
  { value: '30d', label: '30 дней' },
  { value: '60d', label: '60 дней' },
  { value: '90d', label: '90 дней' },
];

const PLATFORMS = [
  { value: '', label: 'Все площадки' },
  { value: 'wb', label: 'WB' },
  { value: 'ozon', label: 'Ozon' },
  { value: 'ym', label: 'Я.Маркет' },
  { value: 'mm', label: 'Мегамаркет' },
];

type SortKey = 'revenue' | 'net_payout' | 'ad_spend' | 'net_profit' | 'margin_pct' | 'drr_pct' | 'quantity';
type SortDir = 'asc' | 'desc';

function fmt(n: number | null, suffix = ' ₽') {
  if (n == null) return '—';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + suffix;
}
function fmtPct(n: number | null) {
  if (n == null) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── ABC Analysis Tab ────────────────────────────────────────────────────────

const ABC_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-slate-100 text-slate-500 border-slate-200',
};

const ABC_TIPS: Record<string, string> = {
  A: 'Фокус на поддержание запаса и рекламы. Эти товары генерируют 80% выручки.',
  B: 'Умеренные инвестиции. Оцените потенциал перевода в класс A.',
  C: 'Минимальные расходы. Рассмотрите вывод из ассортимента или переоценку.',
};

function AbcTab({ period }: { period: string }) {
  const [data, setData] = useState<AbcResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState<'' | 'A' | 'B' | 'C'>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getAbcAnalysis(period as '30d' | '60d' | '90d')
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, [period]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (filterClass) items = items.filter(i => i.abc_class === filterClass);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i => i.sku.toLowerCase().includes(q) || (i.title ?? '').toLowerCase().includes(q));
    }
    return items;
  }, [data, filterClass, search]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data || !data.items.length) return (
    <div className="bg-white rounded-xl border py-16 text-center text-slate-400">
      Нет финансовых данных для ABC-анализа за выбранный период
    </div>
  );

  const { summary } = data;
  const aRev = data.items.filter(i => i.abc_class === 'A').reduce((s, i) => s + i.revenue, 0);
  const bRev = data.items.filter(i => i.abc_class === 'B').reduce((s, i) => s + i.revenue, 0);
  const cRev = data.items.filter(i => i.abc_class === 'C').reduce((s, i) => s + i.revenue, 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map(cls => {
          const count = cls === 'A' ? summary.a : cls === 'B' ? summary.b : summary.c;
          const rev = cls === 'A' ? aRev : cls === 'B' ? bRev : cRev;
          const revPct = summary.total_revenue > 0 ? Math.round(rev / summary.total_revenue * 100) : 0;
          return (
            <div key={cls} className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
              filterClass === cls ? 'ring-2 ring-purple-500' : 'hover:shadow-sm'
            }`} onClick={() => setFilterClass(c => c === cls ? '' : cls)}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ABC_COLORS[cls]}`}>Класс {cls}</span>
                <span className="text-2xl font-bold text-slate-900">{count}</span>
              </div>
              <p className="text-xs font-medium text-slate-700">{revPct}% выручки</p>
              <p className="text-xs text-slate-400">{fmt(rev)}</p>
              <div className="mt-2 bg-slate-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${revPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Class tip */}
      {filterClass && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${ABC_COLORS[filterClass]}`}>
          <span className="font-semibold">Класс {filterClass}:</span> {ABC_TIPS[filterClass]}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по SKU или названию..."
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Товар</th>
                <th className="px-3 py-3 text-center font-medium">Класс</th>
                <th className="px-3 py-3 text-right font-medium">Выручка</th>
                <th className="px-3 py-3 text-right font-medium">Доля</th>
                <th className="px-3 py-3 text-right font-medium">Нарастающий</th>
                <th className="px-3 py-3 text-right font-medium">Кол-во</th>
                <th className="px-3 py-3 text-right font-medium">Маржа</th>
                <th className="px-3 py-3 text-right font-medium">ДРР</th>
                <th className="px-3 py-3 text-right font-medium">Рейтинг</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={`${item.platform}-${item.sku}`}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.platform === 'wb' ? 'bg-purple-100 text-purple-700' :
                        item.platform === 'ozon' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{item.platform}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 leading-tight truncate max-w-xs">{item.title || item.sku}</p>
                        <p className="text-xs text-slate-400">{item.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ABC_COLORS[item.abc_class]}`}>
                      {item.abc_class}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-slate-800">{fmt(item.revenue)}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{item.rev_share}%</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-slate-600">{item.cum_pct}%</span>
                      <div className="w-16 bg-slate-100 rounded-full h-1.5 hidden sm:block">
                        <div className={`h-1.5 rounded-full ${item.abc_class === 'A' ? 'bg-green-500' : item.abc_class === 'B' ? 'bg-blue-400' : 'bg-slate-300'}`}
                          style={{ width: `${Math.min(100, item.cum_pct)}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">{item.qty.toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-3 text-right">
                    {item.margin_pct != null
                      ? <span className={item.margin_pct > 0 ? 'text-green-600' : 'text-red-600'}>{item.margin_pct.toFixed(1)}%</span>
                      : <span className="text-slate-400 text-xs">нет цены</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {item.drr_pct > 0
                      ? <span className={item.drr_pct > 25 ? 'text-red-500' : 'text-slate-600'}>{item.drr_pct.toFixed(1)}%</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {item.avg_rating != null
                      ? <span className="text-yellow-500">{'★'.repeat(Math.round(item.avg_rating))}{item.avg_rating.toFixed(1)}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
          {filtered.length} из {data.items.length} товаров
        </div>
      </div>
    </div>
  );
}

// ─── Goals Tab ────────────────────────────────────────────────────────────────

function progressColor(pct: number) {
  if (pct >= 100) return { bar: 'bg-green-500', text: 'text-green-600' };
  if (pct >= 70)  return { bar: 'bg-amber-400', text: 'text-amber-600' };
  return { bar: 'bg-red-400', text: 'text-red-500' };
}

function ProgressBar({ value, goal, label, suffix = ' ₽', note }: {
  value: number; goal: number | null; label: string; suffix?: string; note?: string;
}) {
  if (!goal) return null;
  const pct = Math.min(200, Math.round((value / goal) * 100));
  const { bar, text } = progressColor(pct);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 font-medium">{label}</span>
        <span className={`font-bold ${text}`}>{pct}%</span>
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{Math.round(value).toLocaleString('ru-RU')}{suffix} факт</span>
        <span>цель: {Math.round(goal).toLocaleString('ru-RU')}{suffix}</span>
      </div>
      {note && <p className="text-xs text-slate-400">{note}</p>}
    </div>
  );
}

function GoalsTab() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ revenue_goal: '', payout_goal: '', profit_goal: '', ad_spend_goal: '', drr_goal: '' });
  const [history, setHistory] = useState<FinanceGoal[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(m: string) {
    setLoading(true);
    try {
      const [prog, hist] = await Promise.all([getGoalProgress(m), getFinanceGoalsList()]);
      setProgress(prog);
      setHistory(hist.goals);
      if (prog.goal) {
        setForm({
          revenue_goal:  prog.goal.revenue_goal  != null ? String(prog.goal.revenue_goal)  : '',
          payout_goal:   prog.goal.payout_goal   != null ? String(prog.goal.payout_goal)   : '',
          profit_goal:   prog.goal.profit_goal   != null ? String(prog.goal.profit_goal)   : '',
          ad_spend_goal: prog.goal.ad_spend_goal != null ? String(prog.goal.ad_spend_goal) : '',
          drr_goal:      prog.goal.drr_goal      != null ? String(prog.goal.drr_goal)      : '',
        });
      } else {
        setForm({ revenue_goal: '', payout_goal: '', profit_goal: '', ad_spend_goal: '', drr_goal: '' });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(month); }, [month]);

  async function handleSave() {
    setSaving(true);
    try {
      await upsertFinanceGoal(month, {
        revenue_goal:  form.revenue_goal  ? Number(form.revenue_goal)  : null,
        payout_goal:   form.payout_goal   ? Number(form.payout_goal)   : null,
        profit_goal:   form.profit_goal   ? Number(form.profit_goal)   : null,
        ad_spend_goal: form.ad_spend_goal ? Number(form.ad_spend_goal) : null,
        drr_goal:      form.drr_goal      ? Number(form.drr_goal)      : null,
      });
      setEditing(false);
      await load(month);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  const daysLeft = progress ? progress.days_in_month - progress.days_elapsed : 0;
  const pace = progress && progress.days_elapsed > 0
    ? (progress.actual.revenue / progress.days_elapsed) * progress.days_in_month
    : 0;

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-xs text-slate-500 mb-1">Месяц</p>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        <div className="mt-4">
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
            {progress?.goal ? 'Изменить цели' : '+ Установить цели'}
          </button>
        </div>
      </div>

      {loading && <div className="flex justify-center py-8"><div className="w-7 h-7 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && progress && (
        <>
          {/* Pace info */}
          {progress.days_elapsed > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-sm text-slate-600">
              <span>Прошло дней: <strong className="text-slate-800">{progress.days_elapsed}</strong> из <strong>{progress.days_in_month}</strong></span>
              {daysLeft > 0 && <span>Осталось: <strong className="text-slate-800">{daysLeft} дн.</strong></span>}
              {pace > 0 && progress.goal?.revenue_goal && (
                <span>Прогноз выручки по темпу: <strong className={pace >= progress.goal.revenue_goal ? 'text-green-600' : 'text-amber-600'}>{Math.round(pace).toLocaleString('ru-RU')} ₽</strong></span>
              )}
            </div>
          )}

          {/* Actual summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Выручка', val: progress.actual.revenue },
              { label: 'Выплата МП', val: progress.actual.payout },
              { label: 'Расходы рекл.', val: progress.actual.ad_spend },
              { label: 'ДРР', val: progress.actual.drr_pct, suffix: '%' },
            ].map(({ label, val, suffix = ' ₽' }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-lg font-bold text-slate-800">
                  {suffix === '%' ? val.toFixed(1) + '%' : Math.round(val).toLocaleString('ru-RU') + ' ₽'}
                </p>
              </div>
            ))}
          </div>

          {/* Progress bars */}
          {progress.goal ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
              <h3 className="font-semibold text-slate-800">Прогресс целей — {monthLabel(month)}</h3>
              <ProgressBar value={progress.actual.revenue}   goal={progress.goal.revenue_goal}  label="Выручка" />
              <ProgressBar value={progress.actual.payout}    goal={progress.goal.payout_goal}   label="Выплата МП" />
              <ProgressBar value={progress.actual.ad_spend}  goal={progress.goal.ad_spend_goal} label="Расходы на рекламу" />
              {progress.goal.drr_goal != null && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-medium">ДРР</span>
                    <span className={`font-bold ${progress.actual.drr_pct <= progress.goal.drr_goal ? 'text-green-600' : 'text-red-500'}`}>
                      {progress.actual.drr_pct.toFixed(1)}% / цель ≤ {progress.goal.drr_goal}%
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${progress.actual.drr_pct <= progress.goal.drr_goal ? 'bg-green-500' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, (progress.actual.drr_pct / (progress.goal.drr_goal * 2)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
              <p className="text-lg mb-2">Цели на {monthLabel(month)} не установлены</p>
              <p className="text-sm">Нажмите «Установить цели», чтобы задать плановые показатели</p>
            </div>
          )}

          {/* History table */}
          {history.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-700 text-sm">История целей</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['Месяц', 'Выручка', 'Выплата', 'Прибыль', 'Реклама', 'ДРР'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {history.map(g => (
                    <tr key={g.id} className={`hover:bg-slate-50 cursor-pointer ${g.year_month === month ? 'bg-purple-50' : ''}`}
                      onClick={() => setMonth(g.year_month)}>
                      <td className="px-4 py-2 font-medium text-slate-700">{monthLabel(g.year_month)}</td>
                      <td className="px-4 py-2 text-slate-600">{g.revenue_goal != null ? Math.round(g.revenue_goal).toLocaleString('ru-RU') + ' ₽' : '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{g.payout_goal   != null ? Math.round(g.payout_goal).toLocaleString('ru-RU') + ' ₽' : '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{g.profit_goal   != null ? Math.round(g.profit_goal).toLocaleString('ru-RU') + ' ₽' : '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{g.ad_spend_goal != null ? Math.round(g.ad_spend_goal).toLocaleString('ru-RU') + ' ₽' : '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{g.drr_goal != null ? g.drr_goal + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setEditing(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Цели на {monthLabel(month)}</h2>
            <p className="text-sm text-slate-500">Оставьте поле пустым, чтобы не отслеживать этот показатель.</p>
            {[
              { key: 'revenue_goal',  label: 'Выручка (₽)',          placeholder: '1 000 000' },
              { key: 'payout_goal',   label: 'Выплата маркетплейса (₽)', placeholder: '750 000' },
              { key: 'profit_goal',   label: 'Чистая прибыль (₽)',   placeholder: '200 000' },
              { key: 'ad_spend_goal', label: 'Расходы на рекламу (₽)', placeholder: '80 000' },
              { key: 'drr_goal',      label: 'Целевой ДРР (%)',       placeholder: '8' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                <input type="number" min="0" placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
            ))}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Отмена</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Diagnostic Tab ───────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  healthy:  { label: 'Здоровый',   cls: 'bg-green-100 text-green-700',  bar: 'bg-green-500' },
  warning:  { label: 'Требует внимания', cls: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  critical: { label: 'Критично',   cls: 'bg-red-100 text-red-700',    bar: 'bg-red-500' },
  unknown:  { label: 'Нет данных', cls: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
};

const PRIORITY_CONFIG = {
  critical: { cls: 'bg-red-100 text-red-700',    label: 'Критично' },
  high:     { cls: 'bg-orange-100 text-orange-700', label: 'Высокий' },
  medium:   { cls: 'bg-yellow-100 text-yellow-700', label: 'Средний' },
};

function DiagnosticTab({ period }: { period: string }) {
  const [result, setResult] = useState<PnlAiDiagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setLoading(true);
    setError('');
    try { setResult(await getPnlAiDiagnostic(period)); }
    catch (e: any) { setError(e.message ?? 'Ошибка'); }
    finally { setLoading(false); }
  }

  if (!result && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center text-3xl">🔬</div>
        <div>
          <p className="font-semibold text-slate-800">AI диагностика P&L</p>
          <p className="text-sm text-slate-500 mt-1">
            Выявим убыточные SKU, диагностируем причины и дадим конкретные советы по каждому
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={run}
          className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Запустить диагностику
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Анализируем рентабельность...</p>
      </div>
    );
  }

  if (!result) return null;

  const health = HEALTH_CONFIG[result.health] ?? HEALTH_CONFIG.unknown;
  const total = result.counts.losing + result.counts.low_margin + result.counts.unknown + result.counts.profitable;

  return (
    <div className="space-y-5">
      {/* Health banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-slate-900">Финансовое здоровье портфеля</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${health.cls}`}>{health.label}</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{result.summary}</p>
          </div>
          <button
            onClick={run}
            className="text-xs text-slate-400 hover:text-rose-600 transition-colors flex-shrink-0 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Обновить
          </button>
        </div>
        {/* Counts strip */}
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Прибыльных', value: result.counts.profitable, color: 'text-green-600' },
            { label: 'Убыточных',  value: result.counts.losing,     color: 'text-red-600' },
            { label: 'Низкомарж.', value: result.counts.low_margin, color: 'text-amber-600' },
            { label: 'Без себест.',value: result.counts.unknown,    color: 'text-slate-500' },
          ].map(c => (
            <div key={c.label} className="bg-slate-50 rounded-xl py-2">
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {result.key_issues.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">Ключевые проблемы</p>
          <ul className="space-y-1">
            {result.key_issues.map((issue, i) => (
              <li key={i} className="text-sm text-red-800 flex gap-2"><span className="flex-shrink-0 text-red-400">•</span>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {result.sku_advice.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Диагноз по SKU</p>
          {result.sku_advice.map((a: PnlAiSkuAdvice, i: number) => {
            const prio = PRIORITY_CONFIG[a.priority] ?? PRIORITY_CONFIG.medium;
            return (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${prio.cls}`}>{prio.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 font-mono">{a.sku}</p>
                  <p className="text-sm font-medium text-slate-800 mt-0.5">{a.title}</p>
                  <p className="text-sm text-slate-500 mt-1">🔍 {a.diagnosis}</p>
                  <p className="text-sm text-slate-700 mt-1 font-medium">→ {a.action}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {result.overall_actions.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-2">Системные действия</p>
          <ol className="space-y-1">
            {result.overall_actions.map((a, i) => (
              <li key={i} className="text-sm text-indigo-800 flex gap-2"><span className="font-semibold flex-shrink-0">{i + 1}.</span>{a}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PnlPage() {
  const [tab, setTab] = useState<'pnl' | 'abc' | 'goals' | 'ai'>('pnl');
  const [period, setPeriod] = useState('30d');
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PnlSkuRow[]>([]);
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'profitable' | 'losing' | 'unknown'>('all');

  useEffect(() => {
    if (tab !== 'pnl') return;
    setLoading(true);
    getPnl(period, platform || undefined)
      .then(({ rows: r, summary: s }) => { setRows(r); setSummary(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, platform, tab]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = useMemo(() => {
    let list = [...rows];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => (r.title || r.sku).toLowerCase().includes(q) || r.sku.toLowerCase().includes(q));
    }
    if (filter === 'profitable') list = list.filter(r => r.net_profit != null && r.net_profit > 0);
    if (filter === 'losing')     list = list.filter(r => r.net_profit != null && r.net_profit <= 0);
    if (filter === 'unknown')    list = list.filter(r => r.net_profit == null);
    list.sort((a, b) => {
      const av = (a[sortKey] as number | null) ?? -Infinity;
      const bv = (b[sortKey] as number | null) ?? -Infinity;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return list;
  }, [rows, sortKey, sortDir, search, filter]);

  function SortBtn({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const active = sortKey === k;
    return (
      <button onClick={() => toggleSort(k)}
        className={`flex items-center gap-1 whitespace-nowrap ${active ? 'text-purple-600' : 'text-slate-500 hover:text-slate-700'}`}>
        {children}
        <span className="text-[10px]">{active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}</span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">P&L по товарам</h1>
          <p className="text-sm text-slate-500 mt-0.5">Реальная прибыль и ABC-анализ по каждому SKU</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500">
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {tab === 'pnl' && (
            <select value={platform} onChange={e => setPlatform(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500">
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          )}
          {tab === 'pnl' && (
            <a
              href={getPnlCsvUrl(period, platform || undefined)}
              download={`pnl_${period}.csv`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
              title="Скачать как CSV"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              CSV
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([['pnl', 'P&L'], ['abc', 'ABC-анализ'], ['goals', '🎯 Цели'], ['ai', '🔬 AI Диагностика']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>{l}</button>
        ))}
      </div>

      {tab === 'abc' && <AbcTab period={period} />}
      {tab === 'goals' && <GoalsTab />}
      {tab === 'ai' && <DiagnosticTab period={period} />}

      {tab === 'pnl' && (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryCard label="Выручка" value={fmt(summary.revenue)} />
              <SummaryCard label="Выплата МП" value={fmt(summary.net_payout)} />
              <SummaryCard label="Реклама" value={fmt(summary.ad_spend)}
                sub={summary.drr_pct > 0 ? `ДРР ${summary.drr_pct.toFixed(1)}%` : undefined} />
              <SummaryCard label="Себестоимость" value={fmt(summary.cost_of_goods)} />
              <SummaryCard label="Чистая прибыль"
                value={fmt(summary.net_profit)}
                color={summary.net_profit > 0 ? 'text-green-600' : 'text-red-600'} />
              <SummaryCard label="Маржа"
                value={fmtPct(summary.margin_pct)}
                color={summary.margin_pct > 0 ? 'text-green-600' : 'text-red-600'}
                sub={`${summary.profitable_skus} прибыльных, ${summary.losing_skus} убыточных`} />
            </div>
          )}

          {summary && summary.unknown_skus > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <span className="text-lg leading-none">⚠️</span>
              <span>
                <strong>{summary.unknown_skus} товаров</strong> без себестоимости — добавьте закупочные цены
                в <a href="/products" className="underline">каталоге товаров</a>, чтобы видеть чистую прибыль.
              </span>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 border-b border-slate-100">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по названию или SKU..."
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <div className="flex gap-1">
                {(['all', 'profitable', 'losing', 'unknown'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      filter === f ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {f === 'all' ? 'Все' : f === 'profitable' ? '✅ Прибыльные' : f === 'losing' ? '🔴 Убыточные' : '❓ Без цены'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-7 h-7 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">
                {rows.length === 0
                  ? 'Нет финансовых данных за выбранный период. Синхронизируйте данные из маркетплейса.'
                  : 'Нет товаров по выбранным фильтрам'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Товар</th>
                      <th className="px-3 py-3 text-right font-medium"><SortBtn k="quantity">Кол-во</SortBtn></th>
                      <th className="px-3 py-3 text-right font-medium"><SortBtn k="revenue">Выручка</SortBtn></th>
                      <th className="px-3 py-3 text-right font-medium text-slate-600">Комис.</th>
                      <th className="px-3 py-3 text-right font-medium text-slate-600">Логист.</th>
                      <th className="px-3 py-3 text-right font-medium"><SortBtn k="ad_spend">Реклама</SortBtn></th>
                      <th className="px-3 py-3 text-right font-medium"><SortBtn k="net_profit">Прибыль</SortBtn></th>
                      <th className="px-3 py-3 text-right font-medium"><SortBtn k="margin_pct">Маржа</SortBtn></th>
                      <th className="px-3 py-3 text-right font-medium"><SortBtn k="drr_pct">ДРР</SortBtn></th>
                      <th className="px-3 py-3 text-center font-medium text-slate-400 w-8">⭐</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, i) => {
                      const isLosing = row.net_profit != null && row.net_profit <= 0;
                      const isUnknown = row.net_profit == null;
                      return (
                        <tr key={`${row.platform}-${row.sku}-${i}`}
                          className={`border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors ${isLosing ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                row.platform === 'wb' ? 'bg-purple-100 text-purple-700' :
                                row.platform === 'ozon' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>{row.platform}</span>
                              <div>
                                <p className="font-medium text-slate-800 leading-tight line-clamp-1">{row.title || row.sku}</p>
                                <p className="text-xs text-slate-400">{row.sku}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right text-slate-700">{row.quantity.toLocaleString('ru-RU')}</td>
                          <td className="px-3 py-3 text-right font-medium text-slate-800">{fmt(row.revenue)}</td>
                          <td className="px-3 py-3 text-right text-red-500">{fmt(-row.commission)}</td>
                          <td className="px-3 py-3 text-right text-red-500">{fmt(-row.logistics)}</td>
                          <td className="px-3 py-3 text-right text-orange-500">
                            {row.ad_spend > 0 ? fmt(-row.ad_spend) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold">
                            {isUnknown
                              ? <span className="text-slate-400 text-xs">без цены</span>
                              : <span className={row.net_profit! > 0 ? 'text-green-600' : 'text-red-600'}>{fmt(row.net_profit)}</span>
                            }
                          </td>
                          <td className="px-3 py-3 text-right">
                            {isUnknown ? <span className="text-slate-400">—</span> :
                              <span className={row.margin_pct! > 0 ? 'text-green-600' : 'text-red-600'}>{fmtPct(row.margin_pct)}</span>
                            }
                          </td>
                          <td className="px-3 py-3 text-right">
                            {row.drr_pct > 0
                              ? <span className={row.drr_pct > 25 ? 'text-red-500' : 'text-slate-600'}>{row.drr_pct.toFixed(1)}%</span>
                              : <span className="text-slate-400">—</span>
                            }
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={async () => {
                                const key = `${row.platform}:${row.sku}`;
                                if (pinned.has(key)) return;
                                await addToWatchlist(row.sku, row.platform, row.title || undefined).catch(() => {});
                                setPinned(prev => { const s = new Set<string>(); prev.forEach(v => s.add(v)); s.add(key); return s; });
                              }}
                              title={pinned.has(`${row.platform}:${row.sku}`) ? 'В списке наблюдения' : 'Добавить в наблюдение'}
                              className={`p-1 rounded transition-colors ${pinned.has(`${row.platform}:${row.sku}`) ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}
                            >
                              <svg className="w-4 h-4" fill={pinned.has(`${row.platform}:${row.sku}`) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {sorted.length > 0 && (
              <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                {sorted.length} из {rows.length} товаров
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

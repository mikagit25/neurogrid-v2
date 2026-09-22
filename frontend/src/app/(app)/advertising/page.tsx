'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiRequest, analyzeAdCampaigns, type AdOptimizeResult, type AdSuggestion } from '@/lib/api';

interface Campaign {
  id: string;
  platform: string;
  external_id: string;
  name: string;
  campaign_type: string | null;
  status: string;
  budget: number | null;
  daily_budget: number | null;
  bid: number | null;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  revenue: number;
  ctr: number | null;
  drr: number | null;
  synced_at: string;
  connection_name: string;
}

interface Stats {
  total_campaigns: number;
  running: number;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_orders: number;
  total_revenue: number;
  avg_drr: number;
}

interface DaypartingData {
  schedule: boolean[][];
  is_active: boolean;
}

interface BidderRule {
  is_active: boolean;
  mode: string;
  max_drr_pct: number;
  max_bid: number | null;
  min_bid: number | null;
  last_action: string | null;
  last_action_at: string | null;
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmt(n: number | null | undefined, suf = ' ₽') {
  if (n == null) return '—';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + suf;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running: 'bg-green-100 text-green-700',
    paused:  'bg-yellow-100 text-yellow-700',
    stopped: 'bg-slate-100 text-slate-500',
    ready:   'bg-blue-100 text-blue-700',
    archived:'bg-slate-100 text-slate-400',
    unknown: 'bg-slate-100 text-slate-400',
  };
  const labels: Record<string, string> = {
    running: 'Активна', paused: 'Пауза', stopped: 'Остановлена', ready: 'Готова', archived: 'Архив', unknown: '—',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? map.unknown}`}>{labels[status] ?? status}</span>;
}

export default function AdvertisingPage() {
  const [tab, setTab] = useState<'campaigns' | 'dayparting' | 'bidder' | 'ai'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hasAdCreds, setHasAdCreds] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Dayparting state
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [dayparting, setDayparting] = useState<DaypartingData | null>(null);
  const [savingDp, setSavingDp] = useState(false);

  // Bidder state
  const [bidderCampaign, setBidderCampaign] = useState<Campaign | null>(null);
  const [bidderRule, setBidderRule] = useState<BidderRule | null>(null);
  const [savingBidder, setSavingBidder] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        apiRequest('/api/advertising/campaigns'),
        apiRequest('/api/advertising/stats'),
      ]);
      setCampaigns(c.campaigns ?? []);
      setHasAdCreds(c.has_ad_credentials ?? false);
      setStats(s);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    try {
      await apiRequest('/api/advertising/campaigns/sync', { method: 'POST' });
      await load();
    } catch (e: any) { alert(e.message); }
    setSyncing(false);
  }

  async function toggleStatus(c: Campaign) {
    const newStatus = c.status === 'running' ? 'paused' : 'running';
    await apiRequest(`/api/advertising/campaigns/${c.id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: newStatus }),
    });
    setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x));
  }

  async function loadDayparting(campaign: Campaign) {
    setSelectedCampaign(campaign);
    const data = await apiRequest(`/api/advertising/dayparting/${campaign.id}`);
    // Ensure 7×24 boolean array
    const sched: boolean[][] = Array(7).fill(null).map((_, d) =>
      Array(24).fill(null).map((_, h) => data.schedule?.[d]?.[h] ?? true)
    );
    setDayparting({ schedule: sched, is_active: data.is_active ?? false });
  }

  async function saveDayparting() {
    if (!selectedCampaign || !dayparting) return;
    setSavingDp(true);
    try {
      await apiRequest(`/api/advertising/dayparting/${selectedCampaign.id}`, {
        method: 'PUT',
        body: JSON.stringify({ schedule: dayparting.schedule, is_active: dayparting.is_active }),
      });
    } catch (e: any) { alert(e.message); }
    setSavingDp(false);
  }

  function toggleCell(day: number, hour: number) {
    if (!dayparting) return;
    setDayparting(prev => {
      if (!prev) return prev;
      const s = prev.schedule.map(row => [...row]);
      s[day][hour] = !s[day][hour];
      return { ...prev, schedule: s };
    });
  }

  async function loadBidder(campaign: Campaign) {
    setBidderCampaign(campaign);
    const data = await apiRequest(`/api/advertising/bidder/${campaign.id}`);
    setBidderRule(data);
  }

  async function saveBidder() {
    if (!bidderCampaign || !bidderRule) return;
    setSavingBidder(true);
    try {
      await apiRequest(`/api/advertising/bidder/${bidderCampaign.id}`, {
        method: 'PUT', body: JSON.stringify(bidderRule),
      });
    } catch (e: any) { alert(e.message); }
    setSavingBidder(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Управление рекламой</h1>
          <p className="text-sm text-slate-500 mt-0.5">Единый центр кампаний WB и Ozon</p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
          <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? 'Синхронизация...' : 'Синхронизировать'}
        </button>
      </div>

      {/* Stats row */}
      {stats && campaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Активных кампаний', value: `${stats.running} / ${stats.total_campaigns}` },
            { label: 'Расход', value: fmt(Number(stats.total_spend)) },
            { label: 'Выручка с рекламы', value: fmt(Number(stats.total_revenue)) },
            { label: 'Средний ДРР', value: `${Number(stats.avg_drr).toFixed(1)}%`, color: Number(stats.avg_drr) > 30 ? 'text-red-600' : 'text-green-600' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">{c.label}</p>
              <p className={`text-xl font-bold ${c.color ?? 'text-slate-900'}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* No credentials notice */}
      {!hasAdCreds && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-800">
          <span className="text-lg">⚠️</span>
          <div>
            <p className="font-medium">Нет API ключей рекламы</p>
            <p className="mt-0.5">Для WB добавьте <strong>Advert API key</strong> в настройках подключения. Для Ozon — <strong>Performance Client ID + Secret</strong>. После этого нажмите «Синхронизировать».</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {([
          { v: 'campaigns',  l: 'Кампании' },
          { v: 'dayparting', l: '⏰ Dayparting' },
          { v: 'bidder',     l: '🤖 AI-биддер' },
          { v: 'ai',         l: '✨ AI-оптимизация' },
        ] as { v: 'campaigns' | 'dayparting' | 'bidder' | 'ai'; l: string }[]).map(({ v, l }) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'campaigns' ? (
        /* ---- CAMPAIGNS ---- */
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          {campaigns.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">📢</div>
              <p className="text-slate-500 text-sm">Нет кампаний. Нажмите «Синхронизировать» чтобы загрузить из WB/Ozon.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="text-left px-4 py-3">Кампания</th>
                    <th className="px-3 py-3 text-center">Статус</th>
                    <th className="px-3 py-3 text-right">Расход</th>
                    <th className="px-3 py-3 text-right">Показы</th>
                    <th className="px-3 py-3 text-right">Клики</th>
                    <th className="px-3 py-3 text-right">CTR</th>
                    <th className="px-3 py-3 text-right">Заказы</th>
                    <th className="px-3 py-3 text-right">ДРР</th>
                    <th className="px-3 py-3 text-right">Ставка</th>
                    <th className="px-3 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => {
                    const drr = c.drr ? c.drr * 100 : null;
                    const ctr = c.ctr ? c.ctr * 100 : null;
                    return (
                      <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              c.platform === 'wb' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>{c.platform}</span>
                            <div>
                              <p className="font-medium text-slate-800 leading-tight max-w-[220px] truncate">{c.name}</p>
                              <p className="text-xs text-slate-400">{c.campaign_type ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">{statusBadge(c.status)}</td>
                        <td className="px-3 py-3 text-right font-medium text-slate-800">{fmt(c.spend)}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{c.impressions.toLocaleString('ru-RU')}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{c.clicks.toLocaleString('ru-RU')}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{ctr != null ? ctr.toFixed(2) + '%' : '—'}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{c.orders}</td>
                        <td className="px-3 py-3 text-right">
                          {drr != null ? (
                            <span className={drr > 30 ? 'text-red-600 font-medium' : 'text-slate-600'}>{drr.toFixed(1)}%</span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">{c.bid ? `${c.bid} ₽` : '—'}</td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Toggle running/paused */}
                            <button onClick={() => toggleStatus(c)}
                              title={c.status === 'running' ? 'Поставить на паузу' : 'Запустить'}
                              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700">
                              {c.status === 'running'
                                ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                              }
                            </button>
                            <button onClick={() => { setTab('dayparting'); loadDayparting(c); }}
                              title="Dayparting" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700 text-xs">⏰</button>
                            <button onClick={() => { setTab('bidder'); loadBidder(c); }}
                              title="AI-биддер" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700 text-xs">🤖</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'dayparting' ? (
        /* ---- DAYPARTING ---- */
        <div className="space-y-4">
          {/* Campaign selector */}
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <label className="block text-xs font-medium text-slate-600 mb-2">Выберите кампанию</label>
            <select
              value={selectedCampaign?.id ?? ''}
              onChange={e => {
                const c = campaigns.find(x => x.id === e.target.value);
                if (c) loadDayparting(c);
              }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-full max-w-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="">— выберите —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>[{c.platform.toUpperCase()}] {c.name}</option>
              ))}
            </select>
          </div>

          {selectedCampaign && dayparting && (
            <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Расписание показов: {selectedCampaign.name}</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-slate-600">Активно</span>
                  <button onClick={() => setDayparting(p => p ? { ...p, is_active: !p.is_active } : p)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${dayparting.is_active ? 'bg-purple-600' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${dayparting.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </label>
              </div>

              <p className="text-xs text-slate-500">Нажмите на клетку чтобы включить/выключить показ рекламы в этот час. Зелёный = реклама показывается. Время московское (UTC+3).</p>

              {/* Hours header */}
              <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                  <div className="flex">
                    <div className="w-10 shrink-0" />
                    {HOURS.map(h => (
                      <div key={h} className="flex-1 text-center text-[10px] text-slate-400 pb-1">{h}</div>
                    ))}
                  </div>
                  {DAYS.map((day, di) => (
                    <div key={di} className="flex items-center mb-0.5">
                      <div className="w-10 shrink-0 text-xs text-slate-500 font-medium">{day}</div>
                      {HOURS.map(h => (
                        <button key={h} onClick={() => toggleCell(di, h)}
                          className={`flex-1 h-7 mx-px rounded transition-colors ${
                            dayparting.schedule[di][h]
                              ? 'bg-green-400 hover:bg-green-500'
                              : 'bg-slate-100 hover:bg-slate-200'
                          }`} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 items-center">
                <div className="flex gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded inline-block" /> Показывать</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-100 rounded inline-block border border-slate-200" /> Пауза</span>
                </div>
                <button onClick={() => setDayparting(p => p ? { ...p, schedule: Array(7).fill(null).map(() => Array(24).fill(true)) } : p)}
                  className="text-xs text-purple-600 hover:text-purple-700">Включить все</button>
                <button onClick={saveDayparting} disabled={savingDp}
                  className="ml-auto px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {savingDp ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          )}

          {campaigns.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-100 py-12 text-center text-sm text-slate-500">
              Сначала синхронизируйте кампании на вкладке «Кампании»
            </div>
          )}
        </div>
      ) : (
        /* ---- AI BIDDER ---- */
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <label className="block text-xs font-medium text-slate-600 mb-2">Выберите кампанию</label>
            <select
              value={bidderCampaign?.id ?? ''}
              onChange={e => {
                const c = campaigns.find(x => x.id === e.target.value);
                if (c) loadBidder(c);
              }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-full max-w-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="">— выберите —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>[{c.platform.toUpperCase()}] {c.name}</option>
              ))}
            </select>
          </div>

          {bidderCampaign && bidderRule && (
            <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">AI-биддер: {bidderCampaign.name}</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-slate-600">Активен</span>
                  <button onClick={() => setBidderRule(p => p ? { ...p, is_active: !p.is_active } : p)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bidderRule.is_active ? 'bg-purple-600' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bidderRule.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </label>
              </div>

              {/* Mode */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Стратегия</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: 'aggressive_growth', label: 'Агрессивный рост', desc: 'Поднимает ставку когда ДРР ниже лимита. Максимальные позиции.' },
                    { value: 'hold_position',     label: 'Удержание позиции', desc: 'Корректирует ставку для сохранения текущего места в выдаче.' },
                    { value: 'min_spend',         label: 'Минимум расходов', desc: 'Снижает ставку при превышении ДРР. Экономия бюджета.' },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => setBidderRule(p => p ? { ...p, mode: opt.value } : p)}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${
                        bidderRule.mode === opt.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-slate-200 hover:border-purple-300'
                      }`}>
                      <p className="font-medium text-slate-800 text-sm">{opt.label}</p>
                      <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Thresholds */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Макс. ДРР (%)</label>
                  <input type="number" value={bidderRule.max_drr_pct}
                    onChange={e => setBidderRule(p => p ? { ...p, max_drr_pct: Number(e.target.value) } : p)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  <p className="text-xs text-slate-400 mt-1">При превышении снизит ставку</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Мин. ставка (₽)</label>
                  <input type="number" value={bidderRule.min_bid ?? ''}
                    onChange={e => setBidderRule(p => p ? { ...p, min_bid: e.target.value ? Number(e.target.value) : null } : p)}
                    placeholder="Не ограничена"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Макс. ставка (₽)</label>
                  <input type="number" value={bidderRule.max_bid ?? ''}
                    onChange={e => setBidderRule(p => p ? { ...p, max_bid: e.target.value ? Number(e.target.value) : null } : p)}
                    placeholder="Не ограничена"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>

              {/* Last action */}
              {bidderRule.last_action && (
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                  <span className="font-medium">Последнее действие:</span> {bidderRule.last_action}
                  {bidderRule.last_action_at && (
                    <span className="text-slate-400 ml-2">{new Date(bidderRule.last_action_at).toLocaleString('ru-RU')}</span>
                  )}
                </div>
              )}

              <button onClick={saveBidder} disabled={savingBidder}
                className="w-full sm:w-auto px-6 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {savingBidder ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
            </div>
          )}

          {campaigns.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-100 py-12 text-center text-sm text-slate-500">
              Сначала синхронизируйте кампании на вкладке «Кампании»
            </div>
          )}
        </div>
      )}

      {tab === 'ai' && <AdAiTab />}
    </div>
  );
}

// ── AI Optimizer tab (defined after main component to share types) ──────────────

const ACTION_COLORS: Record<string, string> = {
  pause:          'bg-red-100 text-red-700',
  boost:          'bg-green-100 text-green-700',
  reduce_budget:  'bg-amber-100 text-amber-700',
  change_bid:     'bg-blue-100 text-blue-700',
  add_negatives:  'bg-purple-100 text-purple-700',
  keep:           'bg-slate-100 text-slate-600',
};

const ACTION_LABELS: Record<string, string> = {
  pause:          'Остановить',
  boost:          'Увеличить бюджет',
  reduce_budget:  'Снизить бюджет',
  change_bid:     'Изменить ставку',
  add_negatives:  'Добавить минус-слова',
  keep:           'Оставить как есть',
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   'border-l-red-500',
  medium: 'border-l-amber-400',
  low:    'border-l-slate-300',
};

function AdAiTab() {
  const [result, setResult]   = useState<AdOptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [period, setPeriod]   = useState('30d');

  async function handleAnalyze() {
    setLoading(true);
    setError('');
    try {
      const r = await analyzeAdCampaigns(period);
      setResult(r);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка анализа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Control panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Период</label>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {p === '7d' ? '7 дней' : p === '30d' ? '30 дней' : '90 дней'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? (
            <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Анализируем...</>
          ) : '✨ Запустить AI-анализ'}
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>}

      {result?.message && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 text-center">{result.message}</div>
      )}

      {result && !result.message && result.analysis && (
        <div className="space-y-4">
          {/* Overall assessment */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-purple-500 uppercase tracking-wide mb-2">Общая оценка</p>
            <p className="text-slate-800 text-sm leading-relaxed">{result.analysis.overall_assessment}</p>

            {result.analysis.budget_reallocation && (
              <div className="mt-3 flex items-start gap-2 bg-white/70 rounded-lg p-3">
                <span className="text-amber-500 mt-0.5">💡</span>
                <p className="text-xs text-slate-700">{result.analysis.budget_reallocation}</p>
              </div>
            )}

            {result.analysis.quick_wins?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-purple-500 mb-2">Быстрые улучшения:</p>
                <ul className="space-y-1">
                  {result.analysis.quick_wins.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="text-green-500 mt-0.5">✓</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Campaign stats table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700">Показатели кампаний ({result.campaigns.length})</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left text-xs text-slate-500 font-medium">Кампания</th>
                  <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Расход</th>
                  <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Выручка</th>
                  <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">ROAS</th>
                  <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">CTR</th>
                  <th className="px-4 py-2.5 text-right text-xs text-slate-500 font-medium">Заказов</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {result.campaigns.map(c => {
                  const sug = result.analysis?.suggestions.find((s: AdSuggestion) => s.campaign_id === c.campaign_id || s.campaign_id === c.campaign_name);
                  return (
                    <tr key={c.campaign_id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800 truncate max-w-[180px]">{c.campaign_name}</p>
                        {sug && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mt-0.5 ${ACTION_COLORS[sug.action] ?? 'bg-slate-100 text-slate-600'}`}>
                            {ACTION_LABELS[sug.action] ?? sug.action}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{c.spend.toLocaleString('ru-RU')} ₽</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{c.revenue.toLocaleString('ru-RU')} ₽</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-semibold ${c.roas >= 3 ? 'text-green-600' : c.roas >= 1 ? 'text-amber-600' : 'text-red-600'}`}>
                          {c.roas.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{c.ctr}%</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{c.orders}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Suggestions detail */}
          {result.analysis.suggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">Рекомендации ({result.analysis.suggestions.length})</p>
              {result.analysis.suggestions
                .sort((a: AdSuggestion, b: AdSuggestion) => {
                  const ord: Record<string, number> = { high: 0, medium: 1, low: 2 };
                  return (ord[a.priority] ?? 1) - (ord[b.priority] ?? 1);
                })
                .map((s: AdSuggestion, i: number) => (
                  <div key={i} className={`bg-white rounded-xl border border-slate-200 border-l-4 p-4 ${PRIORITY_COLORS[s.priority] ?? ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[s.action] ?? 'bg-slate-100 text-slate-600'}`}>
                            {ACTION_LABELS[s.action] ?? s.action}
                          </span>
                          <span className="text-xs text-slate-400 font-medium truncate max-w-[200px]">{s.campaign_id}</span>
                        </div>
                        <p className="text-sm text-slate-700 mb-1">{s.reason}</p>
                        <p className="text-xs text-slate-400">{s.expected_impact}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${s.priority === 'high' ? 'bg-red-100 text-red-700' : s.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.priority === 'high' ? 'Срочно' : s.priority === 'medium' ? 'Важно' : 'Желательно'}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

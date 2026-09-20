import { clearToken, getToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

export { API_URL };

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Не авторизован');
  }
  return res;
}

/** apiFetch that auto-parses JSON and throws on non-ok responses */
export async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const err: any = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    try { const j = await res.json(); err.message = j.error || err.message; } catch {}
    throw err;
  }
  return res.json();
}

// ---- Types ----

export interface User {
  id: string;
  email: string;
  balance: number;
  is_admin: boolean;
}

export interface Scenario {
  id: string;
  slug: string;
  title: string;
  description: string;
  platforms: string[];
  price: number;
  is_active?: boolean;
}

export interface Run {
  id: string;
  status: 'queued' | 'running' | 'success' | 'error';
  cost?: number;
  created_at: string;
  scenario_title?: string;
  scenario_slug?: string;
  marketplace_platform?: string;
  result?: Record<string, unknown>;
  error_message?: string;
  input_data?: Record<string, unknown>;
}

export interface Connection {
  id: string;
  platform: 'wb' | 'ozon';
  status: string;
  display_name: string;
  last_verified_at?: string;
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  run_id?: string;
  provider_id?: string;
  created_at: string;
}

export interface Topup {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  text: string;
  is_read: boolean;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  balance: number;
  is_admin: boolean;
  created_at: string;
}

export interface AdminRun {
  id: string;
  status: string;
  error_message?: string;
  cost?: number;
  created_at: string;
  user_email: string;
  scenario_title: string;
}

// ---- Auth ----

export async function register(email: string, password: string): Promise<{ user: User }> {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Ошибка регистрации');
  }
  return res.json();
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Неверный email или пароль');
  }
  const data = await res.json();
  if (data.user) data.user.balance = Number(data.user.balance ?? 0);
  return data;
}

export async function getMe(): Promise<{ user: User }> {
  const res = await apiFetch('/api/auth/me');
  if (!res.ok) throw new Error('Не удалось загрузить профиль');
  const data = await res.json();
  // Postgres NUMERIC comes back as a string — coerce to number
  if (data.user) data.user.balance = Number(data.user.balance ?? 0);
  return data;
}

// ---- Scenarios ----

export async function getScenarios(): Promise<Scenario[]> {
  const res = await apiFetch('/api/scenarios');
  if (!res.ok) throw new Error('Не удалось загрузить сценарии');
  return (await res.json()).scenarios;
}

export async function getScenario(slug: string): Promise<Scenario> {
  const res = await apiFetch(`/api/scenarios/${slug}`);
  if (!res.ok) throw new Error('Сценарий не найден');
  return (await res.json()).scenario;
}

// ---- Runs ----

export async function createRun(
  scenarioId: string,
  inputData: Record<string, unknown>,
  connectionId?: string
): Promise<{ run: Run }> {
  const body: Record<string, unknown> = { scenarioId, inputData };
  if (connectionId) body.connectionId = connectionId;
  const res = await apiFetch('/api/runs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось запустить сценарий');
  }
  return res.json();
}

export async function getRuns(limit?: number): Promise<Run[]> {
  const qs = limit ? `?limit=${limit}` : '';
  const res = await apiFetch(`/api/runs${qs}`);
  if (!res.ok) throw new Error('Не удалось загрузить запуски');
  return (await res.json()).runs;
}

export async function getRun(id: string): Promise<Run> {
  const res = await apiFetch(`/api/runs/${id}`);
  if (!res.ok) throw new Error('Запуск не найден');
  return (await res.json()).run;
}

// ---- Connections ----

export async function getConnections(): Promise<Connection[]> {
  const res = await apiFetch('/api/connections');
  if (!res.ok) throw new Error('Не удалось загрузить подключения');
  return (await res.json()).connections;
}

export async function createConnection(data: Record<string, string>): Promise<{ connection: Connection }> {
  const res = await apiFetch('/api/connections', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Не удалось добавить подключение');
  }
  return res.json();
}

// ---- Wallet ----

export async function topupWallet(
  amount: number
): Promise<{ orderId: string; formUrl: string; fields: Record<string, string> }> {
  const res = await apiFetch('/api/wallet/topup', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось создать пополнение');
  }
  return res.json();
}

export async function getTransactions(): Promise<Transaction[]> {
  const res = await apiFetch('/api/wallet/transactions');
  if (!res.ok) throw new Error('Не удалось загрузить транзакции');
  return (await res.json()).transactions;
}

export async function getTopups(): Promise<Topup[]> {
  const res = await apiFetch('/api/wallet/topups');
  if (!res.ok) throw new Error('Не удалось загрузить пополнения');
  return (await res.json()).topups;
}

// ---- Notifications ----

export async function getNotifications(): Promise<Notification[]> {
  const res = await apiFetch('/api/notifications');
  if (!res.ok) throw new Error('Не удалось загрузить уведомления');
  return (await res.json()).notifications;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
}

export async function getDigestSettings(): Promise<{ digestEnabled: boolean }> {
  const res = await apiFetch('/api/notifications/digest-settings');
  if (!res.ok) return { digestEnabled: true };
  return res.json();
}

export async function updateDigestSettings(enabled: boolean): Promise<void> {
  await apiFetch('/api/notifications/digest-settings', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

// ---- Products ----

export interface ScoredProduct {
  sku: string;
  title: string;
  price: number;
  stock: number;
  description?: string;
  photoUrls?: string[];
  characteristics?: Record<string, string>;
  score: number;
  scoreLabel: 'excellent' | 'good' | 'average' | 'poor';
  issues: string[];
  platform: 'wb' | 'ozon' | 'ym' | 'mm';
  connectionId: string;
}

export interface ProductSummary {
  total: number;
  poor: number;
  average: number;
  good: number;
  excellent: number;
  avgScore: number;
}

export async function updateProductPrice(data: { connectionId: string; sku: string; price: number }): Promise<{ ok: boolean }> {
  const res = await apiFetch('/api/products/price', { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка обновления цены'); }
  return res.json();
}

export async function getProducts(connectionId?: string, limit?: number): Promise<{ products: ScoredProduct[]; summary: ProductSummary }> {
  const params = new URLSearchParams();
  if (connectionId) params.set('connectionId', connectionId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/products${qs}`);
  if (!res.ok) throw new Error('Не удалось загрузить товары');
  return res.json();
}

// ---- Automations ----

export interface Automation {
  id: string;
  scenario_slug: string;
  connection_id: string | null;
  enabled: boolean;
  schedule: 'hourly' | 'daily' | 'weekly';
  auto_apply: boolean;
  settings: Record<string, unknown>;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  connection_platform?: string;
  connection_name?: string;
}

export async function getAutomations(): Promise<Automation[]> {
  const res = await apiFetch('/api/automations');
  if (!res.ok) throw new Error('Не удалось загрузить автоматизации');
  return (await res.json()).automations;
}

export async function upsertAutomation(data: {
  scenarioSlug: string;
  connectionId?: string | null;
  enabled?: boolean;
  schedule?: string;
  auto_apply?: boolean;
  settings?: Record<string, unknown>;
}): Promise<Automation> {
  const res = await apiFetch('/api/automations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Ошибка сохранения');
  }
  return (await res.json()).automation;
}

export async function updateAutomation(
  id: string,
  data: Partial<Pick<Automation, 'enabled' | 'schedule' | 'auto_apply' | 'settings'>>
): Promise<Automation> {
  const res = await apiFetch(`/api/automations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Ошибка обновления');
  }
  return (await res.json()).automation;
}

export async function deleteAutomation(id: string): Promise<void> {
  await apiFetch(`/api/automations/${id}`, { method: 'DELETE' });
}

export async function triggerAutomation(id: string): Promise<void> {
  const res = await apiFetch(`/api/automations/${id}/run`, { method: 'POST' });
  if (!res.ok) throw new Error('Не удалось запустить');
}

// ---- Autopilot ----

export interface AutopilotAction {
  type: string;
  title: string;
  description: string;
  recommended: boolean;
  enabled: boolean;
  agentType?: boolean;
  schedule?: 'hourly' | 'daily' | 'weekly';
  autoApply?: boolean;
}

export interface PhotoEnhancement {
  type: 'lifestyle' | 'text-overlay' | 'seasonal' | 'companion' | 'custom-bg';
  label: string;
  description: string;
  recommended: boolean;
  enabled: boolean;
  config: Record<string, string>;
}

export interface AutopilotPlan {
  detected: { name: string; category: string; characteristics: string[] };
  actions: AutopilotAction[];
  pricing: { recommended: 'competitive' | 'margin' | 'fixed'; reason: string };
  photoEnhancements?: PhotoEnhancement[];
}

export interface AutopilotSession {
  id: string;
  status: 'running' | 'done' | 'error';
  product_name: string;
  product_data: Record<string, unknown>;
  plan: AutopilotAction[];
  runs: Record<string, { runId: string; status: string; result?: Record<string, unknown>; errorMessage?: string }>;
  connection_name?: string;
  connection_platform?: string;
  created_at: string;
}

export interface PricingRule {
  id: string;
  connection_id: string | null;
  sku: string | null;
  name: string;
  strategy: 'margin' | 'competitive' | 'fixed' | 'dynamic';
  config: Record<string, unknown>;
  enabled: boolean;
  last_applied_at: string | null;
  connection_name?: string;
  connection_platform?: string;
  created_at: string;
}

export async function analyzeProduct(data: {
  productName: string;
  description: string;
  photoUrls: string[];
  platform: 'wb' | 'ozon';
}): Promise<AutopilotPlan> {
  const res = await apiFetch('/api/autopilot/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Ошибка анализа');
  }
  return (await res.json()).plan;
}

export async function analyzeBatch(products: Array<{
  productName: string;
  description: string;
  photoUrls: string[];
  platform: 'wb' | 'ozon';
}>): Promise<Array<AutopilotPlan | { error: string }>> {
  const res = await apiFetch('/api/autopilot/analyze/batch', {
    method: 'POST',
    body: JSON.stringify({ products }),
  });
  if (!res.ok) throw new Error('Ошибка анализа');
  return (await res.json()).plans;
}

export async function executeAutopilot(data: {
  product: { name: string; description: string; photoUrls: string[]; platform: 'wb' | 'ozon'; characteristics: string[] };
  connectionId: string | null;
  actions: AutopilotAction[];
  photoEnhancements?: PhotoEnhancement[];
  pricingRule?: { name: string; strategy: string; config: Record<string, unknown>; enabled: boolean } | null;
}): Promise<{ sessionId: string }> {
  const res = await apiFetch('/api/autopilot/execute', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Ошибка запуска');
  }
  return res.json();
}

export async function getAutopilotSession(sessionId: string): Promise<AutopilotSession> {
  const res = await apiFetch(`/api/autopilot/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Сессия не найдена');
  return (await res.json()).session;
}

export async function getAutopilotSessions(): Promise<AutopilotSession[]> {
  const res = await apiFetch('/api/autopilot/sessions');
  if (!res.ok) throw new Error('Не удалось загрузить сессии');
  return (await res.json()).sessions;
}

export async function getPricingRules(): Promise<PricingRule[]> {
  const res = await apiFetch('/api/autopilot/pricing-rules');
  if (!res.ok) throw new Error('Не удалось загрузить правила');
  return (await res.json()).rules;
}

export async function savePricingRule(data: Partial<PricingRule> & { name: string; strategy: string; config: Record<string, unknown> }): Promise<PricingRule> {
  const method = data.id ? 'PATCH' : 'POST';
  const url = data.id ? `/api/autopilot/pricing-rules/${data.id}` : '/api/autopilot/pricing-rules';
  const res = await apiFetch(url, { method, body: JSON.stringify(data) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Ошибка сохранения');
  }
  return (await res.json()).rule;
}

export async function deletePricingRule(id: string): Promise<void> {
  await apiFetch(`/api/autopilot/pricing-rules/${id}`, { method: 'DELETE' });
}

export async function applyPricingRuleNow(id: string): Promise<{ applied: number; skipped: number }> {
  const res = await apiFetch(`/api/autopilot/pricing-rules/${id}/apply`, { method: 'POST' });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка применения'); }
  return res.json();
}

export interface PriceChangeLog {
  id: string;
  rule_id?: string;
  rule_name?: string;
  platform: string;
  sku: string;
  title?: string;
  old_price: number;
  new_price: number;
  reason?: string;
  applied_at: string;
}

export async function getPricingHistory(ruleId?: string): Promise<PriceChangeLog[]> {
  const url = ruleId
    ? `/api/autopilot/pricing-rules/${ruleId}/history`
    : '/api/autopilot/pricing-rules/history';
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Ошибка загрузки истории');
  return (await res.json()).history;
}

// ---- Admin ----

export async function adminGetUsers(): Promise<AdminUser[]> {
  const res = await apiFetch('/api/admin/users');
  if (!res.ok) throw new Error('Не удалось загрузить пользователей');
  return (await res.json()).users;
}

export async function adminGetRuns(status?: string, limit?: number): Promise<AdminRun[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/admin/runs${qs}`);
  if (!res.ok) throw new Error('Не удалось загрузить запуски');
  return (await res.json()).runs;
}

export async function adminRetryRun(id: string): Promise<{ ok: boolean; runId: string }> {
  const res = await apiFetch(`/api/admin/runs/${id}/retry`, { method: 'POST' });
  if (!res.ok) throw new Error('Не удалось повторить запуск');
  return res.json();
}

export async function adminAdjustBalance(
  userId: string,
  amount: number,
  note?: string
): Promise<{ ok: boolean; newBalance: number }> {
  const res = await apiFetch(`/api/admin/users/${userId}/balance`, {
    method: 'POST',
    body: JSON.stringify({ amount, note }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось изменить баланс');
  }
  return res.json();
}

export async function adminToggleScenario(
  id: string,
  is_active: boolean
): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/api/admin/scenarios/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
  if (!res.ok) throw new Error('Не удалось обновить сценарий');
  return res.json();
}

// ---- Analytics ----

export interface SalesDayChart {
  date: string;
  wb: number;
  ozon: number;
  ym: number;
  mm: number;
  total: number;
}

export interface PlatformMetrics {
  revenue: number;
  orders: number;
  returns: number;
  netPayout: number;
}

export interface StockAlert {
  sku: string;
  title: string;
  stock: number;
  platform: 'wb' | 'ozon';
  level: 'critical' | 'low';
}

export interface AnalyticsSummary {
  period: string;
  dateFrom: string;
  dateTo: string;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    totalReturns: number;
    totalNetPayout: number;
    returnRate: number;
  };
  byPlatform: {
    wb: PlatformMetrics;
    ozon: PlatformMetrics;
    ym: PlatformMetrics;
    mm: PlatformMetrics;
  };
  chart: SalesDayChart[];
  stockAlerts: StockAlert[];
  connections: { id: string; name: string; platform: string }[];
}

export async function getAnalyticsSummary(period: '7d' | '30d' | '90d' = '30d'): Promise<AnalyticsSummary> {
  const res = await apiFetch(`/api/analytics/summary?period=${period}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось загрузить аналитику');
  }
  return res.json();
}

export async function invalidateAnalyticsCache(): Promise<void> {
  await apiFetch('/api/analytics/cache', { method: 'DELETE' });
}

// ---- Orders ----

export interface OrderLine {
  sku: string;
  offerId: string;
  title: string;
  quantity: number;
  price: number;
}

export interface MarketplaceOrder {
  id: string;
  platform: 'wb' | 'ozon' | 'ym' | 'mm';
  status: string;
  createdAt: string;
  items: OrderLine[];
  connectionId: string;
  connectionName: string;
  // WB
  warehouseId?: number;
  warehouseName?: string;
  nmId?: number;
  // Ozon
  postingNumber?: string;
  deliveryMethod?: string;
  shipByDate?: string;
  upperBarcode?: string;
  lowerBarcode?: string;
}

export async function getOrders(status: 'new' | 'all' = 'new', connectionId?: string): Promise<{ orders: MarketplaceOrder[]; total: number }> {
  const params = new URLSearchParams({ status });
  if (connectionId) params.set('connectionId', connectionId);
  const res = await apiFetch(`/api/orders?${params}`);
  if (!res.ok) throw new Error('Не удалось загрузить заказы');
  return res.json();
}

export async function createWbSupply(data: { connectionId: string; orderIds: string[]; supplyName?: string }): Promise<{ supplyId: string; name: string }> {
  const res = await apiFetch('/api/orders/wb/supply', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка создания поставки'); }
  return res.json();
}

export async function getWbSupplyBarcode(supplyId: string, connectionId: string): Promise<{ barcode: string }> {
  const res = await apiFetch(`/api/orders/wb/supply/${supplyId}/barcode?connectionId=${connectionId}`);
  if (!res.ok) throw new Error('Ошибка получения штрихкода');
  return res.json();
}

export async function getWbOrderStickers(data: { connectionId: string; orderIds: string[] }): Promise<{ stickers: { orderId: string; barcodeBase64: string }[] }> {
  const res = await apiFetch('/api/orders/wb/stickers', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка получения наклеек'); }
  return res.json();
}

export async function closeWbSupply(supplyId: string, connectionId: string): Promise<void> {
  await apiFetch(`/api/orders/wb/supply/${supplyId}/close`, { method: 'POST', body: JSON.stringify({ connectionId }) });
}

export async function shipOzonOrder(data: { connectionId: string; postingNumber: string; packages?: unknown[] }): Promise<{ ok: boolean }> {
  const res = await apiFetch('/api/orders/ozon/ship', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка отгрузки'); }
  return res.json();
}

export async function getOzonLabel(data: { connectionId: string; postingNumbers: string[] }): Promise<{ pdf: string }> {
  const res = await apiFetch('/api/orders/ozon/label', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка получения ярлыка'); }
  return res.json();
}

export async function getYmLabel(data: { connectionId: string; orderId: string }): Promise<{ pdf: string }> {
  const res = await apiFetch('/api/orders/ym/label', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка получения ярлыка'); }
  return res.json();
}

export async function confirmYmOrder(data: { connectionId: string; orderId: string }): Promise<{ ok: boolean }> {
  const res = await apiFetch('/api/orders/ym/confirm', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка подтверждения'); }
  return res.json();
}

export async function getMmLabel(data: { connectionId: string; orderId: string }): Promise<{ pdf: string }> {
  const res = await apiFetch('/api/orders/mm/label', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка получения ярлыка'); }
  return res.json();
}

export async function confirmMmOrder(data: { connectionId: string; orderId: string }): Promise<{ ok: boolean }> {
  const res = await apiFetch('/api/orders/mm/confirm', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка подтверждения'); }
  return res.json();
}

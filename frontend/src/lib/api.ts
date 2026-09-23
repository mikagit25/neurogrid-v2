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
  is_demo?: boolean;
  demo_expires_at?: string;
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
  is_active: boolean;
  created_at: string;
}

export interface AdminStats {
  users:    { total: number; new_30d: number };
  runs:     { total: number; errors: number; last_30d: number };
  revenue:  { total: string; last_30d: string };
  tickets:  { open_count: number; total: number };
  invoices: { pending_count: number };
}

export interface AdminInvoice {
  id: string;
  invoice_number: string;
  user_email?: string;
  plan: string;
  months: number;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  payer_name?: string;
  notes?: string;
  created_at: string;
  paid_at?: string;
}

export interface AdminAct {
  id: string;
  act_number: string;
  user_email: string;
  period_from: string;
  period_to: string;
  amount: number;
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

export async function register(
  email: string,
  password: string,
  agreementAccepted = false,
  refCode?: string,
  promoCode?: string,
): Promise<{ user: User }> {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      agreement_accepted: agreementAccepted,
      ...(refCode   ? { ref_code: refCode }     : {}),
      ...(promoCode ? { promo_code: promoCode } : {}),
    }),
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

export async function createDemoSession(): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_URL}/api/auth/demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось создать демо-сессию');
  }
  const data = await res.json();
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

export async function getAlertEmailSettings(): Promise<{ alertEmailEnabled: boolean }> {
  const res = await apiFetch('/api/notifications/alert-email-settings');
  if (!res.ok) return { alertEmailEnabled: true };
  return res.json();
}

export async function updateAlertEmailSettings(enabled: boolean): Promise<void> {
  await apiFetch('/api/notifications/alert-email-settings', {
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

export async function adminGetStats(): Promise<AdminStats> {
  return apiRequest('/api/admin/stats');
}

export async function adminSearchUsers(search?: string): Promise<AdminUser[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await apiFetch(`/api/admin/users${q}`);
  if (!res.ok) throw new Error('Не удалось загрузить пользователей');
  return (await res.json()).users;
}

export async function adminPatchUser(
  id: string,
  data: { is_active?: boolean; is_admin?: boolean },
): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function adminEditScenario(
  id: string,
  data: { title?: string; description?: string; price?: number },
): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function adminGetInvoices(status?: string): Promise<{ invoices: AdminInvoice[] }> {
  const q = status ? `?status=${status}` : '';
  return apiRequest(`/api/admin/invoices${q}`);
}

export async function adminMarkInvoicePaid(id: string, notes?: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify({ notes }) });
}

export async function adminCancelInvoice(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/invoices/${id}/cancel`, { method: 'POST' });
}

export async function adminPreviewInvoiceHtml(id: string): Promise<void> {
  const res = await apiFetch(`/api/admin/invoices/${id}/html`);
  if (!res.ok) throw new Error('Не удалось загрузить счёт');
  const html = await res.text();
  const blob = new Blob([html], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
}

export async function adminGetActs(): Promise<{ acts: AdminAct[] }> {
  return apiRequest('/api/admin/acts');
}

export async function adminGenerateAct(
  user_id: string, year: number, month: number,
): Promise<{ ok: boolean; act: AdminAct }> {
  return apiRequest('/api/admin/acts/generate', { method: 'POST', body: JSON.stringify({ user_id, year, month }) });
}

export async function adminPreviewActHtml(id: string): Promise<void> {
  const res = await apiFetch(`/api/admin/acts/${id}/html`);
  if (!res.ok) throw new Error('Не удалось загрузить акт');
  const html = await res.text();
  const blob = new Blob([html], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
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

// ---- P&L ----

export interface PnlSkuRow {
  platform: string;
  sku: string;
  title: string | null;
  quantity: number;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  ad_spend: number;
  cost_of_goods: number;
  gross_profit: number;
  net_profit: number | null;
  margin_pct: number | null;
  drr_pct: number;
}

export interface PnlSummary {
  revenue: number;
  net_payout: number;
  ad_spend: number;
  cost_of_goods: number;
  net_profit: number;
  margin_pct: number;
  drr_pct: number;
  profitable_skus: number;
  losing_skus: number;
  unknown_skus: number;
}

export interface PnlTrendPoint {
  date: string;
  revenue: number;
  net_payout: number;
  ad_spend: number;
  net_profit: number;
}

export async function getPnl(period = '30d', platform?: string): Promise<{ rows: PnlSkuRow[]; summary: PnlSummary; dateFrom: string; dateTo: string }> {
  const params = new URLSearchParams({ period });
  if (platform) params.set('platform', platform);
  const res = await apiFetch(`/api/pnl?${params}`);
  if (!res.ok) throw new Error('Не удалось загрузить P&L');
  return res.json();
}

export async function getPnlTrend(period = '90d'): Promise<{ trend: PnlTrendPoint[] }> {
  const res = await apiFetch(`/api/pnl/trend?period=${period}`);
  if (!res.ok) throw new Error('Не удалось загрузить тренд P&L');
  return res.json();
}

// ---- Finance Goals ----

export interface FinanceGoal {
  id: string;
  user_id: string;
  year_month: string;
  revenue_goal: number | null;
  payout_goal: number | null;
  profit_goal: number | null;
  ad_spend_goal: number | null;
  drr_goal: number | null;
  created_at: string;
  updated_at: string;
}

export interface GoalProgress {
  month: string;
  goal: FinanceGoal | null;
  actual: {
    revenue: number;
    payout: number;
    ad_spend: number;
    drr_pct: number;
  };
  days_in_month: number;
  days_elapsed: number;
}

export async function getFinanceGoal(month?: string): Promise<{ goal: FinanceGoal | null; month: string }> {
  const q = month ? `?month=${month}` : '';
  const res = await apiFetch(`/api/pnl/goals${q}`);
  if (!res.ok) throw new Error('Ошибка загрузки цели');
  return res.json();
}

export async function getFinanceGoalsList(): Promise<{ goals: FinanceGoal[] }> {
  const res = await apiFetch('/api/pnl/goals/list');
  if (!res.ok) throw new Error('Ошибка загрузки целей');
  return res.json();
}

export async function upsertFinanceGoal(month: string, data: Partial<Omit<FinanceGoal, 'id' | 'user_id' | 'year_month' | 'created_at' | 'updated_at'>>): Promise<{ goal: FinanceGoal }> {
  const res = await apiFetch('/api/pnl/goals', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, ...data }),
  });
  if (!res.ok) throw new Error('Ошибка сохранения цели');
  return res.json();
}

export async function getGoalProgress(month?: string): Promise<GoalProgress> {
  const q = month ? `?month=${month}` : '';
  const res = await apiFetch(`/api/pnl/goals/progress${q}`);
  if (!res.ok) throw new Error('Ошибка загрузки прогресса');
  return res.json();
}

// ---- Finance Today (dashboard pulse) ----

export interface FinanceToday {
  today: { revenue: number; payout: number; quantity: number };
  yesterday: { revenue: number; payout: number; quantity: number };
  week: { revenue: number; payout: number };
  delta_pct: number | null;
}

export async function getFinanceToday(): Promise<FinanceToday> {
  const res = await apiFetch('/api/finance/today');
  if (!res.ok) throw new Error('Ошибка загрузки данных за сегодня');
  return res.json();
}

// ---- Finance Platform Split ----

export interface FinancePlatformSplit {
  platform: string;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  quantity: number;
  cost_of_goods: number;
  ad_spend: number;
  gross_profit: number;
  net_profit: number;
  margin_pct: number;
  drr_pct: number;
}

export async function getFinancePlatformSplit(from: string, to: string): Promise<{ platforms: FinancePlatformSplit[]; from: string; to: string }> {
  const res = await apiFetch(`/api/finance/platform-split?from=${from}&to=${to}`);
  if (!res.ok) throw new Error('Ошибка загрузки разбивки по площадкам');
  return res.json();
}

// ---- Alerts ----

export interface AlertRule {
  id: string;
  type: string;
  name: string;
  platform: string | null;
  sku: string | null;
  threshold: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertEvent {
  id: string;
  rule_id: string | null;
  type: string;
  platform: string | null;
  sku: string | null;
  sku_title: string | null;
  value: number | null;
  threshold: number | null;
  message: string;
  is_read: boolean;
  triggered_at: string;
}

export async function getAlertRules(): Promise<AlertRule[]> {
  const res = await apiFetch('/api/alerts/rules');
  if (!res.ok) throw new Error('Не удалось загрузить правила');
  return (await res.json()).rules;
}

export async function createAlertRule(data: { type: string; name: string; platform?: string; sku?: string; threshold?: number }): Promise<AlertRule> {
  const res = await apiFetch('/api/alerts/rules', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка создания'); }
  return (await res.json()).rule;
}

export async function updateAlertRule(id: string, data: Partial<Pick<AlertRule, 'name' | 'platform' | 'sku' | 'threshold' | 'is_active'>>): Promise<AlertRule> {
  const res = await apiFetch(`/api/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка обновления'); }
  return (await res.json()).rule;
}

export async function deleteAlertRule(id: string): Promise<void> {
  await apiFetch(`/api/alerts/rules/${id}`, { method: 'DELETE' });
}

export async function getAlertEvents(limit = 50, unreadOnly = false): Promise<{ events: AlertEvent[]; unread_count: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (unreadOnly) params.set('unread', 'true');
  const res = await apiFetch(`/api/alerts/events?${params}`);
  if (!res.ok) throw new Error('Не удалось загрузить события');
  return res.json();
}

export async function markAlertEventRead(id: string): Promise<void> {
  await apiFetch(`/api/alerts/events/${id}/read`, { method: 'POST' });
}

export async function markAllAlertEventsRead(): Promise<void> {
  await apiFetch('/api/alerts/events/read-all', { method: 'POST' });
}

// ---- SEO ----

export interface TrackedKeyword {
  id: string;
  platform: string;
  sku: string;
  keyword: string;
  is_active: boolean;
  created_at: string;
  last_position?: { position: number | null; page: number | null; checked_at: string } | null;
}

export interface KeywordPosition {
  id: string;
  keyword_id: string;
  platform: string;
  sku: string;
  keyword: string;
  position: number | null;
  page: number | null;
  checked_at: string;
}

export interface ListingScore {
  id: string;
  connection_id: string;
  platform: string;
  sku: string;
  title: string;
  score: number;
  score_label: 'excellent' | 'good' | 'average' | 'poor';
  score_title: number;
  score_photos: number;
  score_desc: number;
  score_attrs: number;
  score_rating: number;
  issues: string[];
  suggestions: string[];
  computed_at: string;
}

export interface TrackedCompetitor {
  id: string;
  platform: string;
  my_sku: string;
  competitor_sku: string;
  competitor_name: string | null;
  is_active: boolean;
  created_at: string;
  last_price?: { price: number; my_price: number | null; diff_pct: number | null; checked_at: string } | null;
}

export async function getTrackedKeywords(): Promise<TrackedKeyword[]> {
  const res = await apiFetch('/api/seo/keywords');
  if (!res.ok) throw new Error('Не удалось загрузить ключевые слова');
  return res.json();
}

export async function addTrackedKeyword(data: { platform: string; sku: string; keyword: string }): Promise<TrackedKeyword> {
  const res = await apiFetch('/api/seo/keywords', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка добавления'); }
  return res.json();
}

export async function deleteTrackedKeyword(id: string): Promise<void> {
  await apiFetch(`/api/seo/keywords/${id}`, { method: 'DELETE' });
}

export async function checkKeywordPositions(): Promise<{ checked: number }> {
  const res = await apiFetch('/api/seo/keywords/check', { method: 'POST' });
  if (!res.ok) throw new Error('Ошибка проверки позиций');
  return res.json();
}

export async function getKeywordHistory(keywordId: string): Promise<KeywordPosition[]> {
  const res = await apiFetch(`/api/seo/keywords/${keywordId}/history`);
  if (!res.ok) throw new Error('Ошибка загрузки истории');
  return res.json();
}

export async function getListingScores(platform?: string, label?: string): Promise<ListingScore[]> {
  const params = new URLSearchParams();
  if (platform) params.set('platform', platform);
  if (label) params.set('label', label);
  const res = await apiFetch(`/api/seo/listing-scores?${params}`);
  if (!res.ok) throw new Error('Не удалось загрузить листинг-скоры');
  return res.json();
}

export async function computeListingScores(): Promise<{ computed: number }> {
  const res = await apiFetch('/api/seo/listing-scores/compute', { method: 'POST' });
  if (!res.ok) throw new Error('Ошибка вычисления скоров');
  return res.json();
}

export async function getTrackedCompetitors(): Promise<TrackedCompetitor[]> {
  const res = await apiFetch('/api/seo/competitors');
  if (!res.ok) throw new Error('Не удалось загрузить конкурентов');
  return res.json();
}

export async function addTrackedCompetitor(data: { platform: string; my_sku: string; competitor_sku: string; competitor_name?: string }): Promise<TrackedCompetitor> {
  const res = await apiFetch('/api/seo/competitors', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка добавления'); }
  return res.json();
}

export async function deleteTrackedCompetitor(id: string): Promise<void> {
  await apiFetch(`/api/seo/competitors/${id}`, { method: 'DELETE' });
}

export async function checkCompetitorPrices(): Promise<{ checked: number }> {
  const res = await apiFetch('/api/seo/competitors/check', { method: 'POST' });
  if (!res.ok) throw new Error('Ошибка проверки цен');
  return res.json();
}

// ---- Launch Sequencer ----

export interface LaunchStep {
  id: string;
  step_order: number;
  type: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
  scheduled_at: string | null;
  completed_at: string | null;
  meta?: Record<string, any>;
}

export interface LaunchCampaign {
  id: string;
  name: string;
  platform: string;
  sku: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  target_sales: number | null;
  target_position: number | null;
  budget: number | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  steps: LaunchStep[];
}

export async function getLaunchCampaigns(): Promise<LaunchCampaign[]> {
  const res = await apiFetch('/api/launch');
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function createLaunchCampaign(data: { name: string; platform: string; sku: string; target_sales?: number; target_position?: number; budget?: number; notes?: string }): Promise<LaunchCampaign> {
  const res = await apiFetch('/api/launch', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка создания'); }
  return res.json();
}

export async function updateLaunchCampaign(id: string, data: Partial<LaunchCampaign>): Promise<void> {
  await apiFetch(`/api/launch/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteLaunchCampaign(id: string): Promise<void> {
  await apiFetch(`/api/launch/${id}`, { method: 'DELETE' });
}

export async function updateLaunchStep(stepId: string, data: { status?: string }): Promise<void> {
  await apiFetch(`/api/launch/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ---- Reviews ----

export interface ProductReview {
  id: string;
  platform: string;
  sku: string;
  external_id: string | null;
  author: string | null;
  rating: number | null;
  text: string | null;
  pros: string | null;
  cons: string | null;
  is_answered: boolean;
  ai_reply: string | null;
  reply_approved: boolean;
  replied_at: string | null;
  review_date: string | null;
  synced_at: string;
}

export interface ReviewStats {
  unanswered: number;
  total: number;
  avg_rating: number | null;
  negative: number;
  replied: number;
}

export interface ReviewReplySettings {
  tone: string;
  brand_name: string | null;
  custom_instructions: string | null;
  auto_approve: boolean;
}

export async function getReviews(params?: { platform?: string; sku?: string; rating?: number; answered?: boolean; limit?: number; offset?: number }): Promise<ProductReview[]> {
  const p = new URLSearchParams();
  if (params?.platform) p.set('platform', params.platform);
  if (params?.sku) p.set('sku', params.sku);
  if (params?.rating != null) p.set('rating', String(params.rating));
  if (params?.answered != null) p.set('answered', String(params.answered));
  if (params?.limit != null) p.set('limit', String(params.limit));
  if (params?.offset != null) p.set('offset', String(params.offset));
  const res = await apiFetch(`/api/reviews?${p}`);
  if (!res.ok) throw new Error('Ошибка загрузки отзывов');
  return res.json();
}

export async function getReviewStats(): Promise<ReviewStats> {
  const res = await apiFetch('/api/reviews/stats');
  if (!res.ok) throw new Error('Ошибка загрузки статистики');
  return res.json();
}

export async function syncReviews(): Promise<{ synced: number }> {
  const res = await apiFetch('/api/reviews/sync', { method: 'POST' });
  if (!res.ok) throw new Error('Ошибка синхронизации');
  return res.json();
}

export async function generateReviewReply(reviewId: string): Promise<{ reply: string }> {
  const res = await apiFetch(`/api/reviews/${reviewId}/generate-reply`, { method: 'POST' });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка генерации'); }
  return res.json();
}

export async function approveReviewReply(reviewId: string, replyText?: string): Promise<void> {
  await apiFetch(`/api/reviews/${reviewId}/approve-reply`, { method: 'POST', body: JSON.stringify({ reply_text: replyText }) });
}

export async function updateReview(reviewId: string, data: { ai_reply?: string; is_answered?: boolean }): Promise<void> {
  await apiFetch(`/api/reviews/${reviewId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function getReviewReplySettings(): Promise<ReviewReplySettings> {
  const res = await apiFetch('/api/reviews/settings');
  if (!res.ok) throw new Error('Ошибка загрузки настроек');
  return res.json();
}

export async function saveReviewReplySettings(data: Partial<ReviewReplySettings>): Promise<void> {
  await apiFetch('/api/reviews/settings', { method: 'PUT', body: JSON.stringify(data) });
}

// ---- Supply Chain ----

export interface RestockForecast {
  id: string;
  connection_id: string | null;
  platform: string;
  sku: string;
  title: string | null;
  current_stock: number;
  avg_daily_sales: number;
  days_left: number | null;
  reorder_point: number | null;
  reorder_qty: number | null;
  status: 'ok' | 'warning' | 'critical' | 'out_of_stock';
  computed_at: string;
}

export interface PurchaseOrder {
  id: string;
  platform: string;
  sku: string;
  title: string | null;
  qty: number;
  unit_cost: number | null;
  total_cost: number | null;
  status: 'planned' | 'ordered' | 'in_transit' | 'received' | 'cancelled';
  supplier: string | null;
  notes: string | null;
  expected_at: string | null;
  received_at: string | null;
  created_at: string;
}

export async function getRestockForecasts(params?: { status?: string; platform?: string }): Promise<RestockForecast[]> {
  const p = new URLSearchParams();
  if (params?.status) p.set('status', params.status);
  if (params?.platform) p.set('platform', params.platform);
  p.set('sortBy', 'days_left');
  const res = await apiFetch(`/api/supply/forecasts?${p}`);
  if (!res.ok) throw new Error('Ошибка загрузки прогнозов');
  return res.json();
}

export async function computeRestockForecasts(): Promise<{ computed: number }> {
  const res = await apiFetch('/api/supply/forecasts/compute', { method: 'POST' });
  if (!res.ok) throw new Error('Ошибка вычисления');
  return res.json();
}

export async function getPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  const res = await apiFetch(`/api/supply/orders?${p}`);
  if (!res.ok) throw new Error('Ошибка загрузки заказов');
  return res.json();
}

export async function createPurchaseOrder(data: { platform: string; sku: string; title?: string; qty: number; unit_cost?: number; supplier?: string; notes?: string; expected_at?: string }): Promise<PurchaseOrder> {
  const res = await apiFetch('/api/supply/orders', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка создания'); }
  return res.json();
}

export async function updatePurchaseOrder(id: string, data: Partial<PurchaseOrder>): Promise<void> {
  await apiFetch(`/api/supply/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ---- Returns ----

export interface ReturnItem {
  id: string;
  platform: string;
  sku: string;
  title: string | null;
  order_id: string | null;
  return_id: string | null;
  qty: number;
  reason: string | null;
  reason_code: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'resellable';
  refund_amount: number | null;
  action: string | null;
  notes: string | null;
  return_date: string | null;
}

export interface ReturnStats {
  total: number;
  pending: number;
  resellable: number;
  total_refunded: number;
  supplier_claims: number;
  skus_affected: number;
}

export interface ReturnAnalyticsRow {
  sku: string;
  platform: string;
  title: string | null;
  return_count: number;
  return_rate: number | null;
  top_reason_code: string | null;
  top_reason: string | null;
}

export async function getReturnItems(params?: { status?: string; platform?: string }): Promise<ReturnItem[]> {
  const p = new URLSearchParams();
  if (params?.status) p.set('status', params.status);
  if (params?.platform) p.set('platform', params.platform);
  const res = await apiFetch(`/api/returns?${p}`);
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function getReturnStats(): Promise<ReturnStats> {
  const res = await apiFetch('/api/returns/stats');
  if (!res.ok) throw new Error('Ошибка статистики');
  return res.json();
}

export async function getReturnAnalytics(): Promise<ReturnAnalyticsRow[]> {
  const res = await apiFetch('/api/returns/analytics');
  if (!res.ok) throw new Error('Ошибка аналитики');
  return res.json();
}

export async function updateReturnItem(id: string, data: { status?: string; action?: string; notes?: string; refund_amount?: number }): Promise<void> {
  await apiFetch(`/api/returns/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function createReturnItem(data: { platform: string; sku: string; title?: string; qty?: number; reason?: string; reason_code?: string; order_id?: string; refund_amount?: number; return_date?: string; action?: string; notes?: string }): Promise<ReturnItem> {
  const res = await apiFetch('/api/returns', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка создания'); }
  return res.json();
}

// ---- API Keys ----

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  key?: string; // only present on creation
}

export async function getApiKeys(): Promise<ApiKey[]> {
  const res = await apiFetch('/api/api-keys');
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function createApiKey(data: { name: string; scopes?: string[] }): Promise<ApiKey> {
  const res = await apiFetch('/api/api-keys', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка создания'); }
  return res.json();
}

export async function revokeApiKey(id: string): Promise<void> {
  await apiFetch(`/api/api-keys/${id}`, { method: 'DELETE' });
}

// ---- Telegram (see full implementation at bottom of file) ----

// ── Teams ──────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  role: string;
  created_at: string;
  user_id: string;
  email: string;
  name: string | null;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

export async function getTeamMembers(): Promise<{ members: TeamMember[]; pending: TeamInvitation[] }> {
  return apiRequest('/api/teams/members');
}

export async function inviteTeamMember(email: string, role: string): Promise<{ ok: boolean; token: string }> {
  return apiRequest('/api/teams/invite', { method: 'POST', body: JSON.stringify({ email, role }) });
}

export async function removeTeamMember(memberId: string): Promise<void> {
  await apiRequest(`/api/teams/members/${memberId}`, { method: 'DELETE' });
}

export async function revokeTeamInvitation(invitationId: string): Promise<void> {
  await apiRequest(`/api/teams/invitations/${invitationId}`, { method: 'DELETE' });
}

export async function acceptTeamInvitation(token: string): Promise<void> {
  await apiRequest('/api/teams/accept', { method: 'POST', body: JSON.stringify({ token }) });
}

export async function getInvitationInfo(token: string): Promise<{ email: string; owner_email: string; role: string; expires_at: string; accepted: boolean }> {
  return apiRequest(`/api/teams/invitation-info?token=${encodeURIComponent(token)}`);
}

// ── Bulk product operations ───────────────────────────────────────────────

export async function bulkUpdatePrices(
  connectionId: string,
  updates: { sku: string; price: number }[],
): Promise<{ ok: boolean; applied: number; failed: number }> {
  return apiRequest('/api/products/bulk-price', {
    method: 'POST',
    body: JSON.stringify({ connectionId, updates }),
  });
}

// ── Subscriptions ─────────────────────────────────────────────────────────

export interface SubscriptionInfo {
  plan: string;
  expires_at: string | null;
  limits: { runsPerMonth: number; maxConnections: number; hasWarehouse: boolean; hasFinance: boolean };
}

export async function getMySubscription(): Promise<{ subscription: SubscriptionInfo; plans: any[] }> {
  return apiRequest('/api/subscriptions/me');
}

export async function payForSubscription(plan: 'start' | 'business'): Promise<{ ok: boolean; subscription: SubscriptionInfo; newBalance: number }> {
  return apiRequest('/api/subscriptions/pay', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

// ── Run quota ─────────────────────────────────────────────────────────────

export async function getRunQuota(): Promise<{ used: number; max: number; plan: string; unlimited: boolean }> {
  return apiRequest('/api/runs/quota');
}

// ── Webhooks ──────────────────────────────────────────────────────────────

export interface Webhook {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  last_fired_at: string | null;
  last_status: number | null;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status_code: number | null;
  response: string | null;
  duration_ms: number | null;
  created_at: string;
}

export async function getWebhooks(): Promise<Webhook[]> {
  return apiRequest('/api/webhooks');
}

export async function createWebhook(data: { url: string; events: string[] }): Promise<Webhook> {
  return apiRequest('/api/webhooks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateWebhook(id: string, data: { url?: string; events?: string[]; is_active?: boolean }): Promise<void> {
  await apiRequest(`/api/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteWebhook(id: string): Promise<void> {
  await apiRequest(`/api/webhooks/${id}`, { method: 'DELETE' });
}

export async function testWebhook(id: string): Promise<void> {
  await apiRequest(`/api/webhooks/${id}/test`, { method: 'POST' });
}

export async function getWebhookDeliveries(id: string): Promise<WebhookDelivery[]> {
  return apiRequest(`/api/webhooks/${id}/deliveries`);
}

// ── Onboarding ────────────────────────────────────────────────────────────

export async function getOnboarding(): Promise<{ steps_done: string[]; dismissed: boolean }> {
  return apiRequest('/api/onboarding');
}

export async function markOnboardingStep(step: string): Promise<void> {
  await apiRequest('/api/onboarding', { method: 'PATCH', body: JSON.stringify({ step }) });
}

export async function dismissOnboarding(): Promise<void> {
  await apiRequest('/api/onboarding', { method: 'PATCH', body: JSON.stringify({ dismissed: true }) });
}

// ── AI Chat ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export async function getChatHistory(): Promise<{ messages: ChatMessage[] }> {
  return apiRequest('/api/chat/history');
}

export async function sendChatMessage(content: string): Promise<{ reply: string }> {
  return apiRequest('/api/chat/message', { method: 'POST', body: JSON.stringify({ content }) });
}

export async function clearChatHistory(): Promise<void> {
  await apiRequest('/api/chat/history', { method: 'DELETE' });
}

// ── Product Detail ────────────────────────────────────────────────────────

export interface ProductDetailData {
  sku: string;
  product: Record<string, any> | null;
  priceHistory: { applied_at: string; old_price: number; new_price: number; reason: string | null }[];
  competitorPrices: { competitor_sku: string; competitor_name: string | null; price: number; my_price: number | null; diff_pct: number | null; checked_at: string; platform: string }[];
  stockTrend: { day: string; qty: number }[];
  seoPositions: { keyword: string; position: number; page: number; checked_at: string; platform: string }[];
  reviews: { id: string; rating: number; text: string; author: string | null; is_answered: boolean; created_at: string }[];
}

export async function getProductDetail(sku: string, connectionId?: string): Promise<ProductDetailData> {
  const q = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : '';
  return apiRequest(`/api/products/${encodeURIComponent(sku)}/detail${q}`);
}

export async function bulkGenerateAiContent(
  connectionId: string,
  skus: string[],
): Promise<{ results: { sku: string; title: string; description: string }[] }> {
  return apiRequest('/api/products/bulk-ai-content', {
    method: 'POST',
    body: JSON.stringify({ connectionId, skus }),
  });
}

// ── Weekly Reports ────────────────────────────────────────────────────────

export interface ReportInsight {
  type: 'success' | 'warning' | 'info' | 'action';
  title: string;
  body: string;
}

export interface WeeklyReport {
  id: string;
  period_start: string;
  period_end: string;
  headline: string | null;
  summary: string | null;
  insights: ReportInsight[];
  kpis: {
    revenue?: number;
    net_payout?: number;
    orders?: number;
    returns?: number;
    margin_pct?: number;
    ad_spend?: number;
    drr_pct?: number;
    top_sku?: string;
    top_revenue?: number;
  };
  created_at: string;
}

export async function getLatestReport(): Promise<WeeklyReport | null> {
  const data = await apiRequest('/api/reports/latest');
  return data.report ?? null;
}

export async function listReports(limit = 12): Promise<WeeklyReport[]> {
  const data = await apiRequest(`/api/reports?limit=${limit}`);
  return data.reports ?? [];
}

export async function generateReport(): Promise<WeeklyReport> {
  const data = await apiRequest('/api/reports/generate', { method: 'POST' });
  return data.report;
}

// ── Smart Price ───────────────────────────────────────────────────────────

export interface SmartPriceResult {
  sku: string;
  currentPrice: number;
  recommendedPrice: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  data: {
    avgCompPrice: number | null;
    minCompPrice: number | null;
    competitorCount: number;
    monthlySales: number;
    avgSalePrice: number;
    cpo: number;
  };
}

export async function getSmartPrice(sku: string, connectionId?: string): Promise<SmartPriceResult> {
  const q = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : '';
  return apiRequest(`/api/products/${encodeURIComponent(sku)}/smart-price${q}`);
}

// ── Notifications Badge ───────────────────────────────────────────────────

export async function getUnreadCount(): Promise<number> {
  try {
    const data = await apiRequest('/api/notifications?limit=1&unread_only=true');
    return data.unread_count ?? 0;
  } catch {
    return 0;
  }
}

// ── Unit Economics Calculator ─────────────────────────────────────────────

export interface UnitEconInput {
  sellingPrice: number;
  cogs: number;
  logistics: number;
  commissionPct: number;
  returnRatePct: number;
  adSpendPerUnit: number;
  monthlyVolume?: number;
}

export interface UnitEconResult {
  grossRevenue: number;
  marketplaceFee: number;
  returnCost: number;
  adSpend: number;
  totalCosts: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
  breakEvenVolume: number;
  roiPct: number;
  monthlyProfit?: number;
  annualProfit?: number;
}

export async function calculateUnitEconomics(input: UnitEconInput): Promise<UnitEconResult> {
  const data = await apiRequest('/api/calculator/unit-economics', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.result;
}

// ── Niche Explorer ────────────────────────────────────────────────────────

export interface NicheCompetitor {
  name: string;
  brand: string;
  price: number;
  salePrice: number;
  rating: number;
  reviews: number;
}

export interface NicheAnalysis {
  summary: string;
  competitionLevel: 'low' | 'medium' | 'high';
  competitionReason: string;
  entryPrice: number;
  entryPriceReason: string;
  marginPotential: 'low' | 'medium' | 'high';
  topBrands: string[];
  strategy: string;
  opportunities: string[];
  warnings: string[];
}

export interface NicheSearchResult {
  keyword: string;
  platform: string;
  competitorsCount: number;
  priceRange: { min: number; max: number; avg: number };
  avgRating: number;
  topCompetitors: NicheCompetitor[];
  competitors: NicheCompetitor[];
  analysis: NicheAnalysis | null;
  priceDistribution: Array<{ label: string; count: number }>;
}

export async function searchNiche(q: string, platform = 'wb', limit = 50): Promise<NicheSearchResult> {
  return apiRequest(`/api/niche/search?q=${encodeURIComponent(q)}&platform=${platform}&limit=${limit}`);
}

// ── Custom Alert Rules ────────────────────────────────────────────────────

export type CustomRuleType = 'stock_low' | 'price_change' | 'rating_drop' | 'drr_high' | 'no_sales' | 'review_rate_low';
export type ComparisonOp = 'lt' | 'gt' | 'lte' | 'gte' | 'change_pct';

export interface CustomAlertRule {
  id: string;
  name: string;
  rule_type: CustomRuleType;
  condition: { platform?: string; sku?: string; days?: number };
  threshold: number;
  comparison: ComparisonOp;
  enabled: boolean;
  last_fired_at: string | null;
  fire_count: number;
  created_at: string;
}

export async function getCustomAlertRules(): Promise<CustomAlertRule[]> {
  const data = await apiRequest('/api/alerts/custom-rules');
  return data.rules;
}

export async function createCustomAlertRule(body: {
  name: string;
  rule_type: CustomRuleType;
  condition?: Record<string, unknown>;
  threshold: number;
  comparison?: ComparisonOp;
}): Promise<CustomAlertRule> {
  const data = await apiRequest('/api/alerts/custom-rules', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.rule;
}

export async function updateCustomAlertRule(id: string, patch: Partial<{
  name: string;
  condition: Record<string, unknown>;
  threshold: number;
  comparison: ComparisonOp;
  enabled: boolean;
}>): Promise<CustomAlertRule> {
  const data = await apiRequest(`/api/alerts/custom-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return data.rule;
}

export async function deleteCustomAlertRule(id: string): Promise<void> {
  await apiRequest(`/api/alerts/custom-rules/${id}`, { method: 'DELETE' });
}

// ── Global Search ─────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  label: string;
  platform: string | null;
  type: 'product' | 'scenario' | 'connection' | 'return';
  href: string;
}

export async function globalSearch(q: string): Promise<SearchResult[]> {
  if (!q || q.length < 2) return [];
  const data = await apiRequest(`/api/search?q=${encodeURIComponent(q)}`);
  return data.results;
}

// ── Returns AI Analysis ───────────────────────────────────────────────────

export interface ReturnAIInsight {
  type: 'warning' | 'tip' | 'success';
  title: string;
  text: string;
}

export interface ReturnAIAnalysis {
  summary: string;
  insights: ReturnAIInsight[];
  top_problem_sku: string | null;
  recommended_actions: string[];
}

export async function analyzeReturns(): Promise<ReturnAIAnalysis> {
  return apiRequest('/api/returns/analyze', { method: 'POST' });
}

// ── ABC Analysis ──────────────────────────────────────────────────────────

export type AbcClass = 'A' | 'B' | 'C';

export interface AbcItem {
  platform: string;
  sku: string;
  title: string | null;
  avg_rating: number | null;
  revenue: number;
  net_payout: number;
  qty: number;
  ad_spend: number;
  net_profit: number | null;
  margin_pct: number | null;
  drr_pct: number;
  rev_share: number;
  cum_pct: number;
  abc_class: AbcClass;
}

export interface AbcResult {
  items: AbcItem[];
  summary: { a: number; b: number; c: number; total_revenue: number };
}

export async function getAbcAnalysis(period: '30d' | '60d' | '90d' = '30d'): Promise<AbcResult> {
  return apiRequest(`/api/analytics/abc?period=${period}`);
}

// ── Reviews Bulk Reply ────────────────────────────────────────────────────

export interface BulkReplyResult {
  processed: number;
  total: number;
  results: Array<{ id: string; reply: string | null; ok: boolean }>;
  message?: string;
}

export async function bulkReplyReviews(limit = 10): Promise<BulkReplyResult> {
  return apiRequest(`/api/reviews/bulk-reply?limit=${limit}`, { method: 'POST' });
}

// ── Revenue Calendar ──────────────────────────────────────────────────────

export interface CalendarDay {
  date: string;
  revenue: number;
  net_payout: number;
  qty: number;
  intensity: number; // 0-4
}

export interface CalendarData {
  year: number;
  month: number;
  days: CalendarDay[];
  max_revenue: number;
}

export async function getRevenueCalendar(year: number, month: number): Promise<CalendarData> {
  return apiRequest(`/api/analytics/calendar?year=${year}&month=${month}`);
}

// ── Finance Forecast ──────────────────────────────────────────────────────

export interface ForecastDay {
  date: string;
  revenue: number;
  lower: number;
  upper: number;
}

export interface FinanceForecast {
  actual: Array<{ date: string; revenue: number }>;
  forecast: ForecastDay[];
  trend: number;
  avg_30d: number;
  avg_prev_30d: number;
  change_pct: number;
  forecast_30d_total: number;
  message?: string;
}

export async function getFinanceForecast(): Promise<FinanceForecast> {
  return apiRequest('/api/finance/forecast');
}

// ── Suppliers ─────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  lead_time_days: number;
  min_order_qty: number | null;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
}

export async function getSuppliers(): Promise<Supplier[]> {
  const data = await apiRequest('/api/supply/suppliers');
  return data.suppliers;
}

export async function createSupplier(body: Partial<Supplier> & { name: string }): Promise<Supplier> {
  const data = await apiRequest('/api/supply/suppliers', { method: 'POST', body: JSON.stringify(body) });
  return data.supplier;
}

export async function updateSupplier(id: string, patch: Partial<Supplier>): Promise<Supplier> {
  const data = await apiRequest(`/api/supply/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  return data.supplier;
}

export async function deleteSupplier(id: string): Promise<void> {
  await apiRequest(`/api/supply/suppliers/${id}`, { method: 'DELETE' });
}

// ── Dead Stock ────────────────────────────────────────────────────────────────

export interface DeadStockItem {
  sku: string;
  platform: string;
  warehouse_type: string;
  title: string;
  stock: number;
  purchase_price: number;
  capital_tied_up: number;
  units_sold: number;
  days_since_last_sale: number | null;
  recommendation: string;
}

export interface DeadStockResult {
  items: DeadStockItem[];
  total_capital: number;
}

export async function getDeadStock(opts?: { threshold?: number; days?: number }): Promise<DeadStockResult> {
  const p = new URLSearchParams();
  if (opts?.threshold != null) p.set('threshold', String(opts.threshold));
  if (opts?.days != null) p.set('days', String(opts.days));
  return apiRequest(`/api/supply/dead-stock?${p}`);
}

// ── Competitor Tracking ───────────────────────────────────────────────────────

export interface CompetitorPricePoint {
  price: number;
  scraped_at: string;
  rating: number;
  reviews_count: number;
}

export interface CompetitorSku {
  id: string;
  platform: string;
  external_id: string;
  name: string | null;
  brand: string | null;
  our_sku: string | null;
  alert_pct: number;
  last_price: number | null;
  last_scraped_at: string | null;
  history: CompetitorPricePoint[];
  created_at: string;
}

export async function getCompetitors(): Promise<CompetitorSku[]> {
  const data = await apiRequest('/api/competitors');
  return data.competitors;
}

export async function addCompetitor(body: { platform: string; external_id: string; our_sku?: string; alert_pct?: number }): Promise<CompetitorSku> {
  const data = await apiRequest('/api/competitors', { method: 'POST', body: JSON.stringify(body) });
  return data.competitor;
}

export async function updateCompetitor(id: string, patch: { alert_pct?: number; our_sku?: string }): Promise<CompetitorSku> {
  const data = await apiRequest(`/api/competitors/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.competitor;
}

export async function deleteCompetitor(id: string): Promise<void> {
  await apiRequest(`/api/competitors/${id}`, { method: 'DELETE' });
}

export async function scrapeAllCompetitors(): Promise<{ updated: number }> {
  return apiRequest('/api/competitors/scrape-all', { method: 'POST' });
}

// ── Product AI Audit ─────────────────────────────────────────────────────────

export interface AuditQuickWin {
  action: string;
  impact: 'высокий' | 'средний' | 'низкий';
  effort: 'низкий' | 'средний' | 'высокий';
}

export interface ProductAudit {
  score: number;
  title_issues: string[];
  title_suggestion: string;
  description_tips: string[];
  keyword_gaps: string[];
  quick_wins: AuditQuickWin[];
  summary: string;
}

export async function auditProduct(sku: string, platform?: string): Promise<{ sku: string; audit: ProductAudit }> {
  const p = platform ? `?platform=${encodeURIComponent(platform)}` : '';
  return apiRequest(`/api/products/${encodeURIComponent(sku)}/audit${p}`, { method: 'POST' });
}

// ── Promo Events ─────────────────────────────────────────────────────────────

export interface PromoEvent {
  id: string;
  name: string;
  platform: string | null;
  skus: string[];
  starts_at: string;
  ends_at: string;
  discount_pct: number | null;
  promo_type: 'sale' | 'flash' | 'wb_promo' | 'ozon_promo' | 'custom';
  notes: string | null;
  created_at: string;
}

export interface PromoCompare {
  event: PromoEvent;
  window_days: number;
  before: { from: string; to: string; revenue: number; quantity: number; avg_price: number; sku_count: number };
  during: { from: string; to: string; revenue: number; quantity: number; avg_price: number; sku_count: number };
  revenue_lift_pct: number | null;
  quantity_lift_pct: number | null;
  daily: { date: string; revenue: number; quantity: number }[];
  promo_start: string;
}

export async function getPromoEvents(): Promise<PromoEvent[]> {
  const data = await apiRequest('/api/promo');
  return data.events;
}

export async function createPromoEvent(body: Omit<PromoEvent, 'id' | 'created_at'>): Promise<PromoEvent> {
  const data = await apiRequest('/api/promo', { method: 'POST', body: JSON.stringify(body) });
  return data.event;
}

export async function updatePromoEvent(id: string, patch: Partial<PromoEvent>): Promise<PromoEvent> {
  const data = await apiRequest(`/api/promo/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  return data.event;
}

export async function deletePromoEvent(id: string): Promise<void> {
  await apiRequest(`/api/promo/${id}`, { method: 'DELETE' });
}

export async function getPromoCompare(id: string): Promise<PromoCompare> {
  return apiRequest(`/api/promo/${id}/compare`);
}

// ── SKU Scoreboard ───────────────────────────────────────────────────────────

export interface ScoreboardItem {
  rank: number;
  sku: string;
  platform: string;
  title: string;
  score: number;
  revenue: number;
  qty: number;
  daily_velocity: number;
  avg_price: number;
  purchase_price: number | null;
  margin_pct: number | null;
  return_count: number;
  return_rate_pct: number;
}

export async function getScoreboard(period?: string): Promise<{ items: ScoreboardItem[]; period: string; days: number }> {
  const p = period ? `?period=${period}` : '';
  return apiRequest(`/api/analytics/scoreboard${p}`);
}

// ── Warehouse CSV ─────────────────────────────────────────────────────────────

export async function importPurchasePriceCsv(file: File): Promise<{ updated: number; errors: string[] }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ng_token') : null;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/warehouse/catalog/import-csv`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getWarehouseCsvExportUrl(): string {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ng_token') : '';
  return `${API_URL}/api/warehouse/catalog/export-csv?token=${token}`;
}

// ── Telegram ──────────────────────────────────────────────────────────────────

export interface TelegramConnection {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  notify_alerts: boolean;
  notify_orders: boolean;
  notify_pnl: boolean;
  notify_low_stock: boolean;
  notify_competitors: boolean;
  is_active: boolean;
  connected_at: string;
}

export interface TelegramConnectInfo {
  token: string;
  command: string;
  bot_url: string;
}

export async function getTelegramConnection(): Promise<TelegramConnection | null> {
  const data = await apiRequest('/api/telegram/connection');
  return data ?? null;
}

export async function getTelegramConnectToken(): Promise<TelegramConnectInfo> {
  return apiRequest('/api/telegram/connect-token', { method: 'POST' });
}

export const generateTelegramToken = getTelegramConnectToken;

export async function updateTelegramSettings(settings: Partial<TelegramConnection>): Promise<void> {
  await apiRequest('/api/telegram/settings', { method: 'PUT', body: JSON.stringify(settings) });
}

export async function disconnectTelegram(): Promise<void> {
  await apiRequest('/api/telegram/connection', { method: 'DELETE' });
}

export async function sendTelegramTest(): Promise<void> {
  await apiRequest('/api/telegram/test', { method: 'POST' });
}

// ── AI Price Optimizer ────────────────────────────────────────────────────────

export interface PriceOptimizeSuggestion {
  suggested_price: number;
  price_range: { min: number; max: number };
  reasoning: string;
  strategy: 'premium' | 'competitive' | 'penetration' | 'value';
  expected_margin_pct: number | null;
  caution: string | null;
}

export interface PriceOptimizeResult {
  sku: string;
  platform: string | null;
  title: string;
  current_price: number | null;
  purchase_price: number | null;
  margin_pct: number | null;
  competitors: { name: string | null; platform: string; last_price: number }[];
  suggestion: PriceOptimizeSuggestion | null;
  raw?: string;
}

export async function optimizePrice(sku: string, platform?: string): Promise<PriceOptimizeResult> {
  return apiRequest('/api/autopilot/optimize-price', {
    method: 'POST',
    body: JSON.stringify({ sku, platform }),
  });
}

// ── Purchase Order ────────────────────────────────────────────────────────────

export interface PurchaseOrderItem {
  sku: string;
  platform: string;
  title: string;
  current_stock: number;
  daily_velocity: number;
  days_of_stock: number | null;
  purchase_price: number | null;
  revenue_30d: number;
  supplier_name: string | null;
  lead_time_days: number | null;
  suggested_qty: number | null;
  total_cost: number | null;
  urgent: boolean;
}

export interface PurchaseOrderResult {
  items: PurchaseOrderItem[];
  total_cost: number;
  urgent_count: number;
  reorder_days: number;
  target_days: number;
}

export async function getPurchaseOrder(opts?: { reorder_days?: number; target_days?: number }): Promise<PurchaseOrderResult> {
  const p = new URLSearchParams();
  if (opts?.reorder_days) p.set('reorder_days', String(opts.reorder_days));
  if (opts?.target_days)  p.set('target_days',  String(opts.target_days));
  const q = p.toString() ? '?' + p.toString() : '';
  return apiRequest(`/api/supply/purchase-order${q}`);
}

export function getPurchaseOrderCsvUrl(opts?: { reorder_days?: number; target_days?: number }): string {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ng_token') : '';
  const p = new URLSearchParams({ ...(opts?.reorder_days ? { reorder_days: String(opts.reorder_days) } : {}), ...(opts?.target_days ? { target_days: String(opts.target_days) } : {}), token: token ?? '' });
  return `${API_URL}/api/supply/purchase-order/export-csv?${p.toString()}`;
}

// ── Reviews Analytics ────────────────────────────────────────────────────────

export interface ReviewsAnalytics {
  distribution: { rating: number; count: number }[];
  weekly_trend: { week: string; total: number; avg_rating: number }[];
  response_rate: { total: number; answered: number; published: number; pct: number };
  top_negative_keywords: { word: string; count: number }[];
}

export async function getReviewsAnalytics(): Promise<ReviewsAnalytics> {
  return apiRequest('/api/reviews/analytics');
}

// ── Advertising AI Optimizer ──────────────────────────────────────────────────

export interface AdCampaignStat {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  orders: number;
  impressions: number;
  clicks: number;
}

export interface AdSuggestion {
  campaign_id: string;
  action: 'pause' | 'boost' | 'reduce_budget' | 'change_bid' | 'add_negatives' | 'keep';
  reason: string;
  expected_impact: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AdAnalysis {
  overall_assessment: string;
  suggestions: AdSuggestion[];
  budget_reallocation: string | null;
  quick_wins: string[];
}

export interface AdOptimizeResult {
  campaigns: AdCampaignStat[];
  analysis: AdAnalysis | null;
  period: string;
  message?: string;
}

export async function analyzeAdCampaigns(period?: string): Promise<AdOptimizeResult> {
  const p = period ? `?period=${period}` : '';
  return apiRequest(`/api/advertising/ai-analyze${p}`, { method: 'POST' });
}

// ── P&L CSV export ─────────────────────────────────────────────────────────────

export function getPnlCsvUrl(period: string, platform?: string): string {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ng_token') : '';
  const p = new URLSearchParams({ period, token: token ?? '' });
  if (platform) p.set('platform', platform);
  return `${API_URL}/api/pnl/export-csv?${p.toString()}`;
}

// ── Watchlist ──────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  id: number;
  sku: string;
  platform: string;
  title: string | null;
  added_at: string;
  revenue: number;
  quantity: number;
  net_payout: number;
  purchase_price: number | null;
  margin_pct: number | null;
  stock_qty: number | null;
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const data = await apiRequest('/api/watchlist');
  return data.items ?? [];
}

export async function addToWatchlist(sku: string, platform: string, title?: string): Promise<WatchlistItem> {
  const data = await apiRequest('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ sku, platform, title }),
  });
  return data.item;
}

export async function removeFromWatchlist(id: number): Promise<void> {
  await apiRequest(`/api/watchlist/${id}`, { method: 'DELETE' });
}

// ── Lifecycle Classifier ──────────────────────────────────────────────────────

export type LifecycleStage = 'launch' | 'growth' | 'stable' | 'declining' | 'dead';

export interface LifecycleItem {
  sku: string;
  platform: string;
  title: string;
  stage: LifecycleStage;
  rev1: number;
  qty1: number;
  rev2: number;
  qty2: number;
  change_pct: number | null;
}

export async function getLifecycle(): Promise<LifecycleItem[]> {
  const data = await apiRequest('/api/analytics/lifecycle');
  return data.items ?? [];
}

// ── Finance period comparison ─────────────────────────────────────────────────

export interface FinanceSummaryRow {
  platform: string;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  cost_of_goods: number;
  gross_profit: number;
  margin_pct: number;
  quantity: number;
}

export async function getFinanceSummary(from: string, to: string): Promise<FinanceSummaryRow[]> {
  const data = await apiRequest(`/api/finance/summary?from=${from}&to=${to}`);
  return data.summary ?? [];
}

// ── Finance weekly trend ──────────────────────────────────────────────────────

export interface WeeklyTrendPoint {
  week: string;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  cost_of_goods: number;
  gross_profit: number;
  margin_pct: number | null;
}

export async function getFinanceWeeklyTrend(weeks?: number): Promise<WeeklyTrendPoint[]> {
  const q = weeks ? `?weeks=${weeks}` : '';
  const data = await apiRequest(`/api/finance/weekly-trend${q}`);
  return data.trend ?? [];
}

// ── Analytics day-of-week ─────────────────────────────────────────────────────

export interface DowPoint {
  dow: number;
  label: string;
  total_revenue: number;
  total_qty: number;
  avg_revenue: number;
  avg_qty: number;
  data_points: number;
}

export async function getAnalyticsDow(period?: string): Promise<DowPoint[]> {
  const q = period ? `?period=${period}` : '';
  const data = await apiRequest(`/api/analytics/dow${q}`);
  return data.dow ?? [];
}

// ── Activity feed ─────────────────────────────────────────────────────────────

export interface ActivityEvent {
  type: 'price_change' | 'scenario_run' | 'alert';
  id: string;
  ts: string;
  platform: string | null;
  sku: string | null;
  title: string | null;
  meta: Record<string, any>;
}

export async function getActivity(limit?: number): Promise<ActivityEvent[]> {
  const q = limit ? `?limit=${limit}` : '';
  const data = await apiRequest(`/api/activity${q}`);
  return data.events ?? [];
}

// ── Finance records by SKU ────────────────────────────────────────────────────
export interface SkuFinanceRecord {
  platform: string;
  quantity: number;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  net_payout: number;
  purchase_price: number | null;
  gross_profit: number | null;
}

export async function getFinanceRecordsBySku(sku: string, days = 90): Promise<SkuFinanceRecord[]> {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const data = await apiRequest(`/api/finance/records?from=${from}&to=${to}&sku=${encodeURIComponent(sku)}`);
  return data.records ?? [];
}

// ── Dashboard Recommendations ─────────────────────────────────────────────────

export interface DashboardRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  href: string;
  value?: string;
}

export async function getDashboardRecommendations(): Promise<DashboardRecommendation[]> {
  const data = await apiRequest('/api/dashboard/recommendations');
  return data.items ?? [];
}

// ── AI Launch Plan ────────────────────────────────────────────────────────────

export interface AiLaunchStep {
  step_order: number;
  day_start: number;
  day_end: number;
  type: string;
  title: string;
  description: string;
  budget_share_pct: number;
  expected_result: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AiLaunchPlan {
  summary: string;
  steps: AiLaunchStep[];
  budget_split: Record<string, number>;
  key_risks: string[];
}

export async function getAiLaunchPlan(params: {
  productName: string;
  platform: string;
  sku?: string;
  targetPosition?: number;
  targetSales?: number;
  budget?: number;
  days?: number;
}): Promise<{ plan: AiLaunchPlan }> {
  return apiRequest('/api/launch/ai-plan', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function applyAiLaunchPlan(campaignId: string, steps: AiLaunchStep[]): Promise<LaunchCampaign> {
  return apiRequest(`/api/launch/${campaignId}/apply-ai-plan`, {
    method: 'POST',
    body: JSON.stringify({ steps }),
  });
}

export interface SeoListingResult {
  title: string;
  description: string;
  bullets: string[];
  keywords: string[];
  seo_tips: string[];
  productName: string;
  platform: string;
}

export async function generateSeoListing(params: {
  productName: string;
  platform: string;
  category?: string;
  currentTitle?: string;
  keywords?: string[];
}): Promise<SeoListingResult> {
  return apiRequest('/api/seo/generate-listing', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface AnalyticsDigest {
  summary: string;
  highlights: string[];
  recommendations: string[];
  mood: 'positive' | 'neutral' | 'negative';
  current: { revenue: number; orders: number; net_payout: number; active_skus: number };
  previous: { revenue: number; orders: number; net_payout: number; active_skus: number };
  top_skus: Array<{ sku: string; platform: string; title: string; revenue: number; orders: number }>;
  generated_at: string;
}

export async function getAnalyticsDigest(): Promise<AnalyticsDigest> {
  return apiRequest('/api/analytics/ai-digest', { method: 'POST' });
}

export interface PromoAiAdvice {
  verdict: 'recommend' | 'caution' | 'not_recommend';
  verdict_label: string;
  reasoning: string;
  expected_lift_pct: number | null;
  suggested_discount_pct: number | null;
  risks: string[];
  actions: string[];
  event_id: number;
  generated_at: string;
}

export async function getPromoAiAdvice(id: number): Promise<PromoAiAdvice> {
  return apiRequest(`/api/promo/${id}/ai-advice`, { method: 'POST' });
}

export interface CompetitorAiSummary {
  positioning: 'leader' | 'competitive' | 'lagging' | 'mixed' | 'unknown';
  positioning_label: string;
  summary: string;
  advantages: string[];
  weaknesses: string[];
  strategy_tips: string[];
  competitors_count: number;
  generated_at: string;
}

export async function getCompetitorAiSummary(): Promise<CompetitorAiSummary> {
  return apiRequest('/api/competitors/ai-summary', { method: 'POST' });
}

export interface SupplyAiPlanItem {
  sku: string;
  platform: string;
  recommended_qty: number;
  urgency: 'critical' | 'high' | 'medium';
  reasoning: string;
  estimated_cost: number | null;
}

export interface SupplyAiPlan {
  summary: string;
  total_budget_estimate: number | null;
  priority_items: SupplyAiPlanItem[];
  timing_advice: string;
  risks: string[];
  actions: string[];
  forecast_count: number;
  generated_at: string;
}

export async function getSupplyAiPlan(): Promise<SupplyAiPlan> {
  return apiRequest('/api/supply/ai-plan', { method: 'POST' });
}

export interface LifecycleAiActionItem {
  sku: string;
  title: string;
  action: string;
  priority?: 'high' | 'medium';
}

export interface LifecycleAiResult {
  summary: string;
  stage_counts: { launch: number; growth: number; stable: number; declining: number; dead: number };
  total_skus: number;
  declining_actions: LifecycleAiActionItem[];
  dead_actions: LifecycleAiActionItem[];
  growth_tips: string[];
  overall_strategy: string;
  generated_at: string;
}

export async function getLifecycleAi(): Promise<LifecycleAiResult> {
  return apiRequest('/api/analytics/lifecycle-ai', { method: 'POST' });
}

export interface ScoreboardAiLaggardAction {
  sku: string;
  title: string;
  action: string;
  urgency: 'high' | 'medium';
}

export interface ScoreboardAiResult {
  summary: string;
  portfolio_health: 'excellent' | 'good' | 'mixed' | 'poor' | 'unknown';
  stars_tips: string[];
  mid_tips: string[];
  laggard_actions: ScoreboardAiLaggardAction[];
  overall_strategy: string;
  total_skus: number;
  stars_count: number;
  laggards_count: number;
  stars_revenue_pct: number;
  generated_at: string;
}

export async function getScoreboardAi(): Promise<ScoreboardAiResult> {
  return apiRequest('/api/analytics/scoreboard-ai', { method: 'POST' });
}

export interface ChatBriefingKpis {
  yesterday_revenue: number;
  yesterday_orders: number;
  week_revenue: number;
  week_orders: number;
  unread_alerts: number;
  critical_stock: number;
  top_sku: string | null;
  top_sku_revenue: number | null;
}

export interface ChatBriefing {
  briefing: string;
  kpis: ChatBriefingKpis;
  generated_at: string;
}

export async function getChatBriefing(): Promise<ChatBriefing> {
  return apiRequest('/api/chat/briefing', { method: 'POST' });
}

export interface PnlAiSkuAdvice {
  sku: string;
  title: string;
  diagnosis: string;
  action: string;
  priority: 'critical' | 'high' | 'medium';
}

export interface PnlAiDiagnostic {
  summary: string;
  health: 'healthy' | 'warning' | 'critical' | 'unknown';
  key_issues: string[];
  sku_advice: PnlAiSkuAdvice[];
  overall_actions: string[];
  counts: { losing: number; low_margin: number; unknown: number; profitable: number };
  period: string;
  generated_at: string;
}

export async function getPnlAiDiagnostic(period?: string): Promise<PnlAiDiagnostic> {
  return apiRequest('/api/pnl/ai-diagnostic', { method: 'POST', body: JSON.stringify({ period: period ?? '30d' }) });
}

export interface FinanceForecastWeek {
  week_label: string;
  projected_revenue: number;
  projected_payout: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface FinanceAiForecast {
  summary: string;
  trend_direction: 'growing' | 'stable' | 'declining' | 'volatile' | 'unknown';
  avg_weekly_revenue: number;
  forecast: FinanceForecastWeek[];
  risks: string[];
  opportunities: string[];
  weeks_analyzed: number;
  generated_at: string;
}

export async function getFinanceAiForecast(): Promise<FinanceAiForecast> {
  return apiRequest('/api/finance/ai-forecast', { method: 'POST' });
}

// ── Warehouse AI ─────────────────────────────────────────────────────────────
export interface WarehouseAiStockAdvice {
  sku: string;
  title: string;
  issue: string;
  action: string;
}

export interface WarehouseAiAnalysis {
  summary: string;
  overstock_advice: WarehouseAiStockAdvice[];
  understock_advice: WarehouseAiStockAdvice[];
  imbalance_advice: WarehouseAiStockAdvice[];
  actions: string[];
  total_skus: number;
  total_qty: number;
  zero_stock_count: number;
  overstock_count: number;
  understock_count: number;
  imbalance_count: number;
  generated_at: string;
}

export async function getWarehouseAiAnalysis(): Promise<WarehouseAiAnalysis> {
  return apiRequest('/api/warehouse/ai-analysis', { method: 'POST' });
}

// ── Activity AI ───────────────────────────────────────────────────────────────
export interface ActivityAiPattern {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ActivityAiPatterns {
  summary: string;
  patterns: ActivityAiPattern[];
  anomalies: string[];
  insights: string[];
  actions: string[];
  total_events: number;
  type_counts: Record<string, number>;
  generated_at: string;
}

export async function getActivityAiPatterns(): Promise<ActivityAiPatterns> {
  return apiRequest('/api/activity/ai-patterns', { method: 'POST' });
}

// ── Orders AI ─────────────────────────────────────────────────────────────────
export interface OrdersAiTip {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface OrdersAiAdvisor {
  summary: string;
  bottlenecks: string[];
  tips: OrdersAiTip[];
  batch_advice: string;
  actions: string[];
  total_orders: number;
  pending_count: number;
  urgent_count: number;
  by_status: Record<string, number>;
  by_platform: Record<string, number>;
  generated_at: string;
}

export async function getOrdersAiAdvisor(): Promise<OrdersAiAdvisor> {
  return apiRequest('/api/orders/ai-advisor', { method: 'POST' });
}

// ── Automations AI ────────────────────────────────────────────────────────────
export interface AutomationAiItem {
  slug: string;
  status: 'ok' | 'warning' | 'error' | 'inactive';
  comment: string;
  action: string;
}

export interface AutomationsAiHealth {
  summary: string;
  health: 'good' | 'warning' | 'poor' | 'inactive';
  issues: string[];
  per_automation: AutomationAiItem[];
  actions: string[];
  enabled_count: number;
  error_count: number;
  disabled_count: number;
  never_ran: number;
  generated_at: string;
}

export async function getAutomationsAiHealth(): Promise<AutomationsAiHealth> {
  return apiRequest('/api/automations/ai-health', { method: 'POST' });
}

// ── Alerts AI ─────────────────────────────────────────────────────────────────
export interface AlertAiNoisyRule {
  name: string;
  type: string;
  issue: string;
  suggestion: string;
}

export interface AlertAiMissing {
  type: string;
  reason: string;
  suggested_threshold: number | null;
}

export interface AlertAiThresholdAdj {
  name: string;
  current_threshold: string;
  suggested_threshold: string;
  reason: string;
}

export interface AlertsAiTune {
  summary: string;
  health: 'good' | 'noisy' | 'undermonitored' | 'unconfigured';
  noisy_rules: AlertAiNoisyRule[];
  silent_rules: AlertAiNoisyRule[];
  missing_suggestions: AlertAiMissing[];
  threshold_adjustments: AlertAiThresholdAdj[];
  actions: string[];
  total_rules: number;
  total_events_30d: number;
  generated_at: string;
}

export async function getAlertsAiTune(): Promise<AlertsAiTune> {
  return apiRequest('/api/alerts/ai-tune', { method: 'POST' });
}

// ── Calculator AI ─────────────────────────────────────────────────────────────
export interface CalcAiOptimization {
  lever: string;
  potential: string;
  action: string;
}

export interface CalcAiAdvice {
  summary: string;
  verdict: 'healthy' | 'warning' | 'critical' | 'loss';
  verdict_label: string;
  main_issues: string[];
  optimizations: CalcAiOptimization[];
  pricing_advice: string;
  benchmark: string;
  computed: { net_margin_pct: number; net_profit: number; roi_pct: number };
  generated_at: string;
}

export async function getCalcAiAdvice(input: UnitEconInput & Partial<UnitEconResult>): Promise<CalcAiAdvice> {
  return apiRequest('/api/calculator/ai-advice', { method: 'POST', body: JSON.stringify(input) });
}

// ── Invoices & Acts ───────────────────────────────────────────────────────────

export interface BankInvoice {
  id: string;
  invoice_number: string;
  plan: string;
  months: number;
  amount: string;
  status: 'pending' | 'paid' | 'cancelled';
  payer_name?: string;
  created_at: string;
  paid_at?: string;
}

export interface ServiceAct {
  id: string;
  act_number: string;
  period_from: string;
  period_to: string;
  amount: string;
  created_at: string;
}

export async function getInvoices(): Promise<{ invoices: BankInvoice[] }> {
  return apiRequest('/api/invoices/');
}

export async function requestInvoice(plan: 'start' | 'business', months: number, payerName?: string) {
  return apiRequest('/api/invoices/request', {
    method: 'POST',
    body: JSON.stringify({ plan, months, payer_name: payerName }),
  });
}

export async function cancelInvoice(id: string) {
  return apiRequest(`/api/invoices/${id}`, { method: 'DELETE' });
}

export function getInvoiceHtmlUrl(id: string): string {
  return `${API_URL}/api/invoices/${id}/html`;
}

export async function getActs(): Promise<{ acts: ServiceAct[] }> {
  return apiRequest('/api/acts/');
}

export function getActHtmlUrl(id: string): string {
  return `${API_URL}/api/acts/${id}/html`;
}

// ---- Billing profile ----

export interface BillingProfile {
  user_id: string;
  company_name?: string;
  unp?: string;
  legal_address?: string;
  iban?: string;
  bank_name?: string;
  bic?: string;
  contact_person?: string;
  phone?: string;
  billing_email?: string;
  updated_at?: string;
}

export async function getBillingProfile(): Promise<{ profile: BillingProfile | null }> {
  return apiRequest('/api/profile/billing');
}

export async function updateBillingProfile(data: Partial<BillingProfile>): Promise<{ profile: BillingProfile }> {
  return apiRequest('/api/profile/billing', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function autofillBillingProfile(platform: 'wb' | 'ozon'): Promise<{ profile: Partial<BillingProfile> }> {
  return apiRequest(`/api/profile/billing/autofill/${platform}`);
}

// ---- Support tickets ----

export interface SupportTicket {
  id: string;
  topic: string;
  subject: string;
  message?: string;
  status: 'open' | 'replied' | 'closed';
  created_at: string;
  updated_at: string;
  reply_count?: number;
  user_email?: string;
  guest_email?: string;
}

export interface SupportReply {
  id: string;
  is_admin: boolean;
  message: string;
  created_at: string;
  author_email?: string;
}

export const SUPPORT_TOPICS: { value: string; label: string }[] = [
  { value: 'tech',      label: 'Техническая проблема' },
  { value: 'billing',   label: 'Вопрос по оплате / тарифу' },
  { value: 'feature',   label: 'Предложение по улучшению' },
  { value: 'complaint', label: 'Жалоба' },
  { value: 'other',     label: 'Другое' },
];

export async function createSupportTicket(data: {
  topic: string; subject: string; message: string; email?: string;
}): Promise<{ ticket: SupportTicket }> {
  return apiRequest('/api/support', { method: 'POST', body: JSON.stringify(data) });
}

export async function getSupportTickets(): Promise<{ tickets: SupportTicket[] }> {
  return apiRequest('/api/support');
}

export async function getSupportTicket(id: string): Promise<{ ticket: SupportTicket; replies: SupportReply[] }> {
  return apiRequest(`/api/support/${id}`);
}

export async function replySupportTicket(id: string, message: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/support/${id}/reply`, { method: 'POST', body: JSON.stringify({ message }) });
}

// Admin
export async function adminGetSupportTickets(status?: string): Promise<{ tickets: SupportTicket[] }> {
  const q = status ? `?status=${status}` : '';
  return apiRequest(`/api/admin/support${q}`);
}

export async function adminGetSupportTicket(id: string): Promise<{ ticket: SupportTicket; replies: SupportReply[] }> {
  return apiRequest(`/api/admin/support/${id}`);
}

export async function adminReplySupportTicket(
  id: string, message: string, new_status = 'replied',
): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/support/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ message, new_status }),
  });
}

export async function adminSetSupportStatus(id: string, status: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/support/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

// ── Referrals & Promo codes ───────────────────────────────────────────────────
export interface ReferralStats {
  referral_code: string;
  referred_count: number;
  total_earned: number;
  commission_pct: number;
  recent_earnings: {
    earned_amount: number;
    topup_amount: number;
    referred_email: string;
    created_at: string;
  }[];
}

export async function getReferralStats(): Promise<ReferralStats> {
  return apiRequest('/api/referrals/stats');
}

export async function applyPromoCode(code: string): Promise<{ ok: boolean; reward_amount: number; description?: string }> {
  return apiRequest('/api/referrals/apply-promo', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// Admin promo codes
export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  reward_type: string;
  reward_amount: number;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export async function adminGetPromoCodes(): Promise<{ promo_codes: PromoCode[] }> {
  return apiRequest('/api/admin/promo-codes');
}

export async function adminCreatePromoCode(data: {
  code: string;
  description?: string;
  reward_amount: number;
  max_uses?: number;
  expires_at?: string;
}): Promise<{ ok: boolean; promo_code: PromoCode }> {
  return apiRequest('/api/admin/promo-codes', { method: 'POST', body: JSON.stringify(data) });
}

export async function adminTogglePromoCode(id: string, is_active: boolean): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/promo-codes/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active }) });
}

export async function adminDeletePromoCode(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/promo-codes/${id}`, { method: 'DELETE' });
}

export async function adminGetReferrals(): Promise<{ referrals: { referrer_email: string; referral_code: string; referred_count: number; total_earned: number }[] }> {
  return apiRequest('/api/admin/referrals');
}

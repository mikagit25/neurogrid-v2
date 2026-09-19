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

export async function topupWallet(amount: number): Promise<{ requestId: string; redirectUrl: string }> {
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

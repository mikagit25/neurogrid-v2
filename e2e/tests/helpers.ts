import { Page } from '@playwright/test';

const API = 'http://localhost:4001';

export async function loginAs(page: Page, email: string, password: string): Promise<string> {
  const resp = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json() as { token: string };
  const token = data.token;

  // Inject token into localStorage so the app treats us as logged in
  await page.goto('/');
  await page.evaluate((t) => localStorage.setItem('ng_token', t), token);
  return token;
}

export async function createDemoSession(): Promise<{ token: string; userId: string }> {
  const resp = await fetch(`${API}/api/auth/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await resp.json() as { token: string; user: { id: string } };
  return { token: data.token, userId: data.user.id };
}

export async function loginWithToken(page: Page, token: string) {
  await page.goto('/');
  await page.evaluate((t) => {
    localStorage.setItem('ng_token', t);
  }, token);
}

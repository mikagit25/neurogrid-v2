import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:4001';

async function getAdminToken(): Promise<string> {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@neurogrid.network', password: 'Admin2026!' }),
  });
  const d = await r.json() as { token: string };
  return d.token;
}

async function proxyApiToLocal(page: Page): Promise<void> {
  await page.route('https://api.neurogrid.network/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
          'access-control-allow-headers': 'Content-Type,Authorization',
        },
        body: '',
      });
      return;
    }
    const u = new URL(req.url());
    const localUrl = API + u.pathname + u.search;
    const postData = req.postData();
    const auth = req.headers()['authorization'];
    try {
      const r = await fetch(localUrl, {
        method: req.method(),
        headers: {
          'content-type': 'application/json',
          ...(auth ? { authorization: auth } : {}),
        },
        body: req.method() !== 'GET' && postData ? postData : undefined,
      });
      const buf = await r.arrayBuffer();
      await route.fulfill({
        status: r.status,
        headers: {
          'content-type': r.headers.get('content-type') ?? 'application/json',
          'access-control-allow-origin': '*',
        },
        body: Buffer.from(buf),
      });
    } catch {
      await route.abort('failed');
    }
  });
}

test.describe('Finance / P&L', () => {
  test('finance API returns numeric types for all fields', async () => {
    const token = await getAdminToken();
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);

    const r = await fetch(`${API}/api/finance/summary?from=${from}&to=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json() as { summary: any[] };

    for (const row of data.summary ?? []) {
      expect(typeof row.revenue,    `revenue should be number, got ${typeof row.revenue}`).toBe('number');
      expect(typeof row.commission, `commission should be number, got ${typeof row.commission}`).toBe('number');
      expect(typeof row.logistics,  `logistics should be number, got ${typeof row.logistics}`).toBe('number');
      expect(typeof row.penalty,    `penalty should be number, got ${typeof row.penalty}`).toBe('number');
      const total = row.commission + row.logistics + row.penalty;
      expect(Number.isNaN(total), `sum of deductions is NaN for ${row.platform}`).toBe(false);
      expect(total).toBeLessThan(row.revenue);
    }
  });

  test('finance page loads without NaN for admin', async ({ page }) => {
    const token = await getAdminToken();
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('ng_token', t), token);

    await page.goto('/finance');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN%');
    expect(bodyText).not.toContain('NaN ₽');
  });

  test('finance page loads without NaN for demo session', async ({ page }) => {
    const resp = await fetch(`${API}/api/auth/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!resp.ok) { test.skip(true, 'Demo rate-limited'); return; }
    const { token, user } = await resp.json() as { token: string; user: any };

    const storedUser = {
      id: user.id, email: user.email, balance: Number(user.balance),
      isAdmin: user.is_admin ?? false, isDemo: user.is_demo,
      demoExpiresAt: user.demo_expires_at,
    };
    await proxyApiToLocal(page);
    await page.addInitScript(([t, u]: [string, string]) => {
      localStorage.setItem('ng_token', t);
      localStorage.setItem('ng_user', u);
    }, [token, JSON.stringify(storedUser)]);

    await page.goto('/finance');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN%');
    expect(bodyText).not.toContain('NaN ₽');
    const hasNumbers = /[1-9][\d\s]{3,}/.test(bodyText);
    expect(hasNumbers).toBe(true);
  });

  test('cost structure shows valid percentages', async ({ page }) => {
    const token = await getAdminToken();
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('ng_token', t), token);
    await page.goto('/finance');
    await page.waitForLoadState('networkidle');

    if (await page.locator('text=Нужен тариф').count() > 0) {
      test.skip(true, 'Finance gated by subscription'); return;
    }

    const bodyText = await page.locator('body').innerText();
    const pctMatches = bodyText.match(/[\d.]+%/g) ?? [];
    for (const pct of pctMatches) {
      expect(pct).not.toBe('NaN%');
    }
  });
});

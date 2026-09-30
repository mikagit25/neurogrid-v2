import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:4001';

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

test.describe('Products / Catalog', () => {
  test('products API returns mixed score distribution for demo', async () => {
    const resp = await fetch(`${API}/api/auth/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!resp.ok) { test.skip(true, 'Demo rate-limited'); return; }
    const { token } = await resp.json() as { token: string };

    const r = await fetch(`${API}/api/products?limit=30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json() as { summary: any; products: any[] };
    const { summary } = data;

    expect(summary.total).toBeGreaterThan(0);
    const goodCount = (summary.good ?? 0) + (summary.excellent ?? 0);
    expect(goodCount).toBeGreaterThan(0);
    expect(summary.avgScore).toBeGreaterThan(20);
  });

  test('dashboard loads and shows product score', async ({ page }) => {
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

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const scoreLocator = page.locator('text=/\\d+\\/100/').first();
    await expect(scoreLocator).toBeVisible({ timeout: 10000 });
    const scoreText = await scoreLocator.textContent();
    const match = scoreText?.match(/(\d+)\/100/);
    if (match) {
      expect(parseInt(match[1], 10)).toBeGreaterThan(20);
    }
  });
});

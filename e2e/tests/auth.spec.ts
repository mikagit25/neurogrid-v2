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

test.describe('Auth', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'NeuroGrid' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('register page has both consent checkboxes', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2);
    const submitBtn = page.getByRole('button', { name: /зарегистрироваться/i });
    await expect(submitBtn).toBeDisabled();
    await checkboxes.nth(0).check();
    await expect(submitBtn).toBeDisabled();
    await checkboxes.nth(1).check();
    await expect(submitBtn).toBeEnabled();
  });

  test('wrong password returns error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@neurogrid.network');
    await page.locator('input[type="password"]').fill('wrongpass');
    await page.getByRole('button', { name: /войти/i }).click();
    await expect(page.locator('[class*="red"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('admin login redirects to dashboard', async ({ page }) => {
    await proxyApiToLocal(page);
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@neurogrid.network');
    await page.locator('input[type="password"]').fill('Admin2026!');
    await page.getByRole('button', { name: /войти/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(page).toHaveURL(/dashboard/);
  });
});

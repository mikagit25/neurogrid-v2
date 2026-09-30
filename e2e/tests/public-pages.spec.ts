import { test, expect } from '@playwright/test';

const PUBLIC_PAGES = ['/', '/login', '/register', '/oferta', '/privacy', '/terms'];

test.describe('Public pages', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} loads without JS crash`, async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', err => jsErrors.push(err.message));

      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');

      // No hard JS crashes (ignore React hydration warnings)
      const hardErrors = jsErrors.filter(e => !e.includes('hydrat') && !e.includes('Hydrat'));
      expect(hardErrors).toHaveLength(0);

      const body = await page.locator('body').innerText();
      expect(body.length).toBeGreaterThan(50);
    });
  }

  test('/oferta contains legal entity УНП', async ({ page }) => {
    await page.goto('/oferta');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();
    expect(body).toContain('490556542'); // УНП реквизиты
  });

  test('/oferta contains WebPay payment operator clause', async ({ page }) => {
    await page.goto('/oferta');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();
    expect(body).toContain('WebPay');
  });

  test('/privacy contains payment-partner section with WebPay', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();
    expect(body).toContain('WebPay');
    expect(body).toMatch(/152/);  // 152-FZ reference
  });

  test('/register has two consent checkboxes', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2);
  });
});

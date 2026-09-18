import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Blueprint leads with profile; setup tools stay disclosed at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const writes = [];
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/blueprint/trpc/card*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: null } }) }),
    );
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
    });
    await bootShell(page, '/blueprint');
    await expect(page.getByRole('heading', { name: 'My blueprint', exact: true })).toBeVisible();
    await expect(page.locator('#ix-blueprint-key')).not.toBeVisible({ timeout: 2000 });
    await expect(page.getByRole('heading', { name: 'Share card', exact: true })).not.toBeVisible({ timeout: 2000 });
    expect((await page.getByRole('heading', { name: 'My blueprint', exact: true }).boundingBox()).y).toBeLessThan(440);
    await page.locator('#blueprint-onboard > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#ix-blueprint-key')).toBeVisible();
    await page.locator('#ix-blueprint-key').fill('unsaved-answer');
    await page.locator('#blueprint-onboard > summary').click();
    await page.locator('#blueprint-onboard > summary').click();
    await expect(page.locator('#ix-blueprint-key')).toHaveValue('unsaved-answer');
    await page.locator('#blueprint-tools > summary').click();
    await expect(page.getByRole('heading', { name: 'Share card', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('body')).not.toContainText('$0');
    expect(writes).toEqual([]);
  });
}

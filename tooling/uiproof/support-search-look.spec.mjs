import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Support search leads; ticket tools stay available at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const writes = [];
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/support/trpc/searchKb*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) }),
    );
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
    });
    await bootShell(page, '/support');
    await expect(page.getByRole('heading', { name: 'Search knowledge base', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'File a ticket', exact: true })).not.toBeVisible({ timeout: 2000 });
    expect((await page.getByRole('heading', { name: 'Search knowledge base', exact: true }).boundingBox()).y).toBeLessThan(280);
    await expect(page.getByText('No published articles match.', { exact: true })).toBeVisible();
    await expect(page.locator('.ix-workspace-partial')).toBeVisible();
    await page.locator('#support-actions > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'File a ticket', exact: true })).toBeVisible();
    await expect(page.getByText('The service returned an error', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('body')).not.toContainText('$0');
    expect(writes).toEqual([]);
  });
}

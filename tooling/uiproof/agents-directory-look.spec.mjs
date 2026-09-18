import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Agents leads with routes and log at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const writes = [];
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/agents/trpc/routes.list*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) }),
    );
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
    });
    await bootShell(page, '/agents');
    await expect(page.getByRole('heading', { name: 'Routing table', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Coach', exact: true })).not.toBeVisible({ timeout: 2000 });
    expect((await page.getByRole('heading', { name: 'Routing table', exact: true }).boundingBox()).y).toBeLessThan(340);
    await expect(page.getByText('The endpoint answered, and there is nothing in it yet.')).toBeVisible();
    await expect(page.locator('#agents-route-table')).toHaveCount(1);
    await page.locator('#agents-tools > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Coach', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('body')).not.toContainText('$0');
    expect(writes).toEqual([]);
  });
}

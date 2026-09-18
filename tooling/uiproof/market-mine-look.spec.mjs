import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`My market: one unavailable state, empty listings stay usable at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const writes = [];
    const copyReads = [];
    page.on('request', (request) => {
      if (request.url().includes('copyIntel.buildStats')) copyReads.push(request.url());
      if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
    });
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await bootShell(page, '/market/mine');
    await expect(page.locator('.ix-workspace[data-state="unavailable"]')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.ix-workspace-state')).toHaveCount(1);
    await expect(page.getByText('The service returned an error', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish strategy', exact: true })).not.toBeVisible();
    // The independent copy child remains mounted and still performs its own read.
    await expect.poll(() => copyReads.length).toBeGreaterThan(0);
    await page.locator('#market-strategy-tools > summary').click();
    await expect(page.getByRole('button', { name: 'Publish strategy', exact: true })).toBeVisible();
    const draft = page.locator('#market-strategy-tools input').first();
    await draft.fill('Unsaved strategy');
    await page.locator('#market-strategy-tools > summary').focus();
    await page.keyboard.press('Enter');
    await expect(draft).not.toBeVisible();
    await page.keyboard.press('Enter');
    await expect(draft).toHaveValue('Unsaved strategy');
    await expect(page.getByText('The service returned an error', { exact: true })).toBeVisible();
    await page.route('**/api/market/trpc/myListings*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) }),
    );
    await page.reload();
    await expect(page.locator('#market-my-listings')).toBeVisible();
    await expect(page.locator('#market-my-listings tbody tr')).toHaveCount(0);
    await expect(page.locator('.ix-workspace-partial')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create listing', exact: true })).not.toBeVisible();
    await page.locator('#market-create-listing > summary').click();
    await expect(page.getByRole('button', { name: 'Create listing', exact: true })).toBeVisible();
    expect((await page.locator('#market-my-listings').boundingBox()).y).toBeLessThan(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('body')).not.toContainText('$0');
    expect(writes).toEqual([]);
  });
}

import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Catalogue leads and proposal stays disclosed at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const writes = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(r.url());
    });
    await page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/market/trpc/listings*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) }),
    );
    await bootShell(page, '/market');
    await expect(page.getByRole('heading', { name: 'Listings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit proposal' })).not.toBeVisible({ timeout: 2000 });
    expect((await page.getByRole('heading', { name: 'Listings', exact: true }).boundingBox()).y).toBeLessThan(380);
    await expect(page.getByText('No listings are available.', { exact: true })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.locator('.ix-workspace-partial')).toBeVisible();
    await page.locator('#market-proposal > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Submit proposal' })).toBeVisible();
    const draft = page.locator('#market-proposal input').first();
    await draft.fill('Unsaved symbol');
    await page.locator('#market-proposal > summary').click();
    await page.locator('#market-proposal > summary').click();
    await expect(draft).toHaveValue('Unsaved symbol');
    await page.locator('#market-programme > summary').click();
    await expect(page.getByText('The service returned an error', { exact: true })).toBeVisible();
    expect(await page.locator('#market-listings').evaluate((el) => getComputedStyle(el).borderRightWidth)).toBe('0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('body')).not.toContainText('$0');
    expect(writes).toEqual([]);
  });
}

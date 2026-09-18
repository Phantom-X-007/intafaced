import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Platform directory: compact rows open a workspace at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const writes = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
    });
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await bootShell(page, '/platform');
    const links = page.locator('.platform-directory > a');
    await expect(links).toHaveCount(18);
    const bank = links.filter({ has: page.getByRole('heading', { name: 'Bank', exact: true }) });
    await expect(bank).toBeVisible();
    // Large promotional tiles fail this navigation density contract on both widths.
    expect((await bank.boundingBox()).height).toBeLessThanOrEqual(width === 390 ? 104 : 60);
    expect(await bank.evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe('0px');
    expect(await bank.evaluate((el) => getComputedStyle(el).borderRightWidth)).toBe('0px');
    for (const description of await links.locator('p').all()) await expect(description).toBeVisible();
    await bank.hover();
    await expect.poll(() => bank.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await bank.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(bank).toBeFocused();
    expect(await bank.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('body')).not.toContainText('$0');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/bank$/);
    await expect(page.locator('.ix-workspace[data-state="unavailable"]')).toBeVisible();
    expect(writes).toEqual([]);
  });
}

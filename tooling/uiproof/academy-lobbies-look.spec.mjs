import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Academy lobbies lead; host form preserves drafts at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const writes = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(r.url());
    });
    await page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await bootShell(page, '/academy');
    await expect(page.locator('.ix-workspace[data-state="unavailable"]')).toBeVisible();
    await page.route('**/api/academy/trpc/rooms*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) }),
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Lobbies', exact: true })).toBeVisible();
    await expect(page.locator('#ix-academy-create-slug')).not.toBeVisible({ timeout: 2000 });
    expect((await page.getByRole('heading', { name: 'Lobbies', exact: true }).boundingBox()).y).toBeLessThan(330);
    await expect(page.locator('#academy-lobbies tbody tr')).toHaveCount(0);
    await expect(page.locator('#academy-lobbies')).toContainText('The endpoint answered, and there is nothing in it yet.');
    await page.locator('#academy-create-room > summary').focus();
    await page.keyboard.press('Enter');
    await page.locator('#ix-academy-create-slug').fill('unsaved-room');
    await page.locator('#academy-create-room > summary').click();
    await page.locator('#academy-create-room > summary').click();
    await expect(page.locator('#ix-academy-create-slug')).toHaveValue('unsaved-room');
    await expect(page.getByRole('link', { name: 'Sign in to create a room' })).toBeVisible();
    expect(await page.locator('#academy-lobbies').evaluate((el) => getComputedStyle(el).borderRightWidth)).toBe('0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(writes).toEqual([]);
  });
}

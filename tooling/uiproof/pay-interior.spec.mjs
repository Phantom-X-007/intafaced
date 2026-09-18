import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Pay interior golden: compact operations and honest rails at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await bootShell(page, '/pay');
    await expect(page.locator('.ix-workspace[data-state="unavailable"]')).toBeVisible();
    const nav = await page.locator('.pay-overview > .ix-subnav').boundingBox();
    expect(nav.height, 'Module navigation stays one compact row').toBeLessThanOrEqual(48);
    const rows = page.locator('.pay-workspace-links > a');
    const first = await rows.nth(0).boundingBox();
    const second = await rows.nth(1).boundingBox();
    expect(second.y, 'Pay workspaces use operation rows').toBeGreaterThanOrEqual(first.y + first.height);
    await expect(page.getByText('No live payment rails', { exact: true })).toBeVisible();
    await expect(page.getByText('No live acquirer implied.', { exact: true })).toBeVisible();
    const last = await rows.last().boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual(width === 390 ? 844 : 900);
    await expect(page.locator('.pay-glance')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('$0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByText('Details', { exact: true }).click();
    await expect(page.getByText(/Failed reads are never converted to a zero balance/)).toBeVisible();
  });
}

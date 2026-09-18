import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Bank interior golden: compact workspace rows at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await bootShell(page, '/bank');
    await expect(page.locator('.ix-workspace[data-state="unavailable"]')).toBeVisible();
    await expect(page.getByText('Cards and ramps are simulated. No live issuer or payment rail.')).toBeVisible({ timeout: 2000 });
    const rows = page.locator('.bank-door');
    const first = await rows.nth(0).boundingBox();
    const second = await rows.nth(1).boundingBox();
    expect(second.y, 'Workspace links must be rows, not a tile grid').toBeGreaterThanOrEqual(first.y + first.height);
    expect(first.height, 'Workspace row target').toBeGreaterThanOrEqual(44);
    const last = await rows.last().boundingBox();
    expect(last.y + last.height, 'All Bank workspaces fit in the initial viewport').toBeLessThanOrEqual(width === 390 ? 844 : 900);
    await expect(page.locator('.bank-book-note')).toBeVisible();
    await expect(page.locator('.bank-glance')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('$0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

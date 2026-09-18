import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`P2P interior golden: offers lead, setup is disclosed at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await bootShell(page, '/p2p');
    await expect(page.locator('.ix-workspace[data-state="unavailable"]')).toBeVisible();
    await expect(page.locator('.ix-workspace-state')).toHaveCount(1);
    await expect(page.locator('#p2p-offers')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('$0');
    // An explicitly empty public offer list; ancillary reads remain unavailable.
    // No account, offer, price, balance or trade row is seeded.
    await page.route('**/api/p2p/trpc/offers.list*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [] } }) }),
    );
    await page.reload();
    await expect(page.locator('.ix-workspace.is-ready')).toBeAttached();
    await expect(page.locator('#p2p-offers')).toBeVisible();
    await expect(page.locator('#ix-p2p-create-asset')).not.toBeVisible({ timeout: 2000 });
    await page.locator('#p2p-create > summary').click();
    await expect(page.locator('#ix-p2p-create-asset')).toBeVisible();
    await expect(page.locator('.ix-workspace-partial')).toBeVisible();
    await expect(page.locator('#p2p-offers tbody tr')).toHaveCount(0);
    expect(await page.locator('#p2p-offers').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

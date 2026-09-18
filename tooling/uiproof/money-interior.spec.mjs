import { test, expect } from '@playwright/test';
import { bootShell, establishAuth, mockWalletAndOrdersDown } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Money interior golden: availability before service details at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await mockWalletAndOrdersDown(page);
    await bootShell(page, '/uc/money');
    await establishAuth(page);
    const state = page.locator('.ix-money-state');
    await expect(state).toContainText('Balances are unknown, not zero.');
    await expect(page.locator('.ix-money-source code')).not.toBeVisible();
    const heading = await state.locator('h2').boundingBox();
    expect(heading.y, 'Balance availability must be in the first 300px').toBeLessThan(300);
    await page.getByText('Ledger details', { exact: true }).click();
    await expect(page.locator('.ix-money-source code')).toBeVisible();
    await expect(page.locator('.ix-money-pnl-refuse')).toBeVisible();
    await expect(page.locator('.ix-money')).not.toContainText('$0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

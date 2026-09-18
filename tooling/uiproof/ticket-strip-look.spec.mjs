import { test, expect } from '@playwright/test';
import { bootShell, mockWalletAndOrdersDown } from './auth-fixture.mjs';

for (const width of [1440, 390]) {
  test(`Ticket strip LOOK golden: named fields and refused doors at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await mockWalletAndOrdersDown(page);
    const writes = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.url());
    });
    await bootShell(page, '/exchange');
    const ticket = page.locator('#ix-ticket');
    const strip = ticket.locator('.ix-type-tabs');
    await strip.scrollIntoViewIfNeeded();
    for (const [name, id] of [
      ['Iceberg', 'iceberg'],
      ['Collar', 'collar'],
      ['Close', 'close'],
      ['OCO', 'oco'],
      ['Bracket', 'bracket'],
    ]) {
      const control = strip.getByRole('button', { name: new RegExp(`^${name} Fields$`, 'i') });
      await expect(control).toBeVisible({ timeout: 2000 });
      await control.click();
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`#ix-ticket-${id}-wrap`)).toBeVisible();
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(32);
    }
    await page.keyboard.press('Tab');
    await expect(strip.locator('button:focus')).toHaveCSS('outline-style', 'solid');
    await expect(strip.locator('button:focus')).toHaveCSS('outline-width', '2px');
    await strip.getByRole('button', { name: /^Peg Refused$/i }).click();
    await expect(ticket.getByText('Peg orders unavailable', { exact: true })).toBeVisible();
    await expect(ticket.locator('.ix-ticket-door-refusal')).toContainText('will not invent a mid');
    await expect(ticket.locator('.ix-submit').last()).toBeDisabled();
    expect(await strip.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(Math.ceil((await strip.boundingBox()).width));
    expect(writes, 'Inspecting capabilities cannot submit an order').toEqual([]);
  });
}

/**
 * R11 recovery-lock: signed-in submit stays refused until open-order reads settle.
 * CLASS: TRUTH. No new chrome.
 */
import { test, expect } from '@playwright/test';
import { bootShell, establishAuth } from './auth-fixture.mjs';

test('signed-in ticket is locked while open orders are unreachable', async ({ page }) => {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({ code: 'ExchangeNotAvailable', message: 'recovery-lock fixture' }),
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootShell(page, '/exchange/btc_usdt');
  await establishAuth(page);
  await page.waitForTimeout(300);

  const submit = page.locator('button.ix-submit');
  await expect(submit).toBeDisabled();

  let posted = false;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/orders(?:\?|$)/.test(req.url())) posted = true;
  });
  await submit.click({ force: true }).catch(() => {});
  expect(posted, 'recovery-lock must not POST /orders').toBe(false);
});

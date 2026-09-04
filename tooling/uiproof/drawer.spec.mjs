/**
 * FE-P0-03 — pair drawer remains reachable at 390 / 768 / 1024.
 * Remaining-SOT: later display:none must not hide `.ix-markets.is-open`.
 * Unique-port via pnpm ui:boot. Never :8090.
 */
import { test, expect } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
];

async function openDrawer(page) {
  const trigger = page.locator('.ix-pair-switch').first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const drawer = page.locator('#ix-market-drawer');
  await expect(drawer).toBeVisible();
  const display = await drawer.evaluate((el) => getComputedStyle(el).display);
  expect(display, 'open drawer must not stay display:none').not.toBe('none');
  return { trigger, drawer };
}

for (const vp of VIEWPORTS) {
  test(`FE-P0-03 pair drawer opens and Esc-closes @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await bootShell(page, '/exchange/btc_usdt');

    const { trigger, drawer } = await openDrawer(page);
    await expect(drawer).toHaveClass(/is-open/);

    await page.keyboard.press('Escape');
    await expect(drawer).not.toHaveClass(/is-open/);
    await expect(trigger).toBeFocused();
  });
}

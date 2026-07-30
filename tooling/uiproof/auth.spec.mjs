/**
 * Pass 3 — auth fixture + S5/S7 empty-vs-error on account surface.
 * Runs only when browsers can launch (outside agent SEGV sandbox → launchd).
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { installAuth, mockCheckLoginOk, mockWalletAndOrdersEmpty, mockWalletAndOrdersDown } from './auth-fixture.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const ARTIFACTS = join(REPO_ROOT, '.artifacts', 'uiproof');
const SHOTS = join(ARTIFACTS, 'shots-auth');
mkdirSync(SHOTS, { recursive: true });

const ERROR_SNIPPETS = [/Account services did not respond/i, /unknown, not zero/i, /Wallet service did not respond/i, /are unknown/i];

test.describe('Pass 3 auth fixture', () => {
  test('logged-in /uc/account is reachable (not login gate)', async ({ page }) => {
    await installAuth(page);
    await mockCheckLoginOk(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/uc/account', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2000);

    const url = page.url();
    expect(url, `should stay in member center; url=${url}`).not.toMatch(/\/login(?:\/|$|\?)/);

    const body = (await page.locator('body').innerText()).trim();
    expect(body.length, 'member center should render content').toBeGreaterThan(20);

    await page.screenshot({
      path: join(SHOTS, 'uc-account__authed-desktop.png'),
      fullPage: true,
    });
  });

  test('S5/S7 error: wallet+orders down → unknown, not zero', async ({ page }) => {
    await installAuth(page);
    await mockCheckLoginOk(page);
    await mockWalletAndOrdersDown(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/exchange/btc_usdt', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2500);

    const body = await page.locator('body').innerText();
    const hits = ERROR_SNIPPETS.some((re) => re.test(body));
    expect(hits, `logged-in account pane must name unknown/error when services down; body snippet: ${body.slice(0, 400)}`).toBeTruthy();

    // Must not sell a full account strip as empty success with no error language.
    expect(body).not.toMatch(/Nothing here yet/);

    await page.screenshot({
      path: join(SHOTS, 'exchange__wallet-error-desktop.png'),
      fullPage: true,
    });
  });

  test('S5/S7 empty: wallet+orders reachable empty → not the error copy', async ({ page }) => {
    await installAuth(page);
    await mockCheckLoginOk(page);
    await mockWalletAndOrdersEmpty(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/exchange/btc_usdt', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2500);

    const body = await page.locator('body').innerText();

    // Error/unknown copy must not appear when services answered with empty data.
    expect(body).not.toMatch(/Account services did not respond/i);
    expect(body).not.toMatch(/Wallet service did not respond/i);
    expect(body).not.toMatch(/are unknown, not zero/i);

    // Honest empty (zero balance display is OK when reachable) or empty-tab copy.
    const emptyOk = /Nothing here yet/i.test(body) || /\$0/.test(body) || /0\.00/.test(body) || /available/i.test(body);
    expect(emptyOk, `empty reachable account should show zero/empty UI; snippet: ${body.slice(0, 400)}`).toBeTruthy();

    await page.screenshot({
      path: join(SHOTS, 'exchange__wallet-empty-desktop.png'),
      fullPage: true,
    });
  });
});

import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootShell } from './auth-fixture.mjs';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const tokenFile = join(repoRoot, 'vendor/upstream-exchange/05_Web_Front/src/pages/intafaced/Token.vue');

function scriptFrom(source) {
  const match = source.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Token.vue script block is missing');
  return match[1];
}

test('Token LOOK keeps money reads first and leaves the behavior script byte-identical', async () => {
  const currentScript = scriptFrom(readFileSync(tokenFile, 'utf8'));
  const baseline = execFileSync('git', ['show', `origin/main:${tokenFile.slice(repoRoot.length + 1)}`], { encoding: 'utf8' });
  expect(createHash('sha256').update(currentScript).digest('hex')).toBe(createHash('sha256').update(scriptFrom(baseline)).digest('hex'));
});

for (const width of [1440, 390]) {
  test(`Token access leads; service actions stay disclosed at ${width}`, async ({ page, browser }) => {
    const height = width === 390 ? 844 : 900;
    await page.setViewportSize({ width, height });
    const writes = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
    });
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await bootShell(page, '/token');
    await expect(page.locator('.ix-workspace[data-state="unavailable"]')).toBeVisible();

    await expect(page.locator('#token-actions')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain('$0');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ animations: 'disabled', path: join(repoRoot, 'tooling/uiproof/crops/look-token-access', `${width}-down.png`) });

    // Existing reachable-empty class: no stakes; access and stake reads stay 503.
    // No synthetic balance, staked amount, tier, or discount is supplied.
    await page.route('**/api/token/trpc/listStakes*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { data: [] } }),
      }),
    );
    await page.reload();

    await expect(page.locator('.ix-workspace[data-state="ready"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stake', exact: true })).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('#token-overview')).toBeVisible();
    await expect(page.locator('.ix-workspace-partial')).toBeVisible();
    await expect(page.locator('#token-actions')).toHaveJSProperty('open', false);
    await expect(page.locator('#token-operations')).toHaveJSProperty('open', false);
    expect((await page.locator('#token-overview').boundingBox()).y).toBeLessThan(420);
    await expect(page.locator('#token-stakes')).toContainText('No active stakes. This is an empty list, not a zero balance.');

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      animations: 'disabled',
      path: join(repoRoot, 'tooling/uiproof/crops/look-token-access', `${width}-empty.png`),
    });

    await page.locator('#token-actions > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#token-actions')).toHaveJSProperty('open', true);
    await expect(page.getByRole('heading', { name: 'Stake', exact: true })).toBeVisible();
    await page.locator('#token-actions > summary').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -64));
    await page.screenshot({
      animations: 'disabled',
      path: join(repoRoot, 'tooling/uiproof/crops/look-token-access', `${width}-stake.png`),
    });
    await page.locator('#ix-token-amount').fill('unsaved-token-action');
    await page.locator('#token-actions > summary').click();
    await page.locator('#token-actions > summary').click();
    await expect(page.locator('#ix-token-amount')).toHaveValue('unsaved-token-action');
    await page.locator('#token-actions > summary').click();
    await page.locator('#token-operations > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#ix-token-yield-window')).toBeVisible();
    await page.locator('#token-operations > summary').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -64));
    await page.screenshot({
      animations: 'disabled',
      path: join(repoRoot, 'tooling/uiproof/crops/look-token-access', `${width}-operations.png`),
    });
    await page.locator('#ix-token-yield-window').fill('unsaved-window');
    await page.keyboard.press('Tab');
    await page.locator('#token-operations > summary').click();
    await page.locator('#token-operations > summary').click();
    await expect(page.locator('#ix-token-yield-window')).toHaveValue('unsaved-window');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await page.locator('body').innerText()).not.toContain('$0');
    expect(writes).toEqual([]);
    const evidenceDir = join(repoRoot, 'tooling/uiproof/crops/look-token-access');
    writeFileSync(
      join(evidenceDir, `${width}.json`),
      JSON.stringify(
        {
          claim: 'BROWSER-PROVED layout and disclosure interactions only; no live money, authorization, execution, or AT certification',
          sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          worktree: repoRoot,
          tokenSourceSha256: createHash('sha256').update(readFileSync(tokenFile)).digest('hex'),
          scriptSha256: createHash('sha256')
            .update(scriptFrom(readFileSync(tokenFile, 'utf8')))
            .digest('hex'),
          server: JSON.parse(readFileSync(join(repoRoot, '.artifacts/uiproof/provenance.json'), 'utf8')),
          route: '/token',
          browser: `Chromium ${browser.version()}`,
          viewport: { width, height },
          task: 'Inspect access and active stakes, then deliberately disclose staking or service operations without losing drafts.',
          session: 'Anonymous; no persisted or memory bearer',
          evidence: ['down', 'empty', 'stake', 'operations'].map((state) => ({
            file: `${width}-${state}.png`,
            sha256: createHash('sha256')
              .update(readFileSync(join(evidenceDir, `${width}-${state}.png`)))
              .digest('hex'),
            fixture:
              state === 'down'
                ? 'All API reads HTTP 503'
                : 'listStakes HTTP 200 []; all other API reads HTTP 503; no seeded money, tier, or discount',
          })),
          writes,
        },
        null,
        2,
      ) + '\n',
    );
  });
}

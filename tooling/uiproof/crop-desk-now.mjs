#!/usr/bin/env node
/**
 * Hashed 1440+390 crops for desk NOW LOOK (R03/R09/R10 chrome).
 * Requires pnpm ui:boot provenance in this worktree. Never :8090 default.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-desk-now.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { proofBase } from './proof-base.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { bootShell, establishAuth } from './auth-fixture.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const BASE = proofBase(REPO_ROOT);
const { executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO_ROOT });
const OUT = join(REPO_ROOT, 'tooling/uiproof/crops/look-desk-now-closeout');

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440x900' },
  { w: 390, h: 844, name: '390x844' },
];

async function mockDependenciesDown(page) {
  const fulfill503 = async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({
        code: 'ExchangeNotAvailable',
        message: 'UI proof fixture: dependencies down',
      }),
    });
  };
  await page.route((url) => {
    const p = url.pathname || '';
    return (
      p.startsWith('/api/') || p.startsWith('/uc/') || p.startsWith('/market/') || p.startsWith('/otc/') || p.startsWith('/exchange/api')
    );
  }, fulfill503);
}

async function cropOne(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await mockDependenciesDown(page);
  await bootShell(page, BASE + '/exchange/btc_usdt');
  await establishAuth(page);
  await page.waitForTimeout(800);
  const png = await page.screenshot({ type: 'png', fullPage: false });
  await context.close();
  const hex = createHash('sha256').update(png).digest('hex');
  const short = hex.slice(0, 12);
  const file = `look-exchange-btc_usdt-f2-memory-authenticated-dependencies-down-${short}-${viewport.name}.png`;
  writeFileSync(join(OUT, file), png);
  return { file, hex, viewport: viewport.name };
}

const browser = await chromium.launch({
  executablePath: executablePath || undefined,
  headless: true,
});
mkdirSync(OUT, { recursive: true });
const rows = [];
try {
  for (const vp of VIEWPORTS) {
    rows.push(await cropOne(browser, vp));
  }
} finally {
  await browser.close();
}

const sums = rows.map((r) => `${r.hex}  ${r.file}`).join('\n');
const meta = [
  sums,
  '',
  `Rendered commit: ${SHA}`,
  'Route: /exchange/btc_usdt',
  'Fixture: F2 memory-authenticated + dependencies down',
  'Browser: Chromium (Playwright)',
  'Viewports: 1440x900, 390x844',
  'Worktree: feat-desk-now-closeout-20260904',
  'Claim: BROWSER-PROVED / CLASS LOOK',
  'Task: Per-channel session chips, order-entry lock banner, 24px book rows, no live-green status dot.',
  'API/session behavior: memory-only session; /api /uc /market /exchange /otc return HTTP 503; no values or fills seeded.',
  `Proof base: ${BASE}`,
].join('\n');
writeFileSync(join(OUT, 'SHA256SUMS'), meta + '\n');
console.log(meta);

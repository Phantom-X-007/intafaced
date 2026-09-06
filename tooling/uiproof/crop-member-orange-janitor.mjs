#!/usr/bin/env node
/**
 * Hashed LOOK proof for the member-shell orange identity janitor.
 * Uses the existing unique-port ui:boot provenance and intercepts xhr/fetch only.
 *
 *   pnpm ui:boot
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-member-orange-janitor.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { proofBase } from './proof-base.mjs';

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const BRANCH = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
const BASE = proofBase(REPO);
const OUT = join(REPO, 'tooling/uiproof/crops/look-member-orange-janitor');
const { browsersPath, executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO });

function chromeForTesting(pathHint, fallback) {
  if (fallback) return fallback;
  if (!pathHint || !existsSync(pathHint)) return undefined;
  const revisions = readdirSync(pathHint)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  for (const revision of revisions) {
    const candidate = join(
      pathHint,
      revision,
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    );
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const launchExecutable = chromeForTesting(browsersPath, executablePath);
if (!launchExecutable) throw new Error('Chrome for Testing not found');
if (new URL(BASE).port === '8090') throw new Error('default :8090 is refused');

const authoredResidues = [
  ['src/App.vue', 'rgba(240, 167, 10, 0.2)'],
  ['src/pages/index/Index.vue', 'rgb(240, 185, 11)'],
  ['src/components/uc/EntrustCurrent.vue', '#f1ac19'],
  ['src/components/uc/Safe.vue', '#df9a00'],
  ['src/pages/uc/IdentBusiness.vue', '#f0ac70'],
  ['src/pages/otc/Trade.vue', 'rgb(245, 106, 0)'],
  ['src/pages/otc/Trade.vue', 'rgb(253, 227, 207)'],
];
const memberRoot = join(REPO, 'vendor/upstream-exchange/05_Web_Front');
for (const [file, residue] of authoredResidues) {
  if (readFileSync(join(memberRoot, file), 'utf8').toLowerCase().includes(residue.toLowerCase())) {
    throw new Error(`${file} still contains chromatic identity ${residue}`);
  }
}

function isApiPath(pathname) {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uc/') ||
    pathname.startsWith('/market/') ||
    pathname.startsWith('/otc/') ||
    pathname.startsWith('/exchange/')
  );
}

async function dependenciesDown(page) {
  await page.route(
    (url) => isApiPath(new URL(url).pathname),
    async (route) => {
      const type = route.request().resourceType();
      if (type !== 'xhr' && type !== 'fetch') return route.continue();
      return route.fulfill({
        status: 503,
        contentType: 'application/json;charset=UTF-8',
        body: JSON.stringify({
          code: 'ExchangeNotAvailable',
          message: 'UI proof fixture: dependencies down',
        }),
      });
    },
  );
}

function rgbChroma(color) {
  const match = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) throw new Error(`cannot parse ${color}`);
  const channels = match.slice(1).map(Number);
  return Math.max(...channels) - Math.min(...channels);
}

const viewports = [
  { width: 1440, height: 900, name: '1440x900' },
  { width: 390, height: 844, name: '390x844' },
];
const chromeHome = join(REPO, '.artifacts/uiproof/chrome-home');
const chromeCrash = join(REPO, '.artifacts/uiproof/chrome-crash');
mkdirSync(join(chromeHome, 'Library/Application Support/Google/Chrome for Testing/Crashpad'), { recursive: true });
mkdirSync(chromeCrash, { recursive: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: launchExecutable,
  headless: true,
  chromiumSandbox: false,
  env: {
    ...process.env,
    HOME: chromeHome,
    XDG_CONFIG_HOME: join(chromeHome, 'config'),
    XDG_CACHE_HOME: join(chromeHome, 'cache'),
  },
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-crash-reporter',
    '--disable-breakpad',
    `--crash-dumps-dir=${chromeCrash}`,
  ],
});

const rows = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    const page = await context.newPage();
    await dependenciesDown(page);
    await bootShell(page, `${BASE}/uc/entrust/current`);
    await page.getByRole('heading', { name: 'Orders', exact: true }).waitFor({ timeout: 20_000 });

    const picker = page.locator('.ivu-date-picker-rel').first();
    const pickerInput = picker.locator('input');
    await pickerInput.click();
    const days = page.locator(
      '.ivu-date-picker-cells-cell:not(.ivu-date-picker-cells-cell-prev-month):not(.ivu-date-picker-cells-cell-next-month):not(.ivu-date-picker-cells-cell-disabled)',
    );
    await days.nth(7).evaluate((element) => element.click());
    await days.nth(12).evaluate((element) => element.click());
    await pickerInput.click();

    const rangeCell = page.locator('.ivu-date-picker-cells-cell-range').first();
    await rangeCell.waitFor({ state: 'visible', timeout: 10_000 });
    const rangeWash = await rangeCell.evaluate((element) => getComputedStyle(element, '::before').backgroundColor);
    if (rgbChroma(rangeWash) > 16) {
      throw new Error(`${viewport.name}: date range wash remains chromatic (${rangeWash})`);
    }

    const png = await page.screenshot({ type: 'png', fullPage: false });
    await context.close();
    const hex = createHash('sha256').update(png).digest('hex');
    const file = `look-open-orders-date-range-f1-anonymous-dependencies-down-${viewport.name}-${hex.slice(0, 12)}.png`;
    writeFileSync(join(OUT, file), png);
    rows.push({ file, hex, viewport: viewport.name, rangeWash });
    console.log(`${file} ${hex} range=${rangeWash}`);
  }
} finally {
  await browser.close();
}

const sums = rows.map((row) => `${row.hex}  ${row.file}`).join('\n');
const meta = [
  sums,
  '',
  `Rendered commit: ${SHA}`,
  'Route: /uc/entrust/current',
  'Fixture: F1 anonymous + dependencies down',
  'Browser: Chromium (Playwright) Chrome for Testing, chromiumSandbox false',
  'Viewports: 1440x900, 390x844',
  `Worktree: ${BRANCH}`,
  'Claim: BROWSER-PROVED / CLASS LOOK — the live date-range identity wash is neutral grey; static guard covers the six authored member-shell residue files.',
  'User task: leftover N4 chromatic orange identity after #4009, #4010, #4017, #4088.',
  'Falsifier: any named authored residue remains, or the open-orders date-range wash has RGB chroma above 16.',
  'API/session behavior: anonymous; xhr/fetch /api /uc /market /otc /exchange return HTTP 503 only; SPA document is never intercepted; no rows or balances seeded.',
  'Excluded by task: neutral --ix-orange aliases; chart study series; semantic warning/danger; market green/red.',
  `Observed washes: ${rows.map((row) => `${row.viewport}=${row.rangeWash}`).join(', ')}`,
  `Proof base: ${BASE}`,
].join('\n');
writeFileSync(join(OUT, 'SHA256SUMS'), `${meta}\n`);
console.log(meta);

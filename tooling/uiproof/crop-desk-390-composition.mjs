#!/usr/bin/env node
/**
 * Hashed LOOK proof for the 390 desk composition pass.
 * Requires this worktree's unique-port ui:boot provenance. Never :8090.
 * Intercepts xhr/fetch only; the SPA document always loads from the shell.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-desk-390-composition.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { bootShell } from './auth-fixture.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { proofBase } from './proof-base.mjs';

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const BRANCH = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
const BASE = proofBase(REPO);
const OUT = join(REPO, 'tooling/uiproof/crops/look-desk-390-composition');
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hashAndWrite(fileStem, png) {
  const hex = createHash('sha256').update(png).digest('hex');
  const file = `${fileStem}-${hex.slice(0, 12)}.png`;
  writeFileSync(join(OUT, file), png);
  return { file, hex };
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
const observations = [];
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
    await bootShell(page, `${BASE}/exchange/btc_usdt`);
    await page.locator('.ix-terminal').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(800);

    const measured = await page.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        };
      };
      return {
        root: {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        },
        head: box('.ix-head'),
        pair: box('.ix-pair-switch'),
        status: box('.ix-head-status'),
        lock: box('.ix-lock-toggle'),
        rail: box('.ix-rail'),
        ticketTypes: box('.ix-order .ix-type-tabs'),
        submit: box('.ix-submit'),
        bookFloor: getComputedStyle(document.querySelector('.ix-terminal')).getPropertyValue('--row').trim(),
      };
    });

    assert(
      measured.root.scrollWidth === measured.root.clientWidth,
      `${viewport.name}: whole-page overflow ${measured.root.scrollWidth} > ${measured.root.clientWidth}`,
    );
    assert(measured.pair && measured.pair.height >= 24, `${viewport.name}: pair target below 24px`);
    assert(measured.lock && measured.lock.height >= 24, `${viewport.name}: lock target below 24px`);
    assert(measured.submit && measured.submit.height >= 44, `${viewport.name}: submit below 44px`);
    assert(Number.parseFloat(measured.bookFloor) >= 24, `${viewport.name}: book floor is ${measured.bookFloor}`);

    if (viewport.width === 390) {
      assert(measured.status.y >= measured.head.y, '390x844: channel rail clips above the pair header');
      assert(measured.status.bottom <= measured.head.bottom, '390x844: channel rail clips below the pair header');
      assert(measured.rail.height <= 160.5, `390x844: blotter rail is ${measured.rail.height}px tall`);
      assert(measured.ticketTypes.height <= 34, `390x844: ticket strip wraps to ${measured.ticketTypes.height}px`);
      assert(measured.ticketTypes.scrollWidth > measured.ticketTypes.clientWidth, '390x844: ticket strip lost its touch-scroll overflow');
    }

    const png = await page.screenshot({ type: 'png', fullPage: false });
    rows.push(hashAndWrite(`look-exchange-btc_usdt-f1-anonymous-dependencies-down-${viewport.name}`, png));
    observations.push({ viewport: viewport.name, ...measured });

    if (viewport.width === 390) {
      await page.locator('.ix-account').scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
      const blotterPng = await page.screenshot({ type: 'png', fullPage: false });
      rows.push(hashAndWrite('look-exchange-btc_usdt-f1-anonymous-dependencies-down-390x844-blotter', blotterPng));
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const mobile = observations.find((row) => row.viewport === '390x844');
const sums = rows.map((row) => `${row.hex}  ${row.file}`).join('\n');
const meta = [
  sums,
  '',
  `Rendered commit: ${SHA}`,
  'Route: /exchange/btc_usdt',
  'Fixture: F1 anonymous + dependencies down',
  'Browser: Chromium (Playwright) Chrome for Testing, chromiumSandbox false',
  'Viewports: 1440x900, 390x844; additional 390x844 blotter scroll crop',
  `Worktree: ${BRANCH}`,
  'Claim: BROWSER-PROVED / CLASS LOOK',
  'User task: 390 desk composition — ticket strip, blotter, pair/lock chrome.',
  'Falsifier: 390 crop overflows, hover-only, submit below 44px, or orange identity.',
  'API/session behavior: F1 anonymous; xhr/fetch /api /uc /market /otc /exchange return HTTP 503 only; SPA document is never intercepted; no rows, values, or balances seeded.',
  `Measured 1440 reflow: scrollWidth ${observations[0].root.scrollWidth}px / clientWidth ${observations[0].root.clientWidth}px.`,
  `Measured 390 reflow: scrollWidth ${mobile.root.scrollWidth}px / clientWidth ${mobile.root.clientWidth}px.`,
  `Measured 390 chrome: pair ${mobile.pair.height}px; lock ${mobile.lock.height}px; channel rail y ${mobile.status.y}px..${mobile.status.bottom}px within header ${mobile.head.y}px..${mobile.head.bottom}px.`,
  `Measured 390 composition: blotter rail ${mobile.rail.height}px; ticket strip ${mobile.ticketTypes.height}px with ${mobile.ticketTypes.scrollWidth}px touch-scroll content in ${mobile.ticketTypes.clientWidth}px; book floor ${mobile.bookFloor}; submit ${mobile.submit.height}px.`,
  'N4: near-black square chrome; no identity orange added; green/red remain market semantics only; no heatmap; no new order types.',
  `Proof base: ${BASE}`,
].join('\n');
writeFileSync(join(OUT, 'SHA256SUMS'), `${meta}\n`);
console.log(meta);

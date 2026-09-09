#!/usr/bin/env node
/**
 * Hashed 1440+390 crops for restrained identity accent #FF6B00 on member shell.
 * Pack: look-restrained-accent-member
 *
 * Requires pnpm ui:boot provenance in this worktree. Never :8090 default.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-restrained-accent-member.mjs
 *
 * xhr/fetch 503 only. Never intercept the SPA document.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { proofBase } from './proof-base.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { bootShell, establishAuth } from './auth-fixture.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const BRANCH = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const BASE = proofBase(REPO_ROOT);
const { browsersPath, executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO_ROOT });

function chromeForTesting(pathHint, fallback) {
  if (fallback) return fallback;
  const root = pathHint || process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const revs = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)));
  for (const rev of revs) {
    const candidate = join(
      root,
      rev,
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

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440x900' },
  { w: 390, h: 844, name: '390x844' },
];

const PACK = 'look-restrained-accent-member';

const CASES = [
  {
    route: '/',
    fileStem: 'look-home-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Money, markets, and payments',
    task: 'Allowed: primary CTA orange. Forbidden: body links orange.',
  },
  {
    route: '/login',
    fileStem: 'look-login-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Log in',
    task: 'Allowed: Log in fill + focus. Forbidden: white text on orange.',
  },
  {
    route: '/register',
    fileStem: 'look-register-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Create account',
    task: 'Auth primary follows the same pin as login.',
  },
  {
    route: '/exchange/btc_usdt',
    fileStem: 'look-exchange-btc_usdt-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'ORDER BOOK',
    task: 'Allowed: selected tab / focus. Forbidden: Buy/Sell orange.',
  },
  {
    route: '/uc/money',
    fileStem: 'look-uc-money-signed-out-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down (signed-out)',
    auth: false,
    waitText: 'Your ledger stays private',
    forbidText: 'Authenticated · degraded',
    task: 'Allowed: Log in. Forbidden: $0 under 503.',
  },
  {
    route: '/uc/money',
    fileStem: 'look-uc-money-auth-degraded-f2-memory-authenticated-dependencies-down',
    fixture: 'F2 memory-authenticated + dependencies down',
    auth: true,
    waitText: 'Authenticated · degraded',
    forbidText: 'Your ledger stays private',
    task: 'Honesty unchanged. Falsifier: a number that looks like a balance under 503.',
  },
  {
    route: '/bank',
    fileStem: 'look-bank-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Bank surfaces',
    forbidText: 'Create a corporate account',
    task: '/bank OS current-tab pin. Not /bank/business.',
  },
  {
    route: '/pay',
    fileStem: 'look-pay-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Payments OS',
    task: '/pay OS current-tab pin. Not /pay/checkout.',
  },
  {
    route: '/platform',
    fileStem: 'look-platform-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Platform',
    task: 'Session hub primary follows the pin.',
  },
  {
    route: '/uc/entrust/current',
    fileStem: 'look-open-orders-date-range-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Open',
    task: 'Forbidden crop: date-range stays instrument grey.',
  },
];

function isSpaAsset(route) {
  const type = route.request().resourceType();
  return type !== 'xhr' && type !== 'fetch';
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

async function mockDependenciesDown(page) {
  const fulfill503 = async (route) => {
    if (isSpaAsset(route)) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({
        code: 'ExchangeNotAvailable',
        message: 'UI proof fixture: dependencies down',
      }),
    });
  };
  await page.route((url) => isApiPath(new URL(url).pathname), fulfill503);
}

function hasText(body, needle) {
  return body.toLowerCase().includes(String(needle).toLowerCase());
}

async function waitReady(page, spec) {
  try {
    await page.waitForFunction(
      (needle) => {
        const body = document.body && document.body.innerText ? document.body.innerText : '';
        return body.toLowerCase().includes(String(needle).toLowerCase());
      },
      spec.waitText,
      { timeout: 25_000 },
    );
  } catch (err) {
    const body = await page.locator('body').innerText();
    throw new Error(PACK + ' waitText missing: ' + spec.waitText + ' @ ' + spec.route + '\nBODY:\n' + body.slice(0, 1600));
  }
  const body = await page.locator('body').innerText();
  if (spec.forbidText && hasText(body, spec.forbidText)) {
    throw new Error(`${PACK} ${spec.route}: falsifier hit — crop text contains "${spec.forbidText}"`);
  }
  if (body.includes('$0') || body.includes('$0.00')) {
    throw new Error(`${PACK} ${spec.route}: falsifier hit — crop text contains $0 under dependencies-down`);
  }
}

async function cropOne(browser, spec, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  await mockDependenciesDown(page);
  await bootShell(page, BASE + spec.route);
  if (spec.auth) await establishAuth(page);
  await waitReady(page, spec);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (viewport.w === 390 && metrics.scrollWidth > metrics.clientWidth + 1) {
    await context.close();
    throw new Error(`${PACK} ${spec.route} 390 overflow: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}`);
  }
  const png = await page.screenshot({ type: 'png', fullPage: false });
  await context.close();
  const hex = createHash('sha256').update(png).digest('hex');
  const short = hex.slice(0, 12);
  const file = `${spec.fileStem}-${viewport.name}-${short}.png`;
  return { file, hex, png, viewport: viewport.name, metrics };
}

if (!launchExecutable) {
  console.error('Chrome for Testing not found. Set PLAYWRIGHT_BROWSERS_PATH.');
  process.exit(1);
}

const chromeHome = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-home');
const chromeCrash = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-crash');
mkdirSync(join(chromeHome, 'Library/Application Support/Google/Chrome for Testing/Crashpad'), { recursive: true });
mkdirSync(chromeCrash, { recursive: true });

const browser = await chromium.launch({
  executablePath: launchExecutable,
  headless: true,
  chromiumSandbox: false,
  env: {
    ...process.env,
    HOME: chromeHome,
    XDG_CONFIG_HOME: join(chromeHome, 'config'),
    XDG_CACHE_HOME: join(chromeHome, 'cache'),
    CHROME_HEADLESS: '1',
    BREAKPAD_DUMP_LOCATION: chromeCrash,
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

try {
  const out = join(REPO_ROOT, 'tooling/uiproof/crops', PACK);
  mkdirSync(out, { recursive: true });
  const rows = [];
  for (const spec of CASES) {
    for (const vp of VIEWPORTS) {
      const row = await cropOne(browser, spec, vp);
      writeFileSync(join(out, row.file), row.png);
      rows.push({ ...row, spec });
      console.log(`${PACK} ${spec.route} ${vp.name} ${row.file}`);
    }
  }
  const sums = rows.map((r) => `${r.hex}  ${r.file}`).join('\n');
  const meta = [
    sums,
    '',
    `Rendered commit: ${SHA}`,
    `Route: ${[...new Set(rows.map((r) => r.spec.route))].join(', ')}`,
    `Fixture: ${[...new Set(rows.map((r) => r.spec.fixture))].join(' | ')}`,
    'Browser: Chromium (Playwright) Chrome for Testing, chromiumSandbox false',
    'Viewports: 1440x900, 390x844',
    `Worktree: ${BRANCH}`,
    'Claim: BROWSER-PROVED / CLASS LOOK',
    'Task: restrained identity #FF6B00 in named slots only. Date-range, default links, Buy/Sell stay grey/market.',
    'API/session behavior: anonymous unless F2; xhr/fetch /api /uc /market /otc /exchange HTTP 503; SPA document never intercepted; no balances seeded.',
    `Proof base: ${BASE}`,
    'LoadingBar 2px #ff6b00 is SOURCE-READ from main.js (transient overlay, not a still crop).',
  ].join('\n');
  writeFileSync(join(out, 'SHA256SUMS'), meta + '\n');
  console.log(meta);
} finally {
  await browser.close();
}

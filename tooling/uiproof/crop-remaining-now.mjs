#!/usr/bin/env node
/**
 * Hashed 1440+390 crops for remaining NOW LOOK surfaces.
 * Requires pnpm ui:boot provenance in this worktree. Never :8090 default.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-remaining-now.mjs
 *
 * Does not intercept the SPA document URL (that 503 bug already happened).
 * Admin M16 is a different service (apps/admin) — skipped.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { proofBase } from './proof-base.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { bootShell, establishAuth, mockWalletAndOrdersEmpty } from './auth-fixture.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const BRANCH = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const BASE = proofBase(REPO_ROOT);
const { browsersPath, executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO_ROOT });

/** Headless-shell SEGVs in this agent (SEGV_ACCERR). Use full Chrome for Testing. */
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

const FORBID_UNKNOWN_ZERO = 'unknown, not zero';

const CASES = [
  {
    pack: 'look-exchange-f3-reachable-empty',
    route: '/exchange/btc_usdt',
    fileStem: 'look-exchange-btc_usdt-f3-memory-authenticated-reachable-empty',
    fixture: 'F3 memory-authenticated + reachable empty (mockWalletAndOrdersEmpty, not 503)',
    auth: true,
    network: 'empty',
    waitText: 'The ledger holds no balance for this account yet',
    forbidText: FORBID_UNKNOWN_ZERO,
    scroll: '.ix-account',
    task: 'F3 reachable-empty desk. Falsifier: crop must not say “unknown, not zero”.',
    api: 'memory-only session; GET /api/v1/account/balance and /api/v1/orders/* return HTTP 200 empty; other xhr/fetch /api /uc /market /otc /exchange return 503; SPA document never intercepted; no values or fills seeded.',
  },
  {
    pack: 'look-exchange-perp-m08-m10-refuse',
    route: '/exchange/btc_usdt?kind=perp',
    fileStem: 'look-exchange-btc_usdt-perp-f2-memory-authenticated-dependencies-down',
    fixture: 'F2 memory-authenticated + dependencies down; query kind=perp',
    auth: true,
    network: 'down',
    waitText: 'Portfolio margin unavailable',
    scroll: '.ix-m08-m10',
    task: 'M08/M10 perp ticket refuse — four named margin products, dated futures, hedge vs one-way. Isolated-only is not a 2×2 switch.',
    api: 'memory-only session; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; document never intercepted; no values, fills, IV, or margin doors seeded.',
  },
  {
    pack: 'look-exchange-options-m11-refuse',
    route: '/exchange/btc_usdt',
    fileStem: 'look-exchange-btc_usdt-options-f2-memory-authenticated-dependencies-down',
    fixture: 'F2 memory-authenticated + dependencies down; Options mode clicked',
    auth: true,
    network: 'down',
    after: async (page) => {
      const strip = page.locator('.ix-mode-strip');
      await strip.waitFor({ state: 'visible', timeout: 20_000 });
      await strip.scrollIntoViewIfNeeded();
      await strip.getByRole('button', { name: 'Options' }).click();
    },
    waitText: 'Options chain unavailable',
    scroll: '.ix-order-body',
    task: 'M11 options refuse — paper label stays; no fake IV / chain / bid-ask-delta.',
    api: 'memory-only session; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; document never intercepted; no IV, mids, or chain rows seeded.',
  },
  {
    pack: 'look-p2p-m12-rfq-refuse',
    route: '/p2p',
    fileStem: 'look-p2p-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    network: 'down',
    waitText: 'Firm RFQ/block (firm quote, expiry, allocation) is unavailable here',
    scroll: '#ix-p2p-rfq-refuse',
    task: 'M12 RFQ ≠ C2C — /p2p is escrowed offers, not a firm-quote blotter.',
    api: 'anonymous; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; document never intercepted; no RFQ quotes seeded.',
  },
  {
    pack: 'look-portfolio-m14-pnl-refuse',
    route: '/portfolio',
    fileStem: 'look-portfolio-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down (no balances seeded)',
    auth: false,
    network: 'down',
    waitText: 'Realized vs funding vs fees export is unavailable',
    scroll: '#ix-portfolio-pnl',
    task: 'M14 PnL/statements export unavailable on /portfolio.',
    api: 'anonymous; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; document never intercepted; no balances or PnL seeded.',
  },
  {
    pack: 'look-uc-money-m14-pnl-refuse',
    route: '/uc/money',
    fileStem: 'look-uc-money-f2-memory-authenticated-dependencies-down',
    fixture: 'F2 memory-authenticated + dependencies down (no balances seeded)',
    auth: true,
    network: 'down',
    waitText: 'no PnL export is mounted',
    scroll: '#ix-money-pnl-refuse',
    task: 'M14 PnL/statements export unavailable on /uc/money. This book is balances, not a statement.',
    api: 'memory-only session; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; SPA document /uc/money never intercepted; no balances or PnL seeded.',
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

async function waitReady(page, spec) {
  if (spec.after) await spec.after(page);
  if (spec.scroll) {
    const el = page.locator(spec.scroll).first();
    await el.waitFor({ state: 'visible', timeout: 20_000 });
    await el.scrollIntoViewIfNeeded();
  }
  await page.waitForFunction(
    (needle) => (document.body && document.body.innerText ? document.body.innerText : '').includes(needle),
    spec.waitText,
    { timeout: 20_000 },
  );
  const body = await page.locator('body').innerText();
  if (spec.forbidText && body.includes(spec.forbidText)) {
    throw new Error(`${spec.pack}: falsifier hit — crop text contains "${spec.forbidText}"`);
  }
  if (!body.includes(spec.waitText)) {
    throw new Error(`${spec.pack}: wait text missing after settle: ${spec.waitText}`);
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
  if (spec.network === 'empty') {
    await mockWalletAndOrdersEmpty(page);
  }
  await bootShell(page, BASE + spec.route);
  if (spec.auth) await establishAuth(page);
  await waitReady(page, spec);
  const png = await page.screenshot({ type: 'png', fullPage: false });
  await context.close();
  const hex = createHash('sha256').update(png).digest('hex');
  const short = hex.slice(0, 12);
  const file = `${spec.fileStem}-${short}-${viewport.name}.png`;
  return { file, hex, png, viewport: viewport.name };
}

const chromeHome = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-home');
const chromeCrash = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-crash');
mkdirSync(chromeHome, { recursive: true });
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
  },
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-crash-reporter',
    `--crash-dumps-dir=${chromeCrash}`,
  ],
});

try {
  for (const spec of CASES) {
    const out = join(REPO_ROOT, 'tooling/uiproof/crops', spec.pack);
    mkdirSync(out, { recursive: true });
    const rows = [];
    for (const vp of VIEWPORTS) {
      const row = await cropOne(browser, spec, vp);
      writeFileSync(join(out, row.file), row.png);
      rows.push(row);
      console.log(`${spec.pack} ${vp.name} ${row.file}`);
    }
    const sums = rows.map((r) => `${r.hex}  ${r.file}`).join('\n');
    const meta = [
      sums,
      '',
      `Rendered commit: ${SHA}`,
      `Route: ${spec.route}`,
      `Fixture: ${spec.fixture}`,
      'Browser: Chromium (Playwright)',
      'Viewports: 1440x900, 390x844',
      `Worktree: ${BRANCH}`,
      'Claim: BROWSER-PROVED / CLASS LOOK',
      `Task: ${spec.task}`,
      `API/session behavior: ${spec.api}`,
      `Proof base: ${BASE}`,
    ].join('\n');
    writeFileSync(join(out, 'SHA256SUMS'), meta + '\n');
    console.log(meta);
    console.log('');
  }
} finally {
  await browser.close();
}

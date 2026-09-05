#!/usr/bin/env node
/**
 * Hashed 1440+390 crops for Money / Bank / Pay Layer A glances.
 * New packs: look-money-layer-a, look-bank-os-glance, look-pay-os-glance.
 * Older look-money-states-v0 / bank-layer-a / pay-layer-a stay as prior hashes.
 *
 * Requires pnpm ui:boot provenance in this worktree. Never :8090 default.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-money-bank-pay-layer-a.mjs
 *
 * xhr/fetch 503 only. Never intercept the SPA document.
 * Four fixtures only — no seeded balances.
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

const CASES = [
  {
    pack: 'look-money-layer-a',
    route: '/uc/money',
    fileStem: 'look-uc-money-signed-out-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down (signed-out combo; /uc/money is not requiresAuth)',
    auth: false,
    waitText: 'Your ledger stays private',
    forbidText: 'Authenticated · degraded',
    task: 'Money signed-out gate. Falsifier: a loaded balance or 503 treated as $0.',
    api: 'anonymous; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; SPA document /uc/money never intercepted; no balances seeded.',
  },
  {
    pack: 'look-money-layer-a',
    route: '/uc/money',
    fileStem: 'look-uc-money-auth-degraded-f2-memory-authenticated-dependencies-down',
    fixture: 'F2 memory-authenticated + dependencies down (authenticated degraded, not a ledger)',
    auth: true,
    waitText: 'Authenticated · degraded',
    forbidText: 'Your ledger stays private',
    task: 'Money 503 is authenticated degraded, not a balance. Falsifier: a number that looks like a balance under 503.',
    api: 'memory-only session; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; SPA document /uc/money never intercepted; no balances seeded.',
  },
  {
    pack: 'look-bank-os-glance',
    route: '/bank',
    fileStem: 'look-bank-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Bank surfaces',
    forbidText: 'Create a corporate account',
    task: '/bank OS glance, not /bank/business. Falsifier: payroll/business forms or unlabeled totals.',
    api: 'anonymous; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; SPA document /bank never intercepted; no balances seeded.',
  },
  {
    pack: 'look-pay-os-glance',
    route: '/pay',
    fileStem: 'look-pay-f1-anonymous-dependencies-down',
    fixture: 'F1 anonymous + dependencies down',
    auth: false,
    waitText: 'Payments OS · not a balance book',
    forbidText: 'What a link says it is',
    task: '/pay glance, not /pay/checkout. Falsifier: link-token checkout form or a number that looks like a balance under 503.',
    api: 'anonymous; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; SPA document /pay never intercepted; no balances seeded.',
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
    throw new Error(spec.pack + ' waitText missing: ' + spec.waitText + '\nBODY:\n' + body.slice(0, 1200));
  }
  const body = await page.locator('body').innerText();
  if (spec.forbidText && hasText(body, spec.forbidText)) {
    throw new Error(`${spec.pack}: falsifier hit — crop text contains "${spec.forbidText}"`);
  }
  if (body.includes('$0') || body.includes('$0.00')) {
    throw new Error(`${spec.pack}: falsifier hit — crop text contains $0 under dependencies-down`);
  }
  if (!hasText(body, spec.waitText)) {
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
  await bootShell(page, BASE + spec.route);
  if (spec.auth) await establishAuth(page);
  await waitReady(page, spec);
  const png = await page.screenshot({ type: 'png', fullPage: false });
  await context.close();
  const hex = createHash('sha256').update(png).digest('hex');
  const short = hex.slice(0, 12);
  const file = `${spec.fileStem}-${viewport.name}-${short}.png`;
  return { file, hex, png, viewport: viewport.name };
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
  const byPack = new Map();
  for (const spec of CASES) {
    const out = join(REPO_ROOT, 'tooling/uiproof/crops', spec.pack);
    mkdirSync(out, { recursive: true });
    if (!byPack.has(spec.pack)) byPack.set(spec.pack, { spec, rows: [] });
    const bucket = byPack.get(spec.pack);
    for (const vp of VIEWPORTS) {
      const row = await cropOne(browser, spec, vp);
      writeFileSync(join(out, row.file), row.png);
      bucket.rows.push({ ...row, spec });
      console.log(`${spec.pack} ${vp.name} ${row.file}`);
    }
  }
  for (const [pack, bucket] of byPack) {
    const out = join(REPO_ROOT, 'tooling/uiproof/crops', pack);
    const sums = bucket.rows.map((r) => `${r.hex}  ${r.file}`).join('\n');
    const routes = [...new Set(bucket.rows.map((r) => r.spec.route))].join(', ');
    const fixtures = [...new Set(bucket.rows.map((r) => r.spec.fixture))].join(' | ');
    const tasks = [...new Set(bucket.rows.map((r) => r.spec.task))].join(' | ');
    const apis = [...new Set(bucket.rows.map((r) => r.spec.api))].join(' | ');
    const meta = [
      sums,
      '',
      `Rendered commit: ${SHA}`,
      `Route: ${routes}`,
      `Fixture: ${fixtures}`,
      'Browser: Chromium (Playwright) Chrome for Testing, chromiumSandbox false',
      'Viewports: 1440x900, 390x844',
      `Worktree: ${BRANCH}`,
      'Claim: BROWSER-PROVED / CLASS LOOK',
      `Task: ${tasks}`,
      `API/session behavior: ${apis}`,
      `Proof base: ${BASE}`,
      'Why new pack: look-money-states-v0 / bank-layer-a / pay-layer-a already hashed an older pass.',
    ].join('\n');
    writeFileSync(join(out, 'SHA256SUMS'), meta + '\n');
    console.log(meta);
    console.log('');
  }
} finally {
  await browser.close();
}

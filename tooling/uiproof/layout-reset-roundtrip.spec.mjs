/**
 * remaining-SOT §13.3 / §19.7.5 — browser round-trips for desk layout
 * save/reload/remount/Reset/account-switch, and ⌘K catalog navigation.
 * CLASS: TRUTH. Helper golden desk-prefs.golden.js is not this proof.
 */
import { test, expect, chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { proofBase } from './proof-base.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { bootShell } from './auth-fixture.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const BASE = proofBase(REPO_ROOT);
const { browsersPath, executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO_ROOT });

const ALICE_KEY = 'ix.desk.layout.v2:p-alice';
const BOB_KEY = 'ix.desk.layout.v2:p-bob';
const REQUIRED_CMDK = ['/quant', '/execution', '/ops', '/market', '/support', '/portfolio', '/predict', '/mining'];

/** Headless-shell SEGVs in this agent. Prefer full Chrome for Testing. */
function chromeForTesting(pathHint, fallback) {
  if (fallback && /Google Chrome for Testing|chrome-mac-arm64|chrome-linux/.test(fallback)) return fallback;
  const root = pathHint || process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return fallback;
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
  return fallback;
}

const launchExecutable = chromeForTesting(browsersPath, executablePath);

function jwtFor(subject) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ sub: subject })}.proof`;
}

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
  await page.addInitScript(() => {
    window.WebSocket = class ProofSocket {
      constructor() {
        setTimeout(() => this.onopen && this.onopen(), 0);
      }
      close() {
        if (this.onclose) this.onclose();
      }
    };
  });
  await page.route(
    (url) => isApiPath(new URL(url).pathname),
    async (route) => {
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
    },
  );
}

async function establishPrincipal(page, subject) {
  await page.evaluate(
    ({ token, member }) => {
      const root = document.querySelector('.page-view, .page-view2, .page-view3');
      if (root.__vue__.$i18n) root.__vue__.$i18n.locale = 'en';
      root.__vue__.$store.commit('setIxSession', {
        accessToken: token,
        userId: member.id,
      });
      root.__vue__.$store.commit('setMember', member);
    },
    {
      token: jwtFor(subject),
      member: { id: subject, username: subject, realName: subject, memberLevel: 1, status: 0 },
    },
  );
}

async function waitDesk(page) {
  await page.locator('.ix-terminal').waitFor({ state: 'attached', timeout: 20_000 });
  await page.getByRole('button', { name: 'Reset layout' }).waitFor({ state: 'visible', timeout: 20_000 });
}

async function rehydrate(page, subject) {
  await page.waitForFunction(() => {
    const root = document.querySelector('.page-view, .page-view2, .page-view3');
    return !!(root && root.__vue__ && root.__vue__.$store && root.__vue__.$root._isMounted);
  });
  await establishPrincipal(page, subject);
  await waitDesk(page);
}

async function openPalette(page) {
  await page.keyboard.press('Control+K');
  const input = page.locator('#ix-cmdk-input');
  try {
    await input.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    await page.keyboard.press('Meta+K');
    await input.waitFor({ state: 'visible', timeout: 8_000 });
  }
  return input;
}

async function cmdkGo(page, query, path) {
  const input = await openPalette(page);
  await input.fill(query);
  const active = page.locator('.ix-cmdk-item.is-active');
  await expect(active, `palette must offer ${path} for query "${query}"`).toBeVisible();
  await expect(active.locator('code')).toHaveText(path);
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.pathname === path, { timeout: 20_000 });
  await expect(page.locator('.ix-notfound-code'), `${path} must not 404`).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: '404' })).toHaveCount(0);
}

let browser;

test.beforeAll(async () => {
  if (!launchExecutable) {
    throw new Error('Chrome for Testing not found under PLAYWRIGHT_BROWSERS_PATH / ms-playwright cache');
  }
  const chromeHome = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-home');
  const chromeCrash = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-crash');
  mkdirSync(chromeHome, { recursive: true });
  mkdirSync(chromeCrash, { recursive: true });
  browser = await chromium.launch({
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
});

test.afterAll(async () => {
  if (browser) await browser.close();
});

async function newProofPage() {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  await mockDependenciesDown(page);
  return { context, page };
}

test('desk layout survives reload/remount, Reset, and principal switch', async () => {
  test.setTimeout(120_000);
  const { context, page } = await newProofPage();
  try {
    await bootShell(page, '/exchange/btc_usdt');
    await establishPrincipal(page, 'alice');
    await waitDesk(page);

    const fiveMinutes = page.getByRole('button', { name: '5m', exact: true });
    const oneHour = page.getByRole('button', { name: '1H', exact: true });
    const reset = page.getByRole('button', { name: 'Reset layout' });

    await expect(oneHour).toHaveClass(/is-active/);
    await fiveMinutes.click();
    await expect(fiveMinutes).toHaveClass(/is-active/);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.layout?.interval, ALICE_KEY)).toBe('5');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await rehydrate(page, 'alice');
    await expect(fiveMinutes).toHaveClass(/is-active/);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.layout?.interval, ALICE_KEY)).toBe('5');

    await page.evaluate(() => {
      const root = document.querySelector('.page-view, .page-view2, .page-view3');
      root.__vue__.$router.push('/platform');
    });
    await page.waitForURL((url) => url.pathname === '/platform', { timeout: 20_000 });
    await page.evaluate(() => {
      const root = document.querySelector('.page-view, .page-view2, .page-view3');
      root.__vue__.$router.push('/exchange/btc_usdt');
    });
    await page.waitForURL((url) => url.pathname === '/exchange/btc_usdt', { timeout: 20_000 });
    await waitDesk(page);
    await expect(fiveMinutes).toHaveClass(/is-active/);

    await reset.click();
    await expect(oneHour).toHaveClass(/is-active/);
    await expect(page.locator('.ix-layout-notice')).toContainText('Layout reset to defaults.');
    expect(await page.evaluate((key) => localStorage.getItem(key), ALICE_KEY)).toBeNull();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await rehydrate(page, 'alice');
    await expect(oneHour).toHaveClass(/is-active/);
    expect(await page.evaluate((key) => localStorage.getItem(key), ALICE_KEY)).toBeNull();

    await fiveMinutes.click();
    await expect(fiveMinutes).toHaveClass(/is-active/);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.layout?.interval, ALICE_KEY)).toBe('5');

    await establishPrincipal(page, 'bob');
    await waitDesk(page);
    await expect(oneHour).toHaveClass(/is-active/);
    expect(await page.evaluate((key) => localStorage.getItem(key), BOB_KEY)).toBeNull();
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).layout.interval, ALICE_KEY)).toBe('5');
  } finally {
    await context.close();
  }
});

test('⌘K catalog orphans navigate to /predict /mining /quant', async () => {
  test.setTimeout(90_000);
  const { context, page } = await newProofPage();
  try {
    await bootShell(page, '/exchange/btc_usdt');
    await establishPrincipal(page, 'alice');
    await waitDesk(page);

    const catalog = await page.evaluate(() =>
      (window.ixCmdPalette && window.ixCmdPalette.defaultCmdCatalog ? window.ixCmdPalette.defaultCmdCatalog() : []).map(
        (item) => item.path,
      ),
    );
    for (const path of REQUIRED_CMDK) {
      expect(catalog, `defaultCmdCatalog missing ${path}`).toContain(path);
    }

    await cmdkGo(page, 'predict', '/predict');
    await expect(page.getByRole('heading', { name: 'Custodial outcome book' })).toBeVisible();

    await cmdkGo(page, 'mining', '/mining');
    await expect(page.getByRole('heading', { name: 'Mining share submission' })).toBeVisible();

    await cmdkGo(page, 'quant', '/quant');
    await expect(page.getByRole('heading', { name: 'Quant sandbox' })).toBeVisible();
  } finally {
    await context.close();
  }
});

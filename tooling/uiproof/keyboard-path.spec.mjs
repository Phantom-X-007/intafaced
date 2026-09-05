/**
 * remaining-SOT §18.2-desk / M07-R08 — keyboard alternatives for EXISTING controls.
 * CLASS: TRUTH. No Vue/CSS/N4. Unique-port via pnpm ui:boot + proof-base. Never :8090.
 *
 * Covered here (existing controls only):
 * - pair drawer Esc (drawer.spec pattern)
 * - ticket type-tabs Limit → Market via keyboard (native buttons, not invented role=tab)
 * - lock-no-submit: Lock order entry via keyboard; Enter / X / forced click must not POST /orders
 *
 * Already covered — do not duplicate:
 * - ⌘K catalog + Reset round-trip: layout-reset-roundtrip.spec.mjs
 * - skip Enter → #route-main: proof.spec.mjs
 * - branded 404: proof.spec.mjs + route-boundary.spec.mjs
 *
 * OPEN (no keyboard path without LOOK chrome — do not invent a button):
 * - Touch alternatives on the desk (LOOK)
 * - Named AT (VoiceOver/TalkBack) — not this file
 * - Chart Fit/Follow keyboard (#3679 is not this)
 * - Drag-reprice keyboard alternative (SOCKET / Advanced Charts)
 */
import { test, expect, chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { proofBase } from './proof-base.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { bootShell, establishAuth } from './auth-fixture.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const BASE = proofBase(REPO_ROOT);
const { browsersPath, executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO_ROOT });

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

/** Reachable-empty open orders so R11 recovery-lock is not the submit block. */
async function mockOpenOrdersEmpty(page) {
  await page.route('**/api/v1/orders/open**', async (route) => {
    if (isSpaAsset(route) || route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify([]),
    });
  });
}

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

async function newProofPage(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport,
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  await mockDependenciesDown(page);
  return { context, page };
}

test('pair drawer Esc-closes and restores trigger focus @ 390', async () => {
  test.setTimeout(90_000);
  const { context, page } = await newProofPage({ width: 390, height: 844 });
  try {
    await bootShell(page, '/exchange/btc_usdt');
    const { trigger, drawer } = await openDrawer(page);
    await expect(drawer).toHaveClass(/is-open/);

    await page.keyboard.press('Escape');
    await expect(drawer).not.toHaveClass(/is-open/);
    await expect(trigger).toBeFocused();
  } finally {
    await context.close();
  }
});

test('ticket type-tabs switch Limit → Market via keyboard', async () => {
  test.setTimeout(90_000);
  const { context, page } = await newProofPage();
  try {
    await bootShell(page, '/exchange/btc_usdt');
    await page.locator('.ix-type-tabs').waitFor({ state: 'visible', timeout: 20_000 });

    const limit = page.locator('.ix-type-tabs button').filter({ hasText: /^Limit$/ });
    const market = page.locator('.ix-type-tabs button').filter({ hasText: /^Market$/ });
    await expect(limit).toHaveClass(/is-active/);

    await market.focus();
    await expect(market).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(market).toHaveClass(/is-active/);
    await expect(limit).not.toHaveClass(/is-active/);
  } finally {
    await context.close();
  }
});

test('order-entry lock: keyboard lock, Enter/X/forced-click do not POST /orders', async () => {
  test.setTimeout(90_000);
  const { context, page } = await newProofPage();
  try {
    await mockOpenOrdersEmpty(page);
    await bootShell(page, '/exchange/btc_usdt');
    await establishAuth(page);
    await page.locator('.ix-terminal').waitFor({ state: 'attached', timeout: 20_000 });
    await page.getByRole('button', { name: 'Lock order entry' }).waitFor({ state: 'visible', timeout: 20_000 });

    await page.evaluate(() => {
      const desk = document.querySelector('.ix-terminal') && document.querySelector('.ix-terminal').__vue__;
      if (desk) desk.openOrdersReachable = true;
    });

    const lock = page.getByRole('button', { name: 'Lock order entry' });
    await lock.focus();
    await expect(lock).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'Unlock order entry' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ix-desk-banner-lock')).toContainText('Order entry is locked.');

    const submit = page.locator('button.ix-submit');
    await expect(submit).toBeDisabled();

    let posted = false;
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/orders(?:\?|$)/.test(req.url())) posted = true;
    });

    const amount = page.locator('#ix-ticket-amount');
    if (await amount.count()) {
      await amount.focus();
      await page.keyboard.press('Enter');
    }
    await page.keyboard.press('x');
    await submit.click({ force: true }).catch(() => {});

    expect(posted, 'order-entry lock must not POST /orders').toBe(false);
  } finally {
    await context.close();
  }
});

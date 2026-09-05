/**
 * remaining-SOT §12.3 / R08 NOW — 320 CSS px whole-page reflow falsifier.
 * CLASS: TRUTH. Does not restyle Vue/CSS (LOOK).
 *
 * Decision: can I use the screen at 320 without sideways-only content.
 * Authority: CSS layout. States: fits / overflows (named route id).
 * Falsifier: document.documentElement.scrollWidth > clientWidth + 1
 *
 * Fixture F1: anonymous + xhr/fetch 503 only. Never intercept the SPA document.
 * Unique-port via pnpm ui:boot / proof-base. Never :8090.
 *
 * 400% zoom — SOURCE-READ @playwright/test 1.62 Page: no page.setZoom.
 * CSS `zoom` scales paint without shrinking the CSS viewport, so it is not
 * WCAG 1.4.10. 1280 CSS px at 400% ≡ 320 CSS px width; this family loop is
 * that test. Do not fake a zoom gesture.
 */
import { test, expect, chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { proofBase } from './proof-base.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { bootShell } from './auth-fixture.mjs';
import { TIER_B_ROUTES, TIER_B_VIEWPORTS } from './matrix.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const BASE = proofBase(REPO_ROOT);
const { browsersPath, executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO_ROOT });

const PHONE_SMALL = TIER_B_VIEWPORTS.find((viewport) => viewport.name === 'phone-small');
if (!PHONE_SMALL || PHONE_SMALL.width !== 320 || PHONE_SMALL.height !== 720) {
  throw new Error(`TIER_B_VIEWPORTS phone-small must be 320×720 for remaining-SOT §12.3 (got ${JSON.stringify(PHONE_SMALL)})`);
}

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

/** Fixture F1 — xhr/fetch 503. Document/script/css continue. */
async function mockDependenciesDown(page) {
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
    viewport: { width: PHONE_SMALL.width, height: PHONE_SMALL.height },
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  await mockDependenciesDown(page);
  return { context, page };
}

async function waitMounted(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('.page-view, .page-view2, .page-view3');
    const boundary = document.querySelector('.ix-route-boundary-host');
    const vueReady = !!(root && root.__vue__ && root.__vue__.$root && root.__vue__.$root._isMounted);
    const routeReady = !boundary || boundary.getAttribute('data-status') === 'ready';
    return vueReady && routeReady;
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });
}

for (const route of TIER_B_ROUTES) {
  test(`${route.layoutFamily} (${route.id}) reflow @ 320×720`, async () => {
    test.setTimeout(90_000);
    const { context, page } = await newProofPage();
    try {
      await bootShell(page, route.path);
      await waitMounted(page);
      const overflow = await measureOverflow(page);
      expect(
        overflow.scrollWidth <= overflow.clientWidth + 1,
        `320 reflow overflow on ${route.layoutFamily} (${route.id} ${route.path}): ${overflow.scrollWidth}px > ${overflow.clientWidth}px`,
      ).toBeTruthy();
    } finally {
      await context.close();
    }
  });
}

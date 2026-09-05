/**
 * remaining-SOT §12.3 / R08 — 768 and 1024 reflow falsifier.
 * CLASS: TRUTH. Companion to reflow-320.spec.mjs. Does not restyle.
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

const TABLET = TIER_B_VIEWPORTS.filter((v) => v.name === 'tablet' || v.name === 'tablet-wide');
if (TABLET.length !== 2) {
  throw new Error(`need tablet 768 and tablet-wide 1024, got ${JSON.stringify(TABLET)}`);
}

function chromeForTesting(pathHint, fallback) {
  if (fallback && /Google Chrome for Testing|chrome-mac-arm64/.test(fallback)) return fallback;
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
  return route.request().resourceType() !== 'xhr' && route.request().resourceType() !== 'fetch';
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
        body: JSON.stringify({ code: 'ExchangeNotAvailable', message: 'UI proof fixture: dependencies down' }),
      });
    },
  );
}

let browser;
test.beforeAll(async () => {
  const chromeHome = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-home');
  const chromeCrash = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-crash');
  mkdirSync(chromeHome, { recursive: true });
  mkdirSync(chromeCrash, { recursive: true });
  browser = await chromium.launch({
    executablePath: launchExecutable,
    headless: true,
    chromiumSandbox: false,
    env: { ...process.env, HOME: chromeHome, XDG_CONFIG_HOME: join(chromeHome, 'config'), XDG_CACHE_HOME: join(chromeHome, 'cache') },
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

for (const viewport of TABLET) {
  for (const route of TIER_B_ROUTES) {
    test(`${route.layoutFamily} (${route.id}) reflow @ ${viewport.width}×${viewport.height}`, async () => {
      test.setTimeout(90_000);
      const context = await browser.newContext({
        baseURL: BASE,
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const page = await context.newPage();
      await mockDependenciesDown(page);
      try {
        await bootShell(page, route.path);
        await page.waitForFunction(() => {
          const root = document.querySelector('.page-view, .page-view2, .page-view3');
          const boundary = document.querySelector('.ix-route-boundary-host');
          const vueReady = !!(root && root.__vue__ && root.__vue__.$root && root.__vue__.$root._isMounted);
          const routeReady = !boundary || boundary.getAttribute('data-status') === 'ready';
          return vueReady && routeReady;
        });
        const overflow = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(
          overflow.scrollWidth <= overflow.clientWidth + 1,
          `${viewport.name} reflow overflow on ${route.layoutFamily} (${route.path}): ${overflow.scrollWidth}px > ${overflow.clientWidth}px`,
        ).toBeTruthy();
      } finally {
        await context.close();
      }
    });
  }
}

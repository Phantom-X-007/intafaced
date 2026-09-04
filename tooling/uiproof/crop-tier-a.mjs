#!/usr/bin/env node
/**
 * remaining-SOT §19.7.1 / §15.2 Tier A — every member route at 1440 and 390.
 * 89 routes × 2 viewports = 178 cells. Hashed PNGs, not policy-only #3676.
 *
 *   pnpm ui:boot   # unique port; never :8090
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-tier-a.mjs
 *
 * Fixture F1: anonymous + xhr/fetch 503. Never intercept the SPA document.
 * Resumes packs that already have both viewports hashed.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { proofBase } from './proof-base.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';
import { bootShell } from './auth-fixture.mjs';
import { TIER_A_VIEWPORTS } from './matrix.mjs';
import { MEMBER_ROUTE_AUTHORITY } from './route-authority.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const BRANCH = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const BASE = proofBase(REPO_ROOT);
const { browsersPath, executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO_ROOT });
const PACK = 'look-tier-a-f1';
const OUT = join(REPO_ROOT, 'tooling/uiproof/crops', PACK);

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

function existingHashes() {
  const found = new Map();
  if (!existsSync(OUT)) return found;
  for (const name of readdirSync(OUT)) {
    const m = name.match(/^(.+)__(desktop|mobile)-[0-9a-f]{12}\.png$/);
    if (m) found.set(`${m[1]}__${m[2]}`, name);
  }
  return found;
}

async function cropOne(browser, route, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(45_000);
  await mockDependenciesDown(page);
  try {
    await bootShell(page, BASE + route.path);
  } catch (err) {
    const body = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    await context.close();
    throw new Error(`${route.id} ${viewport.name} boot failed: ${err.message}\nBODY:\n${body.slice(0, 800)}`);
  }
  await page.waitForTimeout(400);
  const png = await page.screenshot({ type: 'png', fullPage: false });
  await context.close();
  const hex = createHash('sha256').update(png).digest('hex');
  const file = `${route.id}__${viewport.name}-${hex.slice(0, 12)}.png`;
  return { file, hex, png, viewport: viewport.name, route };
}

const chromeHome = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-home');
const chromeCrash = join(REPO_ROOT, '.artifacts', 'uiproof', 'chrome-crash');
mkdirSync(chromeHome, { recursive: true });
mkdirSync(chromeCrash, { recursive: true });
mkdirSync(OUT, { recursive: true });

const expected = MEMBER_ROUTE_AUTHORITY.length * TIER_A_VIEWPORTS.length;
if (expected !== 178) {
  throw new Error(
    `Tier A cell count drifted: ${MEMBER_ROUTE_AUTHORITY.length} routes × ${TIER_A_VIEWPORTS.length} = ${expected}, remaining-SOT names 178`,
  );
}

const already = existingHashes();
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

const rows = [];
const failures = [];

try {
  for (const route of MEMBER_ROUTE_AUTHORITY) {
    for (const viewport of TIER_A_VIEWPORTS) {
      const key = `${route.id}__${viewport.name}`;
      if (already.has(key)) {
        const name = already.get(key);
        const png = readFileSync(join(OUT, name));
        const hex = createHash('sha256').update(png).digest('hex');
        rows.push({ file: name, hex, viewport: viewport.name, route });
        console.log(`skip ${key} ${name}`);
        continue;
      }
      try {
        const row = await cropOne(browser, route, viewport);
        writeFileSync(join(OUT, row.file), row.png);
        rows.push(row);
        console.log(`${key} ${row.file}`);
      } catch (err) {
        failures.push(`${key}: ${err.message}`);
        console.error(`FAIL ${key}\n${err.message}`);
      }
    }
  }
} finally {
  await browser.close();
}

const sums = rows
  .slice()
  .sort((a, b) => a.file.localeCompare(b.file))
  .map((r) => `${r.hex}  ${r.file}`)
  .join('\n');
const meta = [
  sums,
  '',
  `Rendered commit: ${SHA}`,
  `Routes: ${MEMBER_ROUTE_AUTHORITY.length}`,
  `Cells hashed: ${rows.length} / ${expected}`,
  'Fixture: F1 anonymous + dependencies down',
  'Browser: Chromium (Playwright) Chrome for Testing',
  'Viewports: 1440x900 desktop, 390x844 mobile',
  `Worktree: ${BRANCH}`,
  'Claim: BROWSER-PROVED / CLASS LOOK — Tier A navigation crops, not WCAG/AT/taste',
  'Task: every member route mounts at 1440 and 390 without a seeded ledger.',
  'API/session behavior: anonymous; xhr/fetch /api /uc /market /otc /exchange return HTTP 503; SPA document never intercepted; no values or fills seeded.',
  `Proof base: ${BASE}`,
].join('\n');
writeFileSync(join(OUT, 'SHA256SUMS'), `${meta}\n`);
console.log(meta);

if (failures.length) {
  writeFileSync(join(OUT, 'FAILURES.txt'), `${failures.join('\n')}\n`);
  throw new Error(`${failures.length} Tier-A cells failed. See ${join(OUT, 'FAILURES.txt')}`);
}
if (rows.length !== expected) {
  throw new Error(`hashed ${rows.length} of ${expected} Tier-A cells`);
}
console.log(`uiproof crop-tier-a: ${rows.length} cells ok`);

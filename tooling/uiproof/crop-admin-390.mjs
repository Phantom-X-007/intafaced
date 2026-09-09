#!/usr/bin/env node
/**
 * Hashed 1440+390 crops for remaining-SOT 390 composition on apps/admin
 * operator queues (`/tools`). Unique port. Never :8090 / :3100. Blank BFF.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-admin-390.mjs
 */
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const HOST = '127.0.0.1';
const OUT = join(REPO, 'tooling/uiproof/crops/look-admin-390');
const browsers = applyPlaywrightBrowsersEnv({ repoRoot: REPO });
const cft = join(
  process.env.HOME || '',
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const shell = join(
  process.env.HOME || '',
  'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',
);
// Headless shell is the same CFT revision. Full CFT crashpad-SEGVs when HOME
// cannot write ~/Library/Application Support/Google/Chrome for Testing.
const executablePath = existsSync(shell) ? shell : existsSync(cft) ? cft : browsers.executablePath;

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440x900' },
  { w: 390, h: 844, name: '390x844' },
];

function fail(msg) {
  throw new Error(msg);
}

function resolvePnpm() {
  for (const dir of (process.env.PATH || '').split(':')) {
    const cand = join(dir, 'pnpm');
    if (dir && existsSync(cand)) return cand;
  }
  const pinned = join(REPO, '.tools', 'bin', 'pnpm');
  if (existsSync(pinned)) return pinned;
  const door = '/Users/Nitro/projects/Sovereign/.tools/bin/pnpm';
  if (existsSync(door)) return door;
  fail('pnpm not on PATH');
}

function buildAdminWorkspaceDeps() {
  const dists = ['config', 'contracts', 'i18n', 'ui'].map((name) => join(REPO, 'packages', name, 'dist', 'index.js'));
  if (dists.every((p) => existsSync(p))) return;
  execFileSync(resolvePnpm(), ['--filter', '@intafaced/admin^...', 'build'], {
    cwd: REPO,
    env: process.env,
    stdio: 'inherit',
  });
  const missing = dists.filter((p) => !existsSync(p));
  if (missing.length) fail(`workspace dist still missing: ${missing.join(', ')}`);
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function httpJson(url) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 240);
  }
  return { status: res.status, body };
}

async function waitReady(base, deadline = Date.now() + 180_000) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/tools`, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
      if (res.status === 200) return true;
      console.log(`waiting /tools → ${res.status}`);
    } catch (err) {
      console.log(`waiting /tools → ${err instanceof Error ? err.message : err}`);
    }
    await sleep(1_500);
  }
  return false;
}

buildAdminWorkspaceDeps();

const port = await allocatePort();
if (port === 8090 || port === 3100) {
  console.error('refusing default ports');
  process.exit(1);
}
const base = `http://${HOST}:${port}`;
const nextBin = join(REPO, 'apps/admin/node_modules/next/dist/bin/next');
const nextFallback = join(REPO, 'node_modules/.bin/next');
const nextPath = existsSync(nextBin) ? nextBin : nextFallback;
const nodeBin = process.execPath;

const childEnv = { ...process.env };
for (const key of ['ADMIN_BFF_SHARED_SECRET', 'EDGE_URL', 'ADMIN_OPERATOR_TOKEN', 'ADMIN_TREASURY_TOKEN', 'ADMIN_BFF_HARNESS_URL']) {
  delete childEnv[key];
}
childEnv.PATH = `${dirname(nodeBin)}:${join(REPO, 'node_modules/.bin')}:${childEnv.PATH || ''}`;
childEnv.PORT = String(port);

console.log(`booting admin next ${nextPath} on ${base}`);
const child = spawn(nodeBin, [nextPath, 'dev', '--port', String(port), '--hostname', HOST], {
  cwd: join(REPO, 'apps/admin'),
  env: childEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => {
  const s = d.toString();
  log += s;
  process.stdout.write(s);
});
child.stderr.on('data', (d) => {
  const s = d.toString();
  log += s;
  process.stderr.write(s);
});

function shutdown() {
  try {
    child.kill('SIGTERM');
  } catch {
    /* already gone */
  }
}
process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(1);
});

try {
  const ready = await waitReady(base);
  if (!ready) {
    console.error('admin did not become ready\n' + log.slice(-2000));
    process.exit(1);
  }

  const kill = await httpJson(`${base}/api/kill-switch`);
  const tools = await httpJson(`${base}/api/operator-tools`);
  console.log(`GET /api/kill-switch → ${kill.status} ${JSON.stringify(kill.body)}`);
  console.log(`GET /api/operator-tools → ${tools.status} ${JSON.stringify(tools.body)}`);
  if (kill.status !== 503 || kill.body?.code !== 'admin.bff_gate_unconfigured') {
    throw new Error(`blank-env kill-switch must 503 unconfigured, got ${kill.status} ${JSON.stringify(kill.body)}`);
  }
  if (tools.status !== 503 || tools.body?.code !== 'admin.bff_gate_unconfigured') {
    throw new Error(`blank-env operator-tools must 503 unconfigured, got ${tools.status} ${JSON.stringify(tools.body)}`);
  }

  const cropHome = join(REPO, '.artifacts', 'uiproof', 'chrome-home');
  const cropCrash = join(REPO, '.artifacts', 'uiproof', 'chrome-crash');
  mkdirSync(join(cropHome, 'Library/Application Support/Google/Chrome for Testing/Crashpad'), { recursive: true });
  mkdirSync(cropCrash, { recursive: true });
  const browser = await chromium.launch({
    executablePath: executablePath || undefined,
    headless: true,
    chromiumSandbox: false,
    env: {
      ...process.env,
      HOME: cropHome,
      XDG_CONFIG_HOME: join(cropHome, 'config'),
      XDG_CACHE_HOME: join(cropHome, 'cache'),
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-crash-reporter',
      '--disable-breakpad',
      `--crash-dumps-dir=${cropCrash}`,
    ],
  });
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  const version = browser.version();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${base}/tools`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.getByRole('heading', { name: 'Daily queues' }).waitFor({ timeout: 15_000 });
      await page.getByText('NOT MOUNTED', { exact: true }).first().waitFor({ timeout: 15_000 });
      await page.getByText('Withdrawal approvals', { exact: true }).waitFor({ timeout: 15_000 });

      const body = await page.locator('body').innerText();
      if (!body.includes('UNAVAILABLE')) throw new Error(`${vp.name}: missing UNAVAILABLE`);
      if (!body.includes('NOT MOUNTED')) throw new Error(`${vp.name}: missing NOT MOUNTED`);
      if (!body.includes('Withdrawal approvals')) throw new Error(`${vp.name}: missing withdrawal lane`);
      if (/\bApprove\b/.test(body) && !body.includes('Approval unavailable')) {
        throw new Error(`${vp.name}: crop contains Approve without unavailable label`);
      }
      const enabledApprove = await page.locator('button:enabled', { hasText: /^Approve$/ }).count();
      if (enabledApprove !== 0) throw new Error(`${vp.name}: enabled Approve button present`);
      if (body.includes('Review approval') && !body.includes('Approval unavailable')) {
        throw new Error(`${vp.name}: Review approval visible on blank-env refuse`);
      }

      const metrics = await page.evaluate(() => {
        const docOverflow = document.documentElement.scrollWidth - window.innerWidth;
        const navItems = [...document.querySelectorAll('.adm-nav a')].map((a) => {
          const r = a.getBoundingClientRect();
          return {
            text: a.textContent.trim(),
            clipped: r.right > window.innerWidth + 1 || r.left < -1 || r.bottom > window.innerHeight + 1,
          };
        });
        const topbar = document.querySelector('.adm-topbar');
        const topCs = topbar ? getComputedStyle(topbar) : null;
        const topBg = topCs?.backgroundColor ?? '';
        const opaque = /^rgb\(0,\s*0,\s*0\)$/.test(topBg) || /^rgba\(0,\s*0,\s*0,\s*1\)$/.test(topBg);
        const catalog = [...document.querySelectorAll('.adm-tools-page .if-panel')].slice(0, 8).map((el) => ({
          radius: getComputedStyle(el).borderRadius,
          blur: getComputedStyle(el).backdropFilter,
        }));
        const titles = [...document.querySelectorAll('.if-panel__title, h1, h2')].map((el) => getComputedStyle(el).color);
        return { docOverflow, navItems, topBg, opaque, catalog, titles };
      });

      if (metrics.docOverflow > 1) throw new Error(`${vp.name}: horizontal overflow ${metrics.docOverflow}px`);
      const clipped = metrics.navItems.filter((n) => n.clipped);
      if (clipped.length) throw new Error(`${vp.name}: nav clipped ${clipped.map((n) => n.text).join(', ')}`);
      if (!metrics.opaque) throw new Error(`${vp.name}: sticky topbar not opaque black (${metrics.topBg})`);
      const rounded = metrics.catalog.filter((p) => p.radius && p.radius !== '0px');
      if (rounded.length) throw new Error(`${vp.name}: catalog/queue panel still rounded ${JSON.stringify(rounded)}`);
      const orange = metrics.titles.filter((c) => {
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return false;
        const r = Number(m[1]);
        const g = Number(m[2]);
        const b = Number(m[3]);
        return r > 160 && g > 70 && g < 180 && b < 80;
      });
      if (orange.length) throw new Error(`${vp.name}: orange identity title ${orange.join(', ')}`);

      const queuesPng = await page.screenshot({ type: 'png', fullPage: false });
      const queuesHex = createHash('sha256').update(queuesPng).digest('hex');
      const queuesFile = `look-admin-queues-f4-explicitly-refused-not-built-${queuesHex.slice(0, 12)}-${vp.name}.png`;
      writeFileSync(join(OUT, queuesFile), queuesPng);
      rows.push({ file: queuesFile, hex: queuesHex, viewport: vp.name, shot: 'queues' });
      console.log(`wrote ${queuesFile} ${queuesHex}`);

      const catalogTitle = page.getByRole('heading', { name: 'Identity & compliance' });
      await catalogTitle.waitFor({ timeout: 15_000 });
      await catalogTitle.scrollIntoViewIfNeeded();
      await sleep(200);

      const bleed = await page.evaluate(() => {
        const top = document.querySelector('.adm-topbar');
        if (!top) return { bleed: true, reason: 'no topbar' };
        const tr = top.getBoundingClientRect();
        const sample = document.elementFromPoint(24, Math.round(tr.bottom / 2));
        const inTop = !!(sample && sample.closest('.adm-topbar'));
        return { bleed: !inTop, sample: sample ? sample.className.toString().slice(0, 80) : null };
      });
      if (bleed.bleed) throw new Error(`${vp.name}: scrolled content visible through sticky topbar (${bleed.sample})`);

      const catalogPng = await page.screenshot({ type: 'png', fullPage: false });
      const catalogHex = createHash('sha256').update(catalogPng).digest('hex');
      const catalogFile = `look-admin-tools-catalog-f4-explicitly-refused-not-built-${catalogHex.slice(0, 12)}-${vp.name}.png`;
      writeFileSync(join(OUT, catalogFile), catalogPng);
      rows.push({ file: catalogFile, hex: catalogHex, viewport: vp.name, shot: 'catalog' });
      console.log(`wrote ${catalogFile} ${catalogHex}`);

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const sums = rows.map((r) => `${r.hex}  ${r.file}`).join('\n');
  const meta = [
    sums,
    '',
    `Rendered commit: ${SHA}`,
    'Route: /tools (apps/admin operator console — not the member shell)',
    'Fixture: F4 explicitly refused / not built — ADMIN_BFF_SHARED_SECRET blank; EDGE_URL and operator tokens unset',
    'Browser: Chromium (Playwright) Chrome for Testing headless shell, chromiumSandbox false',
    `Browser version: Chromium ${version} · @playwright/test 1.62.1`,
    'Viewports: 1440x900 · 390x844',
    'Worktree: feat/look-admin-390-on-keep',
    'Claim: BROWSER-PROVED / CLASS LOOK — 390 wrap on operator queues; KEEP #FF6B00 on nav; catalog titles grey; withdrawal NOT MOUNTED',
    'User task: remaining-SOT §11 / §20.6 — believe queue unavailable vs unmounted at 390; nav not clipped; topbar opaque; catalog titles not identity orange',
    'API/session behavior: blank env; GET /api/kill-switch and GET /api/operator-tools return HTTP 503 admin.bff_gate_unconfigured; no users/orders/finance rows seeded',
    `Proof base: ${base}`,
  ].join('\n');
  writeFileSync(join(OUT, 'SHA256SUMS'), `${meta}\n`);
  console.log(meta);
} finally {
  shutdown();
  await sleep(500);
}

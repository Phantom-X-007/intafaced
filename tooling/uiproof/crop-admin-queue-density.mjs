#!/usr/bin/env node
/**
 * Hashed 1440+390 crops for apps/admin operator queues (remaining-SOT §20.6).
 * Boots the existing admin Next app on a unique port. Never :8090. Blank BFF.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright \
 *     node tooling/uiproof/crop-admin-queue-density.mjs
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
const OUT = join(REPO, 'tooling/uiproof/crops/look-admin-queue-density');
const browsers = applyPlaywrightBrowsersEnv({ repoRoot: REPO });
const cft = join(
  process.env.HOME || '',
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const executablePath = existsSync(cft) ? cft : browsers.executablePath;

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440x900' },
  { w: 390, h: 844, name: '390x844' },
];

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
      const res = await fetch(`${base}/tools`, { redirect: 'manual', signal: AbortSignal.timeout(4_000) });
      if (res.status === 200) return true;
      console.log(`waiting /tools → ${res.status}`);
    } catch (err) {
      console.log(`waiting /tools → ${err instanceof Error ? err.message : err}`);
    }
    await sleep(1_500);
  }
  return false;
}

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

  const cropHome = join('/tmp', `pw-home-${process.pid}`);
  mkdirSync(join(cropHome, 'Library/Application Support'), { recursive: true });
  mkdirSync(join(cropHome, 'crash'), { recursive: true });
  const browser = await chromium.launch({
    executablePath: executablePath || undefined,
    headless: true,
    env: { ...process.env, HOME: cropHome },
    args: ['--disable-gpu', `--crash-dumps-dir=${join(cropHome, 'crash')}`],
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
        // live KYC actions would be a live table; blank env must not show them
        throw new Error(`${vp.name}: Review approval visible on blank-env refuse`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) throw new Error(`${vp.name}: horizontal overflow ${overflow}px`);

      const png = await page.screenshot({ type: 'png', fullPage: false });
      await context.close();
      const hex = createHash('sha256').update(png).digest('hex');
      const short = hex.slice(0, 12);
      const file = `look-admin-queues-f4-explicitly-refused-not-built-${short}-${vp.name}.png`;
      writeFileSync(join(OUT, file), png);
      rows.push({ file, hex, viewport: vp.name });
      console.log(`wrote ${file} ${hex}`);
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
    'Browser: Chromium (Playwright) Chrome for Testing',
    `Browser version: Chromium ${version} · @playwright/test 1.62.1`,
    'Viewports: 1440x900 · 390x844',
    'Worktree: feat/look-admin-queue-density',
    'Claim: BROWSER-PROVED / CLASS LOOK — admin queue N4 density; withdrawal stays NOT MOUNTED',
    'User task: remaining-SOT §20.6 admin queue look — density/N4; no glass; no orange identity',
    'API/session behavior: blank env; GET /api/kill-switch and GET /api/operator-tools return HTTP 503 admin.bff_gate_unconfigured; no users/orders/finance rows seeded',
    `Proof base: ${base}`,
  ].join('\n');
  writeFileSync(join(OUT, 'SHA256SUMS'), `${meta}\n`);
  console.log(meta);
} finally {
  shutdown();
  await sleep(500);
}

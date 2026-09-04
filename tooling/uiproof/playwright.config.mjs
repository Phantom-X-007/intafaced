/**
 * Playwright config for Stream A uiproof.
 * boot.mjs owns the server — do NOT use webServer here.
 */
import { defineConfig } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { proofBase } from './proof-base.mjs';
import { applyPlaywrightBrowsersEnv } from './playwright-browsers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let REPO_ROOT;
try {
  REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
} catch {
  REPO_ROOT = join(__dirname, '..', '..');
}

const BASE = proofBase(REPO_ROOT);
const ARTIFACTS = join(REPO_ROOT, '.artifacts', 'uiproof');
const COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const { executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: REPO_ROOT });

export default defineConfig({
  metadata: { commit: COMMIT },
  testDir: __dirname,
  // proof.spec = B matrix; auth.spec = Pass 3. Scripts pass explicit files.
  testMatch: /.*\.spec\.mjs$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: join(ARTIFACTS, 'playwright-report.json') }]],
  outputDir: join(ARTIFACTS, 'test-results'),
  use: {
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'off', // we take full-page shots ourselves with deterministic names
    video: 'off',
    trace: 'off',
    // Agent sandboxes + some macOS environments SEGV Chromium under the default
    // sandbox. Non-sandbox is required for unattended PROOF (Nitro standing order).
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  },
  // Lab stays chromium-only. Named engines (Firefox/WebKit) live in
  // browser-support.mjs — remaining-SOT §12.6 / §19.7.8. Do not enable those
  // projects here until a later field/lab change; presence in the policy is
  // not an install, and Axe/WCAG are not browser certification.
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

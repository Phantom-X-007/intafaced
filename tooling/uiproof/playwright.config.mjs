/**
 * Playwright config for Stream A uiproof.
 * boot.mjs owns the server — do NOT use webServer here.
 */
import { defineConfig } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
let REPO_ROOT;
try {
  REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
} catch {
  REPO_ROOT = join(__dirname, '..', '..');
}

const PORT = process.env.PORT || '8090';
const BASE = process.env.UIPROOF_BASE || `http://127.0.0.1:${PORT}`;
const ARTIFACTS = join(REPO_ROOT, '.artifacts', 'uiproof');

// Prefer repo-local browsers (agents cannot always write ~/Library/Caches).
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(REPO_ROOT, '.tools', 'ms-playwright');
}

export default defineConfig({
  testDir: __dirname,
  testMatch: 'proof.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: join(ARTIFACTS, 'playwright-report.json') }],
  ],
  outputDir: join(ARTIFACTS, 'test-results'),
  use: {
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'off', // we take full-page shots ourselves with deterministic names
    video: 'off',
    trace: 'off',
  },
  // chromium only for PR-2
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
